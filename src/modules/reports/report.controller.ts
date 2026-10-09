import type { Request, Response, NextFunction } from 'express';
import {
  ForeignKeyConstraintViolationException,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import type { User } from '../users/user.entity.js';
import { parseReviewId } from '../reviews/review.validation.js';
import type { ReviewReport } from './report.entity.js';
import { ReviewReportRepository } from './report.repository.js';
import {
  parseCreateReport,
  parseModerateReport,
  parseReportList,
} from './report.validation.js';

const repository = new ReviewReportRepository();

function authUserId(res: Response): number {
  const user = res.locals.authUser as User | undefined;

  if (user?.id === undefined) {
    throw new AppError('Debe iniciar sesión', 401);
  }

  return user.id;
}

// Arma una respuesta explícita sin exponer datos privados de los usuarios.
function adminReportResponse(report: ReviewReport) {
  const review = report.review;

  return {
    id: report.id,
    reason: report.reason,
    details: report.details,
    status: report.status,
    createdAt: report.createdAt,
    moderatedAt: report.moderatedAt,
    reporter: {
      id: report.reporter.id,
      username: report.reporter.username,
    },
    moderatedBy: report.moderatedBy
      ? {
          id: report.moderatedBy.id,
          username: report.moderatedBy.username,
        }
      : null,
    review: {
      id: review.id,
      author: {
        id: review.author.id,
        username: review.author.username,
      },
      releaseId: review.release?.id ?? null,
      trackId: review.track?.id ?? null,
      text: review.text,
      rating: review.rating,
      deletedAt: review.deletedAt,
    },
  };
}

export async function createReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reviewId = parseReviewId(req.params.reviewId);
    const input = parseCreateReport(req.body);

    const report = await repository.create(
      reviewId,
      authUserId(res),
      input,
    );

    res.status(201).json({
      message: 'Reporte registrado',
      data: {
        id: report.id,
        reviewId,
        reason: report.reason,
        details: report.details,
        status: report.status,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof UniqueConstraintViolationException) {
      next(new AppError('Ya reportaste esta reseña', 409));
      return;
    }

    if (error instanceof ForeignKeyConstraintViolationException) {
      next(new AppError('El usuario o la reseña ya no existe', 409));
      return;
    }

    next(error);
  }
}

export async function listReports(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseReportList(req.query);
    const [reports, total] = await repository.findAll(input);

    res.status(200).json({
      message: 'Listado de reportes',
      data: reports.map(adminReportResponse),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
      status: input.status,
    });
  } catch (error) {
    next(error);
  }
}


//Esta funcion permite modificar el estado de un reporte puntual
export async function moderateReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reportId = parseReviewId(req.params.id);
    const input = parseModerateReport(req.body);

    const report = await repository.moderate(
      reportId,
      authUserId(res),
      input.decision,
    );

    res.status(200).json({
      message:
        input.decision === 'DISMISS'
          ? 'Reporte descartado'
          : 'Reseña dada de baja y reportes pendientes resueltos',
      data: adminReportResponse(report),
    });
  } catch (error) {
    next(error);
  }
}


//filtramos las las reviews por mas de 3 repotes como reviews criticas 
export async function getCriticalReviews(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Llamamos al método del repositorio que creamos antes para buscar las reseñas con >= 3 reportes
    const criticalReviews = await repository.findCriticalReviews();

    res.status(200).json({
      message: 'Reseñas críticas obtenidas exitosamente',
      data: criticalReviews,
    });
  } catch (error) {
    next(error);
  }
}

//Con esta funcion, todos los reportes especificos de una review para cambiarle el estado de los mismos 
export async function getMinorReviews(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({
      message: 'Reseñas con reportes menores obtenidas exitosamente',
      data: await repository.findMinorReviews(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getReviewReports(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reviewId = parseReviewId(req.params.reviewId);
    res.status(200).json({
      message: 'Reportes de la reseña',
      data: await repository.findByReview(reviewId),
    });
  } catch (error) {
    next(error);
  }
}

export async function moderateReviewReports(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reviewId = parseReviewId(req.params.reviewId); // O el parser que uses para el ID de reseña
    const input = parseModerateReport(req.body);

    // Creamos/adaptamos este método en el repositorio para procesar por reviewId
    const result = await repository.moderateByReview(
      reviewId,
      authUserId(res),
      input.decision,
    );

    res.status(200).json({
      message:
        input.decision === 'DISMISS'
          ? 'Reportes de la reseña descartados'
          : 'Reseña dada de baja y reportes resueltos',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
