import { Router } from 'express';

import {
  findAll,
  findById,
  update,
  remove,
} from '../users/user.controller.js';

import {
  requireAuth,
  requireAdmin,
  requireSelfOrAdmin,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

import {
  followUser,
} from '../follows/follow.controller.js';

const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get('/', requireAdmin, findAll);
userRouter.get('/:id', requireSelfOrAdmin, findById);

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

userRouter.put(
  '/:id/follow',
  requireMutationHeader,
  followUser,
);

export default userRouter;