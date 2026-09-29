import { LockMode, RequestContext } from '@mikro-orm/core';
import type { FilterQuery } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { Release } from '../releases/release.entity.js';
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

  async findAll(input: ReviewListInput): Promise<[Review[], number]> {
    const where: FilterQuery<Review> = { deletedAt: null };
    if (input.authorId !== undefined) where.author = input.authorId;
    if (input.releaseId !== undefined) where.release = input.releaseId;

    return this.getEntityManager().findAndCount(Review, where, {
      populate: ['author'],
      orderBy: { createdAt: 'desc', id: 'desc' },
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    });
  }

  async findById(id: number): Promise<Review | null> {
    return this.getEntityManager().findOne(Review, { id, deletedAt: null }, {
      populate: ['author'],
    });
  }

  async create(data: CreateReviewInput, authorId: number): Promise<Review> {
    const em = this.getEntityManager();
    const release = await em.findOne(Release, { id: data.releaseId });
    if (!release) throw new AppError('Lanzamiento no encontrado', 404);

    const review = new Review();
    review.author = em.getReference(User, authorId);
    review.release = release;
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
