import { LockMode, RequestContext } from '@mikro-orm/core';
import type { FilterQuery } from '@mikro-orm/core';

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

async findAll(
  input: ReviewListInput,
): Promise<{
  items: Array<{ review: Review; likeCount: number }>;
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

  // Cuenta los likes en la base antes de aplicar el límite de página.
  const rows = (await em.getConnection().execute(
    `
      SELECT
        r.id,
        (
          SELECT COUNT(*)::int
          FROM review_like AS l
          WHERE l.review_id = r.id
        ) AS like_count
      FROM "review" AS r
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `,
    [...params, input.pageSize, offset],
  )) as Array<{ id: number; like_count: number }>;

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
      ? [{ review, likeCount: Number(row.like_count) }]
      : [];
  });

  return { items, total };
}

  async findById(id: number): Promise<Review | null> {
    return this.getEntityManager().findOne(Review, { id, deletedAt: null }, {
      populate: ['author'],
    });
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

  async updateText(id: number, text: string, actor: ReviewActor): Promise<Review> {
    return this.getEntityManager().transactional(async tx => {
      const review = await tx.findOne(Review, { id, deletedAt: null }, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!review) throw new AppError('Reseña no encontrada', 404);

      // El reloj se consulta después de obtener el bloqueo, nunca antes de esperar.
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
      const review = await tx.findOne(Review, { id, deletedAt: null }, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!review) throw new AppError('Reseña no encontrada', 404);

      assertCanManageReview(review, actor);
      review.deletedAt = this.now();
      await tx.flush();
    });
  }

  /**
   * Contrato para el futuro ranking, sin promedios ni agregaciones.
   * Primero se elige la última incluyendo borradas; recién después se evalúa
   * deletedAt. Filtrar antes reviviría incorrectamente puntuaciones anteriores.
   */
  async findEligibleRating(authorId: number, releaseId: number): Promise<number | null> {
    const latest = await this.getEntityManager().findOne(Review, {
      author: authorId,
      release: releaseId,
    }, { orderBy: { createdAt: 'desc', id: 'desc' } });

    return latest && latest.deletedAt === null ? latest.rating : null;
  }
}
