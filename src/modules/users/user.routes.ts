import { Router } from 'express';

import {
  findAll,
  findById,
  findByUsername,
  update,
  remove,
} from './user.controller.js';

import {
  requireAuth,
  requireAdmin,
  requireSelfOrAdmin,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

import { followUser } from '../follows/follow.controller.js';

const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get('/search', findByUsername);
userRouter.get('/', requireAdmin, findAll);
userRouter.get('/:id', requireSelfOrAdmin, findById);

userRouter.put(
  '/:id/follow',
  requireMutationHeader,
  followUser,
);

userRouter.patch(
  '/:id',
  requireSelfOrAdmin,
  requireMutationHeader,
  update,
);

userRouter.delete(
  '/:id',
  requireSelfOrAdmin,
  requireMutationHeader,
  remove,
);

export default userRouter;