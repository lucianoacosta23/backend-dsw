import { Follow } from '../follows/follow.entity.js';
import { ReviewLike } from '../likes/like.entity.js';
import { PlaylistSave } from '../playlist/playlist-save.entity.js';
import { UserFavoriteRelease } from '../profiles/user-favorite-release.entity.js';
import { UserFavoriteTrack } from '../profiles/user-favorite-track.entity.js';
import { LockMode, RequestContext, type EntityManager } from '@mikro-orm/core';
import { AppError } from '../../shared/errors/app-error.js';
import { Review } from '../reviews/review.entity.js';
import { ReviewReport } from '../reports/report.entity.js';
import { Playlist } from '../playlist/playlist.entity.js';
import { Comment } from '../comments/comment.entity.js';
import { User } from './user.entity.js';
import { UserSanction, type ReviewEvidence } from './user-sanction.entity.js';
import { effectiveUserStatus, suspensionEnd } from './user-status.js';
import { assertAccountEnabled } from './account-access.js';
import type { SanctionInput } from './user-sanction.validation.js';

export interface AdminPagination { page: number; pageSize: number }
export interface AdminUserQuery extends AdminPagination { q: string }

function manager() {
  const em = RequestContext.getEntityManager();
  if (!em) throw new Error('No hay un contexto de base de datos activo');
  return em;
}

function sanctionResponse(entry: UserSanction) {
  return {
    id: entry.id!, action: entry.action, reason: entry.reason, createdAt: entry.createdAt,
    suspendedUntil: entry.suspendedUntil,
    administrator: { id: entry.administrator.id!, username: entry.administrator.username },
  };
}

export class AdminUserRepository {
  constructor(private readonly now: () => Date = () => new Date()) {}

  private async user(id: number, em = manager()) {
    const user = await em.findOne(User, { id });
    if (!user) throw new AppError('Usuario no encontrado', 404);
    return user;
  }

  async list(input: AdminUserQuery) {
    const em = manager();
    const escaped = input.q.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    const condition = "(u.username ILIKE ? ESCAPE '\\' OR u.full_name ILIKE ? ESCAPE '\\')";
    const totals: Array<{ total: number }> = await em.getConnection().execute(
      `SELECT COUNT(*)::int AS total FROM "user" u WHERE ${condition}`, [pattern, pattern],
    );
    const rows: Array<{ id: number; username: string; full_name: string; status: User['status']; suspended_until: Date | string | null; pending_count: number; critical_count: number }> =
      await em.getConnection().execute(
        `WITH per_review AS (
          SELECT r.id, r.author_id, COUNT(rr.id)::int AS report_count
          FROM review r JOIN review_report rr ON rr.review_id = r.id
          JOIN "user" reporter ON reporter.id = rr.reporter_id
          WHERE r.deleted_at IS NULL AND rr.status = 'PENDING'
            AND rr.reporter_id <> r.author_id
            AND (reporter.status = 'ENABLED' OR (reporter.status = 'SUSPENDED' AND reporter.suspended_until <= ?))
          GROUP BY r.id, r.author_id
        ), counts AS (
          SELECT author_id, SUM(report_count)::int AS pending_count,
            COUNT(*) FILTER (WHERE report_count >= 3)::int AS critical_count
          FROM per_review GROUP BY author_id
        )
        SELECT u.id, u.username, u.full_name, u.status, u.suspended_until,
          COALESCE(c.pending_count, 0)::int AS pending_count,
          COALESCE(c.critical_count, 0)::int AS critical_count
        FROM "user" u LEFT JOIN counts c ON c.author_id = u.id
        WHERE ${condition}
        ORDER BY critical_count DESC, pending_count DESC, u.username ASC, u.id ASC
        LIMIT ? OFFSET ?`,
        [this.now(), pattern, pattern, input.pageSize, (input.page - 1) * input.pageSize],
      );
    return {
      items: rows.map(row => {
        const until = row.suspended_until ? new Date(row.suspended_until) : null;
        const status = effectiveUserStatus({ status: row.status, suspendedUntil: until }, this.now());
        return { id: row.id, username: row.username, fullName: row.full_name, status,
          suspendedUntil: status === 'SUSPENDED' ? until : null,
          pendingReportCount: Number(row.pending_count), criticalReviewCount: Number(row.critical_count) };
      }),
      total: Number(totals[0]?.total ?? 0),
    };
  }

  private async liveEvidence(user: User, em: EntityManager): Promise<ReviewEvidence[]> {
    const reviews = await em.find(Review, { author: user.id! }, { orderBy: { id: 'DESC' } });
    if (reviews.length === 0) return [];
    const reports = await em.find(ReviewReport, { review: { $in: reviews.map(review => review.id!) } }, {
      populate: ['reporter'], orderBy: { createdAt: 'ASC', id: 'ASC' },
    });
    return reviews.map(review => {
      const received = reports.filter(report => report.review.id === review.id);
      const valid = received.filter(report => report.status === 'PENDING' && report.reporter.id !== user.id && effectiveUserStatus(report.reporter, this.now()) === 'ENABLED');
      return {
        review: { id: review.id!, author: { id: user.id!, username: user.username }, text: review.text,
          rating: review.rating, reportCount: review.deletedAt ? 0 : valid.length,
          deletedAt: review.deletedAt?.toISOString() ?? null },
        reports: received.map(report => ({ id: report.id!, reason: report.reason, details: report.details,
          status: report.status, createdAt: report.createdAt.toISOString(),
          reporter: { id: report.reporter.id!, username: report.reporter.username } })),
      };
    });
  }

  private async detailInContext(user: User, em: EntityManager) {
    const live = await this.liveEvidence(user, em);
    const sanctions = await em.find(UserSanction, { user: user.id! }, {
      populate: ['administrator'], orderBy: { createdAt: 'DESC', id: 'DESC' },
    });
    const status = effectiveUserStatus(user, this.now());
    return {
      id: user.id!, username: user.username, fullName: user.fullName, status,
      suspendedUntil: status === 'SUSPENDED' ? user.suspendedUntil : null,
      pendingReportCount: live.reduce((sum, group) => sum + group.review.reportCount, 0),
      criticalReviewCount: live.filter(group => group.review.reportCount >= 3).length,
      removedReviewCount: live.filter(group => group.review.deletedAt !== null).length
        + sanctions.reduce((sum, entry) => sum + entry.removedReviews.length, 0),
      activeSanction: status !== 'ENABLED' && sanctions[0] ? sanctionResponse(sanctions[0]) : null,
    };
  }

  async detail(id: number) { return this.detailInContext(await this.user(id), manager()); }

  async sanctions(id: number, input: AdminPagination) {
    await this.user(id);
    const [items, total] = await manager().findAndCount(UserSanction, { user: id }, {
      populate: ['administrator'], orderBy: { createdAt: 'DESC', id: 'DESC' },
      limit: input.pageSize, offset: (input.page - 1) * input.pageSize,
    });
    return { items: items.map(sanctionResponse), total };
  }

  async reviewReports(id: number, input: AdminPagination) {
    const em = manager();
    const user = await this.user(id);
    const live = await this.liveEvidence(user, em);
    const history = await em.find(UserSanction, { user: id });
    const groups = [...live.filter(group => group.reports.length > 0 || group.review.deletedAt !== null),
      ...history.flatMap(entry => entry.removedReviews)];
    groups.sort((a, b) => b.review.reportCount - a.review.reportCount || b.review.id - a.review.id);
    const offset = (input.page - 1) * input.pageSize;
    return { items: groups.slice(offset, offset + input.pageSize), total: groups.length };
  }

  async applySanction(id: number, actorId: number, input: SanctionInput) {
    return manager().transactional(async tx => {
      // Orden estable; serializa decisiones para una misma cuenta.
      const users = await tx.find(User, { id: { $in: [id, actorId] } }, {
        orderBy: { id: 'ASC' }, lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true,
      });
      const actor = users.find(user => user.id === actorId);
      if (!actor || actor.category !== 'ADMIN') throw new AppError('Solo un administrador puede gestionar sanciones', 403);
      assertAccountEnabled(actor, this.now());
      const user = users.find(user => user.id === id);
      if (!user) throw new AppError('Usuario no encontrado', 404);
      if (id === actorId) throw new AppError('No podés cambiar tu propio estado', 403);
      if (user.category === 'ADMIN') throw new AppError('No se puede sancionar otra cuenta administradora', 403);
      const status = effectiveUserStatus(user, this.now());
      if ((input.action === 'REACTIVATE' && status === 'ENABLED') ||
          (input.action === 'SUSPEND' && status !== 'ENABLED') ||
          (input.action === 'BAN' && status === 'BANNED')) {
        throw new AppError('El estado de la cuenta cambió o no admite esta acción. Actualizá el listado.', 409);
      }
      const now = this.now();
      const until = input.action === 'SUSPEND' ? suspensionEnd(now) : null;
      const sanction = new UserSanction();
      sanction.user = user;
      sanction.administrator = actor;
      sanction.action = input.action;
      sanction.reason = input.reason;
      sanction.createdAt = now;
      sanction.suspendedUntil = until;

      if (input.action === 'BAN') {
        // Los bloqueos esperan a las moderaciones y nuevos reportes en curso.
        await tx.find(Review, { author: id }, { orderBy: { id: 'ASC' }, lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
        sanction.removedReviews = (await this.liveEvidence(user, tx)).map(group => ({
          ...group, review: { ...group.review, deletedAt: group.review.deletedAt ?? now.toISOString(), reportCount: 0 },
        }));
        // La evidencia ya está copiada. Cascadas eliminan reportes recibidos,
        // likes, comentarios y versiones de las reseñas eliminadas.
        await tx.nativeDelete(ReviewReport, { reporter: id });
        await tx.nativeDelete(ReviewLike, { user: id });
        // Preserva respuestas ajenas en otras reseñas: pasan a ser comentarios raíz.
        // En las reseñas eliminadas se borra la conversación completa.
        await tx.nativeUpdate(Comment, { parent: { author: id } }, { parent: null });
        await tx.nativeDelete(Comment, { $or: [{ author: id }, { review: { author: id } }] });
        await tx.nativeDelete(Review, { author: id });
        await tx.nativeDelete(Follow, { $or: [{ follower: id }, { followed: id }] });
        await tx.nativeDelete(PlaylistSave, { user: id });
        await tx.nativeDelete(Playlist, { user: id });
        await tx.nativeDelete(UserFavoriteRelease, { user: id });
        await tx.nativeDelete(UserFavoriteTrack, { user: id });
        user.avatarImage = null;
        user.coverImage = null;
      }
      user.status = input.action === 'SUSPEND' ? 'SUSPENDED' : input.action === 'BAN' ? 'BANNED' : 'ENABLED';
      user.suspendedUntil = until;
      user.sessionVersion += 1;
      await tx.persistAndFlush(sanction);
      return this.detailInContext(user, tx);
    });
  }
}
