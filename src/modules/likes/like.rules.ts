import { AppError } from '../../shared/errors/app-error.js';

export interface LikeActor {
  id: number;
}

interface ReviewState {
  author: { id?: number };
  deletedAt: Date | null;
}

export function assertCanLikeReview(review: ReviewState, actor: LikeActor): void {
  if (review.deletedAt !== null) {
    throw new AppError('Reseña no encontrada', 404);
  }

  if (review.author.id === actor.id) {
    throw new AppError('No se puede dar like a la propia reseña', 400);
  }
}
