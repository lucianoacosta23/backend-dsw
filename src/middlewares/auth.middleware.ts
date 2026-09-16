import type { Request, Response, NextFunction } from 'express';

import { authRepository } from '../modules/auth/auth.repository.js';
import { AppError } from '../shared/errors/app-error.js';
import type { User } from '../modules/users/user.entity.js';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');

    const userId = req.session.userId;

    if (userId === undefined) {
      throw new AppError('Debe iniciar sesión', 401);
    }

    const user = await authRepository.findById(userId);

    if (!user) {
      throw new AppError('La sesión ya no es válida', 401);
    }

    res.locals.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = res.locals.authUser as User | undefined;

  if (!user) {
    next(new AppError('Debe iniciar sesión', 401));
    return;
  }

  if (user.category !== 'ADMIN') {
    next(new AppError('No tiene permisos para esta operación', 403));
    return;
  }

  next();
}

export function requireSelfOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = res.locals.authUser as User | undefined;

  if (!user) {
    next(new AppError('Debe iniciar sesión', 401));
    return;
  }

  const rawId = req.params.id;

  if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
    next(new AppError('El ID debe ser un entero positivo', 400));
    return;
  }

  const id = Number(rawId);

  if (!Number.isSafeInteger(id) || id > 2147483647) {
    next(new AppError('El ID está fuera del rango permitido', 400));
    return;
  }

  if (user.id !== id && user.category !== 'ADMIN') {
    next(new AppError('No tiene permisos para acceder a esa cuenta', 403));
    return;
  }

  next();
}

export function requireMutationHeader(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.get('X-Jukeboxd-Request') !== '1') {
    next(new AppError('Falta la cabecera X-Jukeboxd-Request', 403));
    return;
  }

  next();
}