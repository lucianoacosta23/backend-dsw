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
  findPopularTracks,
} from './track.controller.js';

const trackRouter = Router();

trackRouter.get('/', findAll);

trackRouter.get('/popular', findPopularTracks);

trackRouter.get('/:id', findById);

trackRouter.post(
  '/',
  //requireAuth,
  //requireAdmin,
  //requireMutationHeader,
  create,
);

trackRouter.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  update,
);

trackRouter.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  remove,
);

export default trackRouter;