import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth, requireMutationHeader } from '../../middlewares/auth.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { create, findById, findReplies, findRoots, remove, update } from './comment.controller.js';

const requireJsonBody: RequestHandler = (req, _res, next) => {
  const hasBody = Number(req.get('Content-Length') ?? 0) > 0 || req.get('Transfer-Encoding') !== undefined;
  if (hasBody && !req.is('application/json')) {
    next(new AppError('El cuerpo debe enviarse como application/json', 400));
    return;
  }
  next();
};

export const reviewCommentRouter = Router({ mergeParams: true });
reviewCommentRouter.get('/', findRoots);
reviewCommentRouter.post('/', requireAuth, requireMutationHeader, requireJsonBody, create);

const commentRouter = Router();
commentRouter.get('/:id/replies', findReplies);
commentRouter.get('/:id', findById);
commentRouter.patch('/:id', requireAuth, requireMutationHeader, requireJsonBody, update);
commentRouter.delete('/:id', requireAuth, requireMutationHeader, requireJsonBody, remove);

export default commentRouter;
