import { AppError } from '../../shared/errors/app-error.js';

export interface ReportActor {
  id: number;
}

interface ReviewState {
  author: { id?: number };
  deletedAt: Date | null;
}

export function assertCanReportReview(review: ReviewState, actor: ReportActor): void {
  if (review.deletedAt !== null) {
    throw new AppError('Reseña no encontrada', 404);
  }

  if (review.author.id === actor.id) {
    throw new AppError('No se puede reportar la propia reseña', 400);
  }
}
