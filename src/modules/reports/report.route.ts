import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth, requireMutationHeader } from '../../middlewares/auth.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createReport } from './report.controller.js';

const requireJsonBody: RequestHandler = (req, _res, next) => {
  const hasBody = Number(req.get('Content-Length') ?? 0) > 0 || req.get('Transfer-Encoding') !== undefined;
  if (hasBody && !req.is('application/json')) {
    next(new AppError('El cuerpo debe enviarse como application/json', 400));
    return;
  }
  next();
};

// Se monta en /reviews/:reviewId/reports.
const reviewReportRouter = Router({ mergeParams: true });

reviewReportRouter.post('/', requireAuth, requireMutationHeader, requireJsonBody, createReport);

export default reviewReportRouter;
