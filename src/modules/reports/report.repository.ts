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

  async findByReview(reviewId: number) {
    const em = this.getEntityManager();
    if (!await em.findOne(Review, { id: reviewId })) {
      throw new AppError('Reseña no encontrada', 404);
    }
    const reports = await em.find(ReviewReport, { review: reviewId }, {
      populate: ['reporter'],
      orderBy: { createdAt: 'asc', id: 'asc' },
    });
    return reports.map(report => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      reporter: { id: report.reporter.id, username: report.reporter.username },
    }));
  }

  // Obtiene las reseñas críticas que tienen 3 o más reportes pendientes
  async findCriticalReviews() {
    return this.findReviewsByPendingReports(3);
  }

  // Solo reseñas con uno o dos reportes pendientes.
  async findMinorReviews() {
    return this.findReviewsByPendingReports(1, 2);
  }

  private async findReviewsByPendingReports(minimum: number, maximum?: number) {
    const em = this.getEntityManager();

    // Una sola consulta mantiene el contador y la visibilidad en la misma lectura.
    // Seleccionamos únicamente los datos que necesita la pantalla de moderación.
    const rows: Array<{
      id: number;
      author_id: number;
      username: string;
      text: string | null;
      rating: string | number;
      report_count: string | number;
    }> = await em.getConnection().execute(
      `SELECT r.id, r.author_id, u.username, r.text, r.rating,
              COUNT(rr.id) AS report_count
       FROM review r
       JOIN "user" u ON u.id = r.author_id
       JOIN review_report rr ON rr.review_id = r.id
       WHERE r.deleted_at IS NULL AND rr.status = ?
       GROUP BY r.id, u.id
       HAVING COUNT(rr.id) >= ? ${maximum === undefined ? '' : 'AND COUNT(rr.id) <= ?'}
       ORDER BY COUNT(rr.id) DESC, r.id ASC`,
      maximum === undefined ? ['PENDING', minimum] : ['PENDING', minimum, maximum],
    );

    return rows.map(row => ({
      id: row.id,
      author: { id: row.author_id, username: row.username },
      text: row.text,
      rating: Number(row.rating),
      reportCount: Number(row.report_count),
    }));
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

  // Modera todos los reportes pendientes de una reseña en una transacción.
  async moderateByReview(
  reviewId: number,
  moderatorId: number,
  decision: ReportDecision,
  ) {
  return this.getEntityManager().transactional(async tx => {
    const review = await tx.findOne(
      Review,
      { id: reviewId },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
    );

    if (!review) {
      throw new AppError('Reseña no encontrada', 404);
    }

    if (review.deletedAt !== null) {
      throw new AppError('La reseña ya fue dada de baja. Actualizá el listado.', 409);
    }

    const moderatedAt = this.now();
    const moderator = tx.getReference(User, moderatorId);

    // Buscamos todos los reportes PENDIENTES de esta reseña
    const pendingReports = await tx.find(ReviewReport, {
      review: reviewId,
      status: 'PENDING',
    });

    if (pendingReports.length === 0) {
      throw new AppError('La reseña ya no tiene reportes pendientes. Actualizá el listado.', 409);
    }

    if (decision === 'DISMISS') {
      // Descartamos todos los reportes pendientes de esta reseña
      for (const report of pendingReports) {
        report.status = 'DISMISSED';
        report.moderatedBy = moderator;
        report.moderatedAt = moderatedAt;
      }
    } else {
      // Damos de baja la reseña
      review.deletedAt ??= moderatedAt;

      // Accionamos todos los reportes pendientes
      for (const report of pendingReports) {
        report.status = 'ACTIONED';
        report.moderatedBy = moderator;
        report.moderatedAt = moderatedAt;
      }
    }

    await tx.flush();
    return { reviewId, affectedReports: pendingReports.length };
  });
  }
}
