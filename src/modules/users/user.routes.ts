import { Router } from 'express';

import {
  findAll,
  findById,
  update,
  remove,
} from './user.controller.js';

import {
  requireAuth,
  optionalAuth,
  requireSelf,
  requireAdmin,
  requireSelfOrAdmin,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

import { followUser, unfollowUser } from '../follows/follow.controller.js';
import { readProfile, updateProfile, listAuthorPlaylists } from '../profiles/profile.controller.js';
import { receiveImage, uploadImage } from '../profiles/image.http.js';

const userRouter = Router();

userRouter.get('/search', optionalAuth, readProfile);
userRouter.get('/:id/profile', optionalAuth, readProfile);
userRouter.get('/:id/playlists', optionalAuth, listAuthorPlaylists);

userRouter.use(requireAuth);

userRouter.get('/me', readProfile);
userRouter.patch('/me/profile', requireMutationHeader, updateProfile);
userRouter.post('/me/images', requireMutationHeader, receiveImage, uploadImage);
userRouter.get('/', requireAdmin, findAll);
userRouter.get('/:id', requireSelfOrAdmin, findById);

userRouter.put(
  '/:id/follow',
  requireMutationHeader,
  followUser,
);
// requireAuth ya se aplica a todo este router.
userRouter.delete(
  '/:id/follow',
  requireMutationHeader,
  unfollowUser,
);
userRouter.patch(
  '/:id',
  requireSelf,
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
