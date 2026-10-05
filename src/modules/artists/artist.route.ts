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
} from './artist.controller.js';

const artistRouter = Router();

artistRouter.get('/', findAll);
artistRouter.get('/:id', findById);

artistRouter.post(
  '/',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  create,
);

artistRouter.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  update,
);

artistRouter.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  remove,
);

export default artistRouter;