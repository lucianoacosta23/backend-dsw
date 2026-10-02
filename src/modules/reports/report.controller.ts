import type { Request, Response, NextFunction } from 'express';
import { ForeignKeyConstraintViolationException, UniqueConstraintViolationException } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import type { User } from '../users/user.entity.js';
import { parseReviewId } from '../reviews/review.validation.js';
import { ReviewReportRepository } from './report.repository.js';
import { parseCreateReport } from './report.validation.js';

const repository = new ReviewReportRepository();

function authUserId(res: Response): number {
  const user = res.locals.authUser as User | undefined;
  if (user?.id === undefined) throw new AppError('Debe iniciar sesión', 401);
  return user.id;
}

export async function createReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reviewId = parseReviewId(req.params.reviewId);
    const input = parseCreateReport(req.body);
    const report = await repository.create(reviewId, authUserId(res), input);

    // Respuesta explícita: no se serializa la entidad ni se expone al reportante.
    res.status(201).json({
      message: 'Reporte registrado',
      data: {
        id: report.id,
        reviewId,
        reason: report.reason,
        details: report.details,
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
