import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth, requireMutationHeader } from '../../middlewares/auth.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { create, findAll, findById, remove, update } from './review.controller.js';

const reviewRouter = Router();

const requireJsonBody: RequestHandler = (req, _res, next) => {
  const hasBody = Number(req.get('Content-Length') ?? 0) > 0
    || req.get('Transfer-Encoding') !== undefined;

  if (hasBody && !req.is('application/json')) {
    next(new AppError('El cuerpo debe enviarse como application/json', 400));
    return;
  }

  next();
};

reviewRouter.get('/', findAll);
reviewRouter.get('/:id', findById);
reviewRouter.post('/', requireAuth, requireMutationHeader, requireJsonBody, create);
reviewRouter.patch('/:id', requireAuth, requireMutationHeader, requireJsonBody, update);
reviewRouter.delete('/:id', requireAuth, requireMutationHeader, requireJsonBody, remove);

export default reviewRouter;
