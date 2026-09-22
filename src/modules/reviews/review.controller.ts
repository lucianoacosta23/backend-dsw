import type { Request, Response, NextFunction } from 'express';
import { ForeignKeyConstraintViolationException } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import type { User } from '../users/user.entity.js';
import type { Review } from './review.entity.js';
import type { ReviewActor } from './review.rules.js';
import { ReviewRepository } from './review.repository.js';
import {
  parseCreateReview,
  parseEditReview,
  parseReviewId,
  parseReviewList,
  validateDeleteReviewBody,
} from './review.validation.js';

const reviewRepository = new ReviewRepository();

function actor(res: Response): ReviewActor {
  const user = res.locals.authUser as User | undefined;
  if (user?.id === undefined) throw new AppError('Debe iniciar sesión', 401);
  return { id: user.id, category: user.category };
}

function reviewResponse(review: Review) {
  return {
    id: review.id,
    author: { id: review.author.id, username: review.author.username },
    releaseId: review.release.id,
    text: review.text,
    rating: review.rating,
    createdAt: review.createdAt,
    editedAt: review.editedAt,
  };
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseReviewList(req.query);
    const [reviews, total] = await reviewRepository.findAll(input);
    res.status(200).json({
      message: 'Listado de reseñas',
      data: reviews.map(reviewResponse),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
      sort: 'newest',
    });
  } catch (error) {
    next(error);
  }
}

export async function findById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const review = await reviewRepository.findById(parseReviewId(req.params.id));
    if (!review) throw new AppError('Reseña no encontrada', 404);
    res.status(200).json({ message: 'Reseña encontrada', data: reviewResponse(review) });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const review = await reviewRepository.create(parseCreateReview(req.body), actor(res).id);
    res.status(201).json({ message: 'Reseña creada', data: reviewResponse(review) });
  } catch (error) {
    if (error instanceof ForeignKeyConstraintViolationException) {
      next(new AppError('El autor o lanzamiento ya no existe', 409));
      return;
    }
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const review = await reviewRepository.updateText(
      parseReviewId(req.params.id), parseEditReview(req.body), actor(res),
    );
    res.status(200).json({ message: 'Reseña actualizada', data: reviewResponse(review) });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseReviewId(req.params.id);
    validateDeleteReviewBody(req.body);
    await reviewRepository.delete(id, actor(res));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
