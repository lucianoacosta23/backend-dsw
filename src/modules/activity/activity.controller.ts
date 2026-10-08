import type { Request, Response, NextFunction } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import type { User } from '../users/user.entity.js';
import { ActivityRepository } from './activity.repository.js';

const repository = new ActivityRepository();

function parsePageNumber(
  value: unknown,
  field: string,
  max: number,
): number {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw new AppError(
      `${field} debe ser un entero positivo`,
      400,
    );
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number > max) {
    throw new AppError(
      `${field} debe estar entre 1 y ${max}`,
      400,
    );
  }

  return number;
}

export async function findActivity(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = res.locals.authUser as User | undefined;

    if (user?.id === undefined) {
      throw new AppError('Debe iniciar sesión', 401);
    }

    if (
      Object.keys(req.query).some(
        key => !['scope', 'page', 'pageSize'].includes(key),
      )
    ) {
      throw new AppError(
        'Solo se permiten scope, page y pageSize',
        400,
      );
    }

    const scope = req.query.scope ?? 'following';

    if (
      scope !== 'following' &&
      scope !== 'own' &&
      scope !== 'incoming'
    ) {
      throw new AppError(
        'scope debe ser following, own o incoming',
        400,
      );
    }

    const page = parsePageNumber(
      req.query.page ?? '1',
      'page',
      1000000,
    );

    const pageSize = parsePageNumber(
      req.query.pageSize ?? '20',
      'pageSize',
      100,
    );

    // Cada consulta recibe únicamente el usuario de la sesión.
    const result = scope === 'incoming'
      ? await repository.findIncoming(user.id, page, pageSize)
      : await repository.findAll(user.id, {
          scope,
          page,
          pageSize,
        });

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      message: 'Listado de actividad',
      scope,
      data: result.items,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
}