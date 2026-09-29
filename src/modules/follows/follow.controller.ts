import type { Request, Response, NextFunction } from 'express';
import { UniqueConstraintViolationException } from '@mikro-orm/core';

import { FollowRepository } from './follow.repository.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { User } from '../users/user.entity.js';

const followRepository = new FollowRepository();

export async function followUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authUser = res.locals.authUser as User | undefined;

    if (!authUser || authUser.id === undefined) {
      throw new AppError('Debe iniciar sesión', 401);
    }

    const rawId = req.params.id;

    if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
      throw new AppError('El ID debe ser un entero positivo', 400);
    }

    const followedId = Number(rawId);

    if (
      !Number.isSafeInteger(followedId) ||
      followedId > 2147483647
    ) {
      throw new AppError(
        'El ID está fuera del rango permitido',
        400,
      );
    }

    if (authUser.id === followedId) {
      throw new AppError(
        'No podés seguirte a vos mismo',
        400,
      );
    }

    const follow = await followRepository.create(
      authUser.id,
      followedId,
    );

    res.status(201).json({
      message: 'Usuario seguido correctamente',
      data: {
        followerId: follow.follower.id,
        followedId: follow.followed.id,
        createdAt: follow.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof UniqueConstraintViolationException) {
      next(
        new AppError(
          'Ya estás siguiendo a este usuario',
          409,
        ),
      );
      return;
    }

    next(error);
  }
}