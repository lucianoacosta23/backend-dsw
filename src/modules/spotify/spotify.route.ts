import { Router } from 'express';

import { importAlbum } from './spotify.controller.js';
import {
  requireAuth,
  requireAdmin,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

const spotifyRouter = Router();

spotifyRouter.post(
  '/albums/:spotifyId/import',
  requireAuth,
  requireAdmin,
  requireMutationHeader,
  importAlbum,
);

export default spotifyRouter;