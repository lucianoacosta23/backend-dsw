import { Router } from 'express';
import {
  requireAuth,
  requireAdmin,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';
import {
  findAll,
  findById,
  create,
  update,
  remove,
} from './release.controller.js';

const releaseRouter = Router();

releaseRouter.get('/', findAll);
releaseRouter.get('/:id', findById);

releaseRouter.post(
  '/',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  create,
);

releaseRouter.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  update,
);

releaseRouter.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  remove,
);

export default releaseRouter;