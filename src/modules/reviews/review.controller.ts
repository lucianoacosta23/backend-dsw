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

function reviewResponse(review: Review, likeCount?: number) {
  return {
    id: review.id,
    author: { id: review.author.id, username: review.author.username },
    releaseId: review.release?.id ?? null,
    trackId: review.track?.id ?? null,
    text: review.text,
    rating: review.rating,
    ...(likeCount === undefined ? {} : { likeCount }),
    createdAt: review.createdAt,
    editedAt: review.editedAt,
  };
}

export async function findAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = parseReviewList(req.query);
    const { items, total } = await reviewRepository.findAll(
      input,
      req.session.userId,
    );

    res.status(200).json({
      message: 'Listado de reseñas',
      data: items.map(({ review, likeCount, likedByMe }) => ({
        ...reviewResponse(review, likeCount),
        likedByMe,
      })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
      sort: input.sort,
    });
  } catch (error) {
    next(error);
  }
}

export async function findById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await reviewRepository.findDetail(
      parseReviewId(req.params.id),
      req.session.userId,
    );

    if (!result) {
      throw new AppError('Reseña no encontrada', 404);
    }

    const { review, likeCount, likedByMe } = result;
    const track = review.track;
    const release = review.release;

    if (!track && !release) {
      throw new Error('La reseña no tiene música asociada');
    }

    const target = track
      ? {
          type: 'track',
          id: track.id,
          name: track.name,
          imageUrl: track.release.imageUrl,
          artists: track.artists.getItems().map(artist => ({
            id: artist.id,
            name: artist.name,
          })),
        }
      : {
          type: 'release',
          id: release!.id,
          name: release!.name,
          imageUrl: release!.imageUrl,
          artists: release!.artists.getItems().map(artist => ({
            id: artist.id,
            name: artist.name,
          })),
        };

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      message: 'Reseña encontrada',
      data: {
        ...reviewResponse(review, likeCount),
        likedByMe,
        target,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const review = await reviewRepository.create(
      parseCreateReview(req.body),
      actor(res).id,
    );

    res.status(201).json({
      message: 'Reseña creada',
      data: reviewResponse(review),
    });
  } catch (error) {
    if (error instanceof ForeignKeyConstraintViolationException) {
      next(new AppError('El autor, lanzamiento o pista ya no existe.', 409));
      return;
    }

    next(error);
  }
}

export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const review = await reviewRepository.updateText(
      parseReviewId(req.params.id),
      parseEditReview(req.body),
      actor(res),
    );

    res.status(200).json({
      message: 'Reseña actualizada',
      data: reviewResponse(review),
    });
  } catch (error) {
    next(error);
  }
}

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseReviewId(req.params.id);
    validateDeleteReviewBody(req.body);
    await reviewRepository.delete(id, actor(res));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

// Endpoint público para el promedio y la distribución de puntuaciones.
export async function getRatingStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const allowedFields = ['releaseId', 'trackId'];

    if (
      Object.keys(req.query).some(key => !allowedFields.includes(key))
    ) {
      throw new AppError(
        'Solo se permiten los filtros releaseId y trackId',
        400,
      );
    }

    const hasReleaseId = req.query.releaseId !== undefined;
    const hasTrackId = req.query.trackId !== undefined;

    // Debe consultar un solo destino.
    if (hasReleaseId === hasTrackId) {
      throw new AppError(
        'Debe indicar releaseId o trackId, pero no ambos',
        400,
      );
    }

    const targetType = hasReleaseId ? 'release' : 'track';
    const targetId = parseReviewId(
      hasReleaseId ? req.query.releaseId : req.query.trackId,
    );

    const stats = await reviewRepository.getRatingStats(
      targetType,
      targetId,
    );

    res.status(200).json({
      message: 'Estadísticas de puntuaciones',
      data: {
        targetType,
        targetId,
        ...stats,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function findPopularReviews(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (
      Object.keys(req.query).some(
        key => !['page', 'pageSize'].includes(key),
      )
    ) {
      throw new AppError(
        'Solo se permiten los filtros page y pageSize',
        400,
      );
    }

    const page = req.query.page === undefined
      ? 1
      : parseReviewId(req.query.page);

    const pageSize = req.query.pageSize === undefined
      ? 4
      : parseReviewId(req.query.pageSize);

    if (pageSize > 100) {
      throw new AppError('pageSize no puede superar 100', 400);
    }

    if ((page - 1) * pageSize > 2147483647) {
      throw new AppError('La página está fuera del rango permitido', 400);
    }

    const { items, total } = await reviewRepository.findPopular(
      page,
      pageSize,
      actor(res).id,
    );

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      message: 'Reseñas más populares',
      data: items.map(({ review, likeCount, likedByMe }) => {
        const track = review.track;
        const release = review.release;

        if (!track && !release) {
          throw new Error('La reseña no tiene música asociada');
        }

        const target = track
          ? {
              type: 'track',
              id: track.id,
              name: track.name,
              imageUrl: track.release.imageUrl,
              artists: track.artists.getItems().map(artist => ({
                id: artist.id,
                name: artist.name,
              })),
            }
          : {
              type: 'release',
              id: release!.id,
              name: release!.name,
              imageUrl: release!.imageUrl,
              artists: release!.artists.getItems().map(artist => ({
                id: artist.id,
                name: artist.name,
              })),
            };

        return {
          ...reviewResponse(review, likeCount),
          likedByMe,
          target,
        };
      }),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      sort: 'popular',
    });
  } catch (error) {
    next(error);
  }
}

export async function findHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reviewId = parseReviewId(req.params.id);

    const parsePageValue = (
      value: unknown,
      defaultValue: number,
      maximum: number,
      field: string,
    ): number => {
      if (value === undefined) return defaultValue;

      if (
        typeof value !== 'string' ||
        !/^[1-9]\d*$/.test(value)
      ) {
        throw new AppError(
          `${field} debe ser un entero positivo`,
          400,
        );
      }

      const parsed = Number(value);

      if (!Number.isSafeInteger(parsed) || parsed > maximum) {
        throw new AppError(
          `${field} debe ser menor o igual a ${maximum}`,
          400,
        );
      }

      return parsed;
    };

    const page = parsePageValue(
      req.query.page,
      1,
      1_000_000,
      'page',
    );

    const pageSize = parsePageValue(
      req.query.pageSize,
      10,
      100,
      'pageSize',
    );

    const { items, total } = await reviewRepository.findHistory(
      reviewId,
      page,
      pageSize,
    );

    res.status(200).json({
      message: 'Historial de la reseña',
      data: items.map(revision => ({
        id: revision.id,
        text: revision.text,
        effectiveAt: revision.effectiveAt,
        replacedAt: revision.replacedAt,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
}