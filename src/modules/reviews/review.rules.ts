import { AppError } from '../../shared/errors/app-error.js';

export const REVIEW_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ReviewActor {
  id: number;
  category: string;
}

interface ReviewState {
  author: { id?: number };
  createdAt: Date;
  deletedAt: Date | null;
}

export function assertCanManageReview(review: ReviewState, actor: ReviewActor): void {
  if (review.deletedAt !== null) {
    throw new AppError('Reseña no encontrada', 404);
  }

  if (review.author.id !== actor.id && actor.category !== 'ADMIN') {
    throw new AppError('No tiene permisos para modificar esta reseña', 403);
  }
}

export function assertCanEditReview(
  review: ReviewState,
  actor: ReviewActor,
  now: Date,
): void {
  if (review.deletedAt !== null) {
    throw new AppError('Reseña no encontrada', 404);
  }

  if (review.author.id !== actor.id) {
    throw new AppError('Solo el autor puede editar esta reseña', 403);
  }

  if (now.getTime() >= review.createdAt.getTime() + REVIEW_EDIT_WINDOW_MS) {
    throw new AppError('El plazo de 24 horas para editar la reseña terminó', 403);
  }
}
