import { LockMode, RequestContext } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { Review } from '../reviews/review.entity.js';
import { ReviewReport } from './report.entity.js';
import { assertCanReportReview } from './report.rules.js';
import type {
  CreateReportInput,
  ReportDecision,
  ReportListInput,
} from './report.validation.js';

export class ReviewReportRepository {
  constructor(private readonly now: () => Date = () => new Date()) {}

  private getEntityManager() {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em;
  }

  // Lista reportes por estado, empezando por los más antiguos.
  async findAll(
    input: ReportListInput,
  ): Promise<[ReviewReport[], number]> {
    return this.getEntityManager().findAndCount(
      ReviewReport,
      { status: input.status },
      {
        populate: ['reporter', 'review.author', 'moderatedBy'],
        orderBy: { createdAt: 'asc', id: 'asc' },
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
      },
    );
  }

  async create(
    reviewId: number,
    reporterId: number,
    data: CreateReportInput,
  ): Promise<ReviewReport> {
    return this.getEntityManager().transactional(async tx => {
      // Impide que se borre la reseña mientras se registra el reporte.
      const review = await tx.findOne(
        Review,
        { id: reviewId, deletedAt: null },
        {
          lockMode: LockMode.PESSIMISTIC_READ,
          refresh: true,
        },
      );

      if (!review) {
        throw new AppError('Reseña no encontrada', 404);
      }

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

  // Aplica la decisión del admin dentro de una transacción.
  async moderate(
    reportId: number,
    moderatorId: number,
    decision: ReportDecision,
  ): Promise<ReviewReport> {
    return this.getEntityManager().transactional(async tx => {
      const candidate = await tx.findOne(ReviewReport, {
        id: reportId,
      });

      if (!candidate) {
        throw new AppError('Reporte no encontrado', 404);
      }

      // Este ID pertenece a la reseña asociada al reporte.
      const reviewId = candidate.review.id;

      if (reviewId === undefined) {
        throw new AppError('El reporte no tiene una reseña válida', 409);
      }

      // Bloquea primero la reseña para coordinar reportes y moderaciones.
      const review = await tx.findOne(
        Review,
        { id: reviewId },
        {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        },
      );

      if (!review) {
        throw new AppError('Reseña no encontrada', 404);
      }

      const report = await tx.findOne(
        ReviewReport,
        { id: reportId },
        {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        },
      );

      if (!report) {
        throw new AppError('Reporte no encontrado', 404);
      }

      if (report.status !== 'PENDING') {
        throw new AppError('Este reporte ya fue moderado', 409);
      }

      const moderatedAt = this.now();
      const moderator = tx.getReference(User, moderatorId);

      if (decision === 'DISMISS') {
        // Descarta este reporte y mantiene publicada la reseña.
        report.status = 'DISMISSED';
        report.moderatedBy = moderator;
        report.moderatedAt = moderatedAt;
      } else {
        // Da de baja la reseña conservando su historial.
        review.deletedAt ??= moderatedAt;

        // Resuelve todos los reportes pendientes de esa misma reseña.
        const pendingReports = await tx.find(ReviewReport, {
          review: reviewId,
          status: 'PENDING',
        });

        for (const pendingReport of pendingReports) {
          pendingReport.status = 'ACTIONED';
          pendingReport.moderatedBy = moderator;
          pendingReport.moderatedAt = moderatedAt;
        }
      }

      await tx.flush();

      await tx.populate(report, [
        'reporter',
        'review.author',
        'moderatedBy',
      ]);

      return report;
    });
  }
}