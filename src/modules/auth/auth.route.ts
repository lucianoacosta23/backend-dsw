import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  register,
  login,
  me,
  logout,
  spotifyLogin,
  spotifyCallback,
} from './auth.controller.js';
import { AppError } from '../../shared/errors/app-error.js';


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

export default router;