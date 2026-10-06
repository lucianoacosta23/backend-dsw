import { Router } from 'express';

import {
  requireAuth,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

import {
  searchSpotify,
  importSelectedAlbum,
  importSelectedTrack,
  importSelectedArtist,
} from './spotify.controller.js';

const spotifyCatalogRouter = Router();

// Disponibles para usuarios autenticados, tanto USER como ADMIN.
spotifyCatalogRouter.use(requireAuth);

// Buscar consulta Spotify sin guardar los resultados.
spotifyCatalogRouter.get('/search', searchSpotify);

// Importar modifica el catálogo: requiere el header de mutaciones.
spotifyCatalogRouter.post(
  '/albums/:spotifyId/import',
  requireMutationHeader,
  importSelectedAlbum,
);

spotifyCatalogRouter.post(
  '/tracks/:spotifyId/import',
  requireMutationHeader,
  importSelectedTrack,
);

spotifyCatalogRouter.post(
  '/artists/:spotifyId/import',
  requireMutationHeader,
  importSelectedArtist,
);

export default spotifyCatalogRouter;