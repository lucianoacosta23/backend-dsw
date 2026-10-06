import { Router } from 'express';

import {
  requireAuth,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

import {
  searchSpotify,
  importSelectedAlbum,
} from './spotify.controller.js';

const spotifyCatalogRouter = Router();

// Estas operaciones están disponibles para USER y ADMIN.
spotifyCatalogRouter.use(requireAuth);

// Buscar no guarda información.
spotifyCatalogRouter.get('/search', searchSpotify);

// Seleccionar un álbum puede crear registros: requiere el header.
spotifyCatalogRouter.post(
  '/albums/:spotifyId/import',
  requireMutationHeader,
  importSelectedAlbum,
);

export default spotifyCatalogRouter;
