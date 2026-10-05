import { Router } from 'express';
import { findAll, create, addTrack, removeTrack, update, remove } from './playlist.controller.js';
import {
  requireAuth,
  requireAdmin,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';


export const playlistRouter = Router();

playlistRouter.get('/', requireAuth, requireMutationHeader, findAll);

playlistRouter.post('/', requireAuth, requireMutationHeader, create);

playlistRouter.post('/:id/tracks', requireAuth, requireMutationHeader, addTrack);

playlistRouter.delete('/:id/tracks/:trackId', requireAuth, requireMutationHeader, removeTrack);

playlistRouter.patch('/:id', requireAuth, requireMutationHeader, update);

playlistRouter.delete('/:id', requireAuth, requireMutationHeader, remove)

export default playlistRouter;
