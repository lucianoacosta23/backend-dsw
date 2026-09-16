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
} from './genres.controller.js';

const genreRouter = Router();

genreRouter.get('/', findAll);
genreRouter.get('/:id', findById);

genreRouter.post(
  '/',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  create,
);

genreRouter.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  update,
);

genreRouter.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  remove,
);

export default genreRouter;