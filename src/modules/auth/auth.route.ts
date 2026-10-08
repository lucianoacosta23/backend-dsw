import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  register,
  login,
  me,
  logout,
  spotifyLogin,
  spotifyCallback,spotifyRegistrationInfo,
completeSpotifyRegistration,
} from './auth.controller.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

const router = Router();

function requireJson(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.is('application/json')) {
    next(new AppError('Debe enviar application/json', 415));
    return;
  }

  next();
}

router.post('/register', requireJson, register);
router.post('/login', requireJson, login);
router.get('/me', me);
router.post('/logout', requireJson, logout);
router.get('/spotify/login', spotifyLogin);
router.get('/spotify/callback', spotifyCallback);
router.get(
  '/spotify/registration',
  spotifyRegistrationInfo,
);

router.post(
  '/spotify/registration',
  requireJson,
  requireMutationHeader,
  completeSpotifyRegistration,
);

export default router;