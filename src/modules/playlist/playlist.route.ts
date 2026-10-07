import { Router } from 'express';

import {
  requireAuth,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

import {
  findAll,
  create,
  addTrack,
  removeTrack,
  update,
  remove,
} from './playlist.controller.js';

import {
  findMyPlaylists,
  findSavedPlaylists,
  findPopularPlaylists,
  savePlaylist,
  unsavePlaylist,
} from './playlist-library.controller.js';

export const playlistRouter = Router();

// Todas las operaciones requieren sesión.
playlistRouter.use(requireAuth);

// Consultas: no requieren el header de mutaciones.
playlistRouter.get('/mine', findMyPlaylists);
playlistRouter.get('/saved', findSavedPlaylists);
playlistRouter.get('/popular', findPopularPlaylists);
playlistRouter.get('/', findAll);

// Guardar y dejar de guardar.
playlistRouter.post(
  '/:id/save',
  requireMutationHeader,
  savePlaylist,
);

playlistRouter.delete(
  '/:id/save',
  requireMutationHeader,
  unsavePlaylist,
);

// CRUD existente.
playlistRouter.post('/', requireMutationHeader, create);

playlistRouter.post(
  '/:id/tracks',
  requireMutationHeader,
  addTrack,
);

playlistRouter.delete(
  '/:id/tracks/:trackId',
  requireMutationHeader,
  removeTrack,
);

playlistRouter.patch('/:id', requireMutationHeader, update);
playlistRouter.delete('/:id', requireMutationHeader, remove);

export default playlistRouter;