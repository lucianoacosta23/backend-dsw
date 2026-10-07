import { LockMode, RequestContext } from '@mikro-orm/core';
import type { FilterQuery } from '@mikro-orm/core';

import { ReviewLike } from '../likes/like.entity.js';
import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { Release } from '../releases/release.entity.js';
import { Track } from '../tracks/track.entity.js';
import { Review } from './review.entity.js';
import { assertCanEditReview, assertCanManageReview } from './review.rules.js';
import type { ReviewActor } from './review.rules.js';
import type { CreateReviewInput, ReviewListInput } from './review.validation.js';

export class ReviewRepository {
  constructor(private readonly now: () => Date = () => new Date()) {}

  private getEntityManager() {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No hay un contexto de base de datos activo');
    return em;
  }

  async findDetail(id: number, viewerId?: number) {
    const em = this.getEntityManager();

    const review = await em.findOne(
      Review,
      { id, deletedAt: null },
      {
        populate: [
          'author',
          'release.artists',
          'track.release',
          'track.artists',
        ],
      },
    );

    if (!review) {
      return null;
    }

    const [likeCount, viewerLikes] = await Promise.all([
      em.count(ReviewLike, { review: id }),
      viewerId === undefined
        ? Promise.resolve(0)
        : em.count(ReviewLike, {
            review: id,
            user: viewerId,
          }),
    ]);

    return {
      review,
      likeCount,
      likedByMe: viewerLikes > 0,
    };
  }

    async findPopular(
    page: number,
    pageSize: number,
    viewerId: number,
  ) {
    // Reutiliza el ranking por likes y excluye reseñas dadas de baja.
    const result = await this.findAll(
      {
        page,
        pageSize,
        sort: 'popular',
      },
      viewerId,
    );

    // El Home necesita mostrar qué música corresponde a cada reseña.
    if (result.items.length > 0) {
      await this.getEntityManager().populate(
        result.items.map(item => item.review),
        [
          'release.artists',
          'track.release',
          'track.artists',
        ],
      );
    }

    return result;
  }

  async findAll(
    input: ReviewListInput,
    viewerId?: number,
  ): Promise<{
    items: Array<{
      review: Review;
      likeCount: number;
      likedByMe: boolean;
    }>;
    total: number;
  }> {
    const em = this.getEntityManager();

    const where: FilterQuery<Review> = { deletedAt: null };
    const conditions = ['r.deleted_at IS NULL'];
    const params: number[] = [];

    if (input.authorId !== undefined) {
      where.author = input.authorId;
      conditions.push('r.author_id = ?');
      params.push(input.authorId);
    }

    if (input.releaseId !== undefined) {
      where.release = input.releaseId;
      conditions.push('r.release_id = ?');
      params.push(input.releaseId);
    }

    if (input.trackId !== undefined) {
      where.track = input.trackId;
      conditions.push('r.track_id = ?');
      params.push(input.trackId);
    }

    const total = await em.count(Review, where);
    const orderBy =
      input.sort === 'popular'
        ? 'like_count DESC, r.created_at DESC, r.id DESC'
        : 'r.created_at DESC, r.id DESC';

    const offset = (input.page - 1) * input.pageSize;

    // Cuenta los likes y comprueba el del usuario actual antes de paginar.
    const rows = (await em.getConnection().execute(
      `
        SELECT
          r.id,
          (
            SELECT COUNT(*)::int
            FROM review_like AS l
            WHERE l.review_id = r.id
          ) AS like_count,
          EXISTS (
            SELECT 1
            FROM review_like AS user_like
            WHERE user_like.review_id = r.id
              AND user_like.user_id = ?
          ) AS liked_by_me
        FROM "review" AS r
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [viewerId ?? 0, ...params, input.pageSize, offset],
    )) as Array<{
      id: number;
      like_count: number;
      liked_by_me: boolean;
    }>;

    if (rows.length === 0) {
      return { items: [], total };
    }

    // Recupera las entidades con el autor para armar la respuesta de la API.
    const reviews = await em.find(
      Review,
      {
        id: { $in: rows.map(row => row.id) },
        deletedAt: null,
      },
      { populate: ['author'] },
    );

    const reviewsById = new Map(
      reviews.map(review => [review.id!, review]),
    );

    // La consulta de entidades no garantiza el orden del ranking SQL.
    const items = rows.flatMap(row => {
      const review = reviewsById.get(row.id);

      return review
        ? [{
            review,
            likeCount: Number(row.like_count),
            likedByMe: row.liked_by_me,
          }]
        : [];
    });

    return { items, total };
  }

    // Calcula las estadísticas de todas las reseñas activas del destino.
  async getRatingStats(
    targetType: 'release' | 'track',
    targetId: number,
  ): Promise<{
    averageRating: number | null;
    totalRatings: number;
    distribution: Array<{ rating: number; count: number }>;
  }> {
    const em = this.getEntityManager();

    // Comprueba que el destino exista, aunque todavía no tenga reseñas.
    if (targetType === 'release') {
      const release = await em.findOne(Release, { id: targetId });

      if (!release) {
        throw new AppError('Lanzamiento no encontrado', 404);
      }
    } else {
      const track = await em.findOne(Track, { id: targetId });

      if (!track) {
        throw new AppError('Pista no encontrada', 404);
      }
    }

    // La columna sale de estas dos opciones internas.
    // El ID se envía como parámetro de la consulta.
    const column =
      targetType === 'release' ? 'release_id' : 'track_id';

    const rows = (await em.getConnection().execute(
      `
        SELECT rating, COUNT(*)::int AS count
        FROM "review"
        WHERE ${column} = ?
          AND deleted_at IS NULL
        GROUP BY rating
        ORDER BY rating ASC
      `,
      [targetId],
    )) as Array<{
      rating: number | string;
      count: number | string;
    }>;

    const counts = new Map(
      rows.map(row => [Number(row.rating), Number(row.count)]),
    );

    // Devuelve las diez barras, incluso las que tienen cero puntuaciones.
    const distribution = Array.from({ length: 10 }, (_, index) => {
      const rating = (index + 1) / 2;

      return {
        rating,
        count: counts.get(rating) ?? 0,
      };
    });

    const totalRatings = distribution.reduce(
      (total, item) => total + item.count,
      0,
    );

    const ratingSum = distribution.reduce(
      (total, item) => total + item.rating * item.count,
      0,
    );

    return {
      // Sin puntuaciones no hay promedio: devolvemos null.
      averageRating:
        totalRatings === 0
          ? null
          : Number((ratingSum / totalRatings).toFixed(2)),
      totalRatings,
      distribution,
    };
  }

  async findById(id: number): Promise<Review | null> {
    return this.getEntityManager().findOne(
      Review,
      { id, deletedAt: null },
      { populate: ['author'] },
    );
  }

  async create(data: CreateReviewInput, authorId: number): Promise<Review> {
    const em = this.getEntityManager();
    const review = new Review();

    review.author = em.getReference(User, authorId);

    // La reseña se vincula con un lanzamiento o con una pista.
    if (data.releaseId !== undefined) {
      const release = await em.findOne(Release, { id: data.releaseId });

      if (!release) {
        throw new AppError('Lanzamiento no encontrado', 404);
      }

      review.release = release;
    } else if (data.trackId !== undefined) {
      const track = await em.findOne(Track, { id: data.trackId });

      if (!track) {
        throw new AppError('Pista no encontrada', 404);
      }

      review.track = track;
    } else {
      // Protege el repository aunque se lo llame sin pasar por la validación.
      throw new AppError('Debe indicar releaseId o trackId', 400);
    }

    review.text = data.text;
    review.rating = data.rating;
    review.createdAt = this.now();

    await em.persistAndFlush(review);
    await em.populate(review, ['author']);

    return review;
  }

  async updateText(
    id: number,
    text: string,
    actor: ReviewActor,
  ): Promise<Review> {
    return this.getEntityManager().transactional(async tx => {
      const review = await tx.findOne(
        Review,
        { id, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!review) throw new AppError('Reseña no encontrada', 404);

      // El reloj se consulta después de obtener el bloqueo.
      const now = this.now();
      assertCanEditReview(review, actor, now);
      review.text = text;
      review.editedAt = now;

      await tx.flush();
      await tx.populate(review, ['author']);

      return review;
    });
  }

  async delete(id: number, actor: ReviewActor): Promise<void> {
    await this.getEntityManager().transactional(async tx => {
      const review = await tx.findOne(
        Review,
        { id, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!review) throw new AppError('Reseña no encontrada', 404);

      assertCanManageReview(review, actor);
      review.deletedAt = this.now();
      await tx.flush();
    });
  }

  /**
   * Primero elige la reseña más reciente, incluyendo borradas, y luego
   * comprueba deletedAt para no revivir una puntuación anterior.
   */
  async findEligibleRating(
    authorId: number,
    releaseId: number,
  ): Promise<number | null> {
    const latest = await this.getEntityManager().findOne(
      Review,
      {
        author: authorId,
        release: releaseId,
      },
      { orderBy: { createdAt: 'desc', id: 'desc' } },
    );

    return latest && latest.deletedAt === null ? latest.rating : null;
  }
}