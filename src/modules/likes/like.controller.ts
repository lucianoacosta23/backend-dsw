import type { Request, Response, NextFunction } from 'express';
import { ForeignKeyConstraintViolationException, UniqueConstraintViolationException } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import type { User } from '../users/user.entity.js';
import { parseReviewId } from '../reviews/review.validation.js';
import { ReviewLikeRepository } from './like.repository.js';

const repository = new ReviewLikeRepository();

function authUserId(res: Response): number {
  const user = res.locals.authUser as User | undefined;
  if (user?.id === undefined) throw new AppError('Debe iniciar sesión', 401);
  return user.id;
}

export async function addLike(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reviewId = parseReviewId(req.params.reviewId);
    const { like, likeCount } = await repository.like(reviewId, authUserId(res));

    res.status(201).json({
      message: 'Like registrado',
      data: { reviewId, liked: true, likeCount, createdAt: like.createdAt },
    });
  } catch (error) {
    if (error instanceof UniqueConstraintViolationException) {
      next(new AppError('Ya diste like a esta reseña', 409));
      return;
    }
    if (error instanceof ForeignKeyConstraintViolationException) {
      next(new AppError('El usuario o la reseña ya no existe', 409));
      return;
    }
    next(error);
  }
}

export async function removeLike(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reviewId = parseReviewId(req.params.reviewId);
    const likeCount = await repository.unlike(reviewId, authUserId(res));

    res.status(200).json({
      message: 'Like eliminado',
      data: { reviewId, liked: false, likeCount },
    });
  } catch (error) {
    next(error);
  }
}
