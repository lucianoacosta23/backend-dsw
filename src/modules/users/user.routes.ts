import { Router } from 'express';

import {
  findAll,
  findById,
  update,
  remove,
} from './user.controller.js';

import {
  requireAuth,
  requireAdmin,
  requireSelfOrAdmin,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

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

export default userRouter;