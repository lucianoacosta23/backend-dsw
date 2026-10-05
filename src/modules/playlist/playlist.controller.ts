import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { PlaylistRepository, type CreatePlaylistInput } from './playlist.repository.js';
import type { User } from '../users/user.entity.js';

const playlistRepository = new PlaylistRepository();

export async function findAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const playlists = await playlistRepository.findAll();

    res.status(200).json({
      message: 'Playlists obtenidas con éxito',
      data: playlists,
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
      data: playlist,
    });
  } catch (error) {
    next(error);
  }
}

//funcion para agregar canciones a la play list

export async function addTrack(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  try {
    const playlistId = Number(req.params.id);
    const { trackId } = req.body;

    const updatedPlaylist = await playlistRepository.addTrack(
      playlistId, 
      Number(trackId)
    );

    res.status(200).json({
      message: 'Canción agregada a la playlist con éxito',
      data: updatedPlaylist,
    });
  } catch (error) {
    next(error);
  }
}

//funcion para eliminar una track de la play list

export async function removeTrack(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const playlistId = Number(req.params.id);
    const trackId = Number(req.params.trackId);

    // Llamamos al método que creamos en el repositorio
    const playlist = await playlistRepository.removeTrack(playlistId, trackId);

    res.status(200).json({
      message: 'Canción eliminada de la playlist con éxito',
      data: playlist,
    });
  } catch (error) {
    next(error);
  }
}

//funcion para actualizar una play list, solo se actualiza el nombre
export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        message: 'El campo nombre es obligatorio',
      });
      return;
    }

    const updatedPlaylist = await playlistRepository.updatePlaylist(id, name);

    res.status(200).json({
      message: 'Playlist actualizada con éxito',
      data: updatedPlaylist,
    });
  } catch (error) {
    next(error);
  }
}

//eliminacion de una playlist total
export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Number(req.params.id);

    await playlistRepository.deletePlaylist(id);

    res.status(200).json({
      success: true,
      message: 'Playlist eliminada con éxito',
    });
  } catch (error) {
    next(error);
  }
}

