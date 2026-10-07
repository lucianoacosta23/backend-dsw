import type { Request, Response, NextFunction } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import type { User } from '../users/user.entity.js';
import {
  PlaylistLibraryRepository,
  type PlaylistListMode,
} from './playlist-library.repository.js';

const repository = new PlaylistLibraryRepository();

function getUserId(res: Response): number {
  const user = res.locals.authUser as User | undefined;

  if (user?.id === undefined) {
    throw new AppError('Debe iniciar sesión', 401);
  }

  return user.id;
}

function parsePositiveInteger(
  value: unknown,
  field: string,
  max: number,
): number {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw new AppError(`${field} debe ser un entero positivo`, 400);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number > max) {
    throw new AppError(`${field} debe estar entre 1 y ${max}`, 400);
  }

  return number;
}

function readPagination(req: Request) {
  if (
    Object.keys(req.query).some(
      key => !['page', 'pageSize'].includes(key),
    )
  ) {
    throw new AppError('Solo se permiten page y pageSize', 400);
  }

  return {
    page: parsePositiveInteger(
      req.query.page ?? '1',
      'page',
      1000000,
    ),
    pageSize: parsePositiveInteger(
      req.query.pageSize ?? '20',
      'pageSize',
      100,
    ),
  };
}

function listHandler(mode: PlaylistListMode) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = getUserId(res);
      const input = readPagination(req);
      const result = await repository.list(mode, userId, input);

      res.setHeader('Cache-Control', 'no-store');

      res.status(200).json({
        message: 'Listado de playlists',
        data: result.items,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / input.pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const findMyPlaylists = listHandler('mine');
export const findSavedPlaylists = listHandler('saved');
export const findPopularPlaylists = listHandler('popular');

export async function findPlaylistDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(res);
    const playlistId = parsePositiveInteger(
      req.params.id,
      'El ID de la playlist',
      2147483647,
    );

    const playlist = await repository.findDetail(playlistId, userId);

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      message: 'Playlist obtenida con éxito',
      data: playlist,
    });
  } catch (error) {
    next(error);
  }
}

export async function savePlaylist(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(res);
    const playlistId = parsePositiveInteger(
      req.params.id,
      'El ID de la playlist',
      2147483647,
    );

    const result = await repository.save(playlistId, userId);

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      message: 'Playlist guardada en tu biblioteca',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function unsavePlaylist(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = getUserId(res);
    const playlistId = parsePositiveInteger(
      req.params.id,
      'El ID de la playlist',
      2147483647,
    );

    const result = await repository.unsave(playlistId, userId);

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      message: 'Playlist quitada de tu biblioteca',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}