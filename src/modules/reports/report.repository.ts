import { LockMode, RequestContext } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { Review } from '../reviews/review.entity.js';
import { ReviewReport } from './report.entity.js';
import { assertCanReportReview } from './report.rules.js';
import type { CreateReportInput } from './report.validation.js';

export class ReviewReportRepository {
  constructor(private readonly now: () => Date = () => new Date()) {}

  private getEntityManager() {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No hay un contexto de base de datos activo');
    return em;
  }

  async create(reviewId: number, reporterId: number, data: CreateReportInput): Promise<ReviewReport> {
    return this.getEntityManager().transactional(async tx => {
      // FOR SHARE: no se puede reportar una reseña mientras otra transacción la borra.
      const review = await tx.findOne(Review, { id: reviewId, deletedAt: null }, {
        lockMode: LockMode.PESSIMISTIC_READ,
        refresh: true,
      });
      if (!review) throw new AppError('Reseña no encontrada', 404);
      assertCanReportReview(review, { id: reporterId });

      const report = new ReviewReport();
      report.review = review;
      report.reporter = tx.getReference(User, reporterId);
      report.reason = data.reason;
      report.details = data.details;
      report.createdAt = this.now();
      await tx.persistAndFlush(report);

      return report;
    });
  }
}
