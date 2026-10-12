import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { PlaylistRepository, type CreatePlaylistInput } from './playlist.repository.js';
import type { User } from '../users/user.entity.js';
import { publicPlaylist } from './playlist.response.js';

const playlistRepository = new PlaylistRepository();

// Obtiene el dueño desde la sesión que verificó requireAuth.
function getAuthenticatedUserId(res: Response): number {
  const user = res.locals.authUser as User | undefined;

  if (user?.id === undefined) {
    throw new AppError('Debe iniciar sesión', 401);
  }

  return user.id;
}

// Valida IDs de la URL antes de consultar la base.
function parseRouteId(value: unknown, label: string): number {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw new AppError(`El ID de ${label} no es válido`, 400);
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id > 2147483647) {
    throw new AppError(`El ID de ${label} no es válido`, 400);
  }

  return id;
}

export async function findAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const playlists = await playlistRepository.findAll();

    res.status(200).json({
      message: 'Playlists obtenidas con éxito',
      data: await Promise.all(playlists.map(publicPlaylist)),
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
    // El propietario se obtiene de la sesión autenticada.
    const user = res.locals.authUser as User | undefined;

    if (user?.id === undefined) {
      throw new AppError('Debe iniciar sesión', 401);
    }

    if (
      typeof req.body !== 'object' ||
      req.body === null ||
      Array.isArray(req.body)
    ) {
      throw new AppError('El cuerpo debe ser un objeto JSON', 400);
    }

    const { name, trackIds } = req.body;

    if (typeof name !== 'string' || name.trim() === '') {
      throw new AppError(
        'El nombre de la playlist es obligatorio y debe ser un texto válido',
        400,
      );
    }

    let validatedTrackIds: number[] | undefined;

    if (trackIds !== undefined) {
      if (
        !Array.isArray(trackIds) ||
        !trackIds.every(
          id =>
            typeof id === 'number' &&
            Number.isSafeInteger(id) &&
            id > 0 &&
            id <= 2147483647,
        )
      ) {
        throw new AppError(
          'trackIds debe ser un array de enteros positivos',
          400,
        );
      }

      validatedTrackIds = trackIds;
    }

    const input: CreatePlaylistInput = {
      name: name.trim(),
      userId: user.id,
      // Agrega la propiedad solamente cuando se enviaron pistas.
      ...(validatedTrackIds === undefined
        ? {}
        : { trackIds: validatedTrackIds }),
    };

    const playlist = await playlistRepository.create(input);

    res.status(201).json({
      message: 'Playlist creada',
      data: await publicPlaylist(playlist),
    });
  } catch (error) {
    next(error);
  }
}

export async function addTrack(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = res.locals.authUser as User | undefined;

    if (user?.id === undefined) {
      throw new AppError('Debe iniciar sesión', 401);
    }

    const rawPlaylistId = req.params.id;

    if (
      typeof rawPlaylistId !== 'string' ||
      !/^[1-9]\d*$/.test(rawPlaylistId)
    ) {
      throw new AppError('El ID de la playlist no es válido', 400);
    }

    const playlistId = Number(rawPlaylistId);

    if (
      !Number.isSafeInteger(playlistId) ||
      playlistId > 2147483647
    ) {
      throw new AppError('El ID de la playlist no es válido', 400);
    }

    if (
      typeof req.body !== 'object' ||
      req.body === null ||
      Array.isArray(req.body)
    ) {
      throw new AppError('El cuerpo debe ser un objeto JSON', 400);
    }

    const { trackId } = req.body;

    if (
      typeof trackId !== 'number' ||
      !Number.isSafeInteger(trackId) ||
      trackId <= 0 ||
      trackId > 2147483647
    ) {
      throw new AppError(
        'trackId debe ser un entero positivo válido',
        400,
      );
    }

    const playlist = await playlistRepository.addTrack(
      playlistId,
      trackId,
      user.id,
    );

    // Devuelve únicamente los datos necesarios para mostrar la playlist.
    res.status(200).json({
      message: 'Canción agregada a la playlist',
      data: {
        id: playlist.id,
        name: playlist.name,
        tracks: playlist.tracks.getItems().map(track => ({
          id: track.id,
          spotifyId: track.spotifyId,
          name: track.name,
          durationMs: track.durationMs,
          release: {
            id: track.release.id,
            name: track.release.name,
            imageUrl: track.release.imageUrl,
          },
          artists: track.artists.getItems().map(artist => ({
            id: artist.id,
            name: artist.name,
          })),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function removeTrack(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ownerId = getAuthenticatedUserId(res);
    const playlistId = parseRouteId(req.params.id, 'la playlist');
    const trackId = parseRouteId(req.params.trackId, 'la canción');

    const playlist = await playlistRepository.removeTrack(
      playlistId,
      trackId,
      ownerId,
    );

    res.status(200).json({
      message: 'Canción eliminada de la playlist con éxito',
      data: await publicPlaylist(playlist),
    });
  } catch (error) {
    next(error);
  }
}

export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ownerId = getAuthenticatedUserId(res);
    const id = parseRouteId(req.params.id, 'la playlist');

    if (
      typeof req.body !== 'object' ||
      req.body === null ||
      Array.isArray(req.body)
    ) {
      throw new AppError('El cuerpo debe ser un objeto JSON', 400);
    }

    const { name } = req.body;

    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      name.trim().length > 255
    ) {
      throw new AppError(
        'El nombre debe tener entre 1 y 255 caracteres',
        400,
      );
    }

    const playlist = await playlistRepository.updatePlaylist(
      id,
      name.trim(),
      ownerId,
    );

    res.status(200).json({
      message: 'Playlist actualizada con éxito',
      data: await publicPlaylist(playlist),
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
    const ownerId = getAuthenticatedUserId(res);
    const id = parseRouteId(req.params.id, 'la playlist');

    await playlistRepository.deletePlaylist(id, ownerId);

    res.status(200).json({
      success: true,
      message: 'Playlist eliminada con éxito',
    });
  } catch (error) {
    next(error);
  }
}

