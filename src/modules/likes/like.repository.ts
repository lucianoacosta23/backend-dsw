import { LockMode, RequestContext } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { Review } from '../reviews/review.entity.js';
import { ReviewLike } from './like.entity.js';
import { assertCanLikeReview } from './like.rules.js';

export interface LikeResult {
  like: ReviewLike;
  likeCount: number;
}

export class ReviewLikeRepository {
  constructor(private readonly now: () => Date = () => new Date()) {}

  private getEntityManager() {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No hay un contexto de base de datos activo');
    return em;
  }

  async like(reviewId: number, userId: number): Promise<LikeResult> {
    return this.getEntityManager().transactional(async tx => {
      // FOR SHARE: varios likes a la misma reseña no se bloquean entre sí, pero sí
      // esperan a un borrado en curso (ReviewRepository.delete usa FOR UPDATE).
      // Así nunca se registra un like sobre una reseña que se acaba de borrar.
      const review = await tx.findOne(Review, { id: reviewId, deletedAt: null }, {
        lockMode: LockMode.PESSIMISTIC_READ,
        refresh: true,
      });
      if (!review) throw new AppError('Reseña no encontrada', 404);
      assertCanLikeReview(review, { id: userId });

      const like = new ReviewLike();
      like.review = review;
      like.user = tx.getReference(User, userId);
      like.createdAt = this.now();
      await tx.persistAndFlush(like);

      return { like, likeCount: await tx.count(ReviewLike, { review: reviewId }) };
    });
  }

  /** Devuelve la cantidad de likes que quedan en la reseña. */
  async unlike(reviewId: number, userId: number): Promise<number> {
    const em = this.getEntityManager();

    if (await em.count(Review, { id: reviewId, deletedAt: null }) === 0) {
      throw new AppError('Reseña no encontrada', 404);
    }

    const removed = await em.nativeDelete(ReviewLike, { review: reviewId, user: userId });
    if (removed === 0) throw new AppError('No diste like a esta reseña', 404);

    return em.count(ReviewLike, { review: reviewId });
  }
}
