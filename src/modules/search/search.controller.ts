import type { Request, Response, NextFunction } from 'express';
import { wrap } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';

import { TrackRepository } from '../tracks/track.repository.js';
import { ReleaseRepository } from '../releases/release.repository.js';
import { ArtistRepository } from '../artists/artist.repository.js';
import { UserRepository } from '../users/user.repository.js';
import { PlaylistRepository } from '../playlist/playlist.repository.js';

const trackRepo = new TrackRepository();
const releaseRepo = new ReleaseRepository();
const artistRepo = new ArtistRepository();
const userRepo = new UserRepository();
const playlistRepo = new PlaylistRepository();

// Estos nombres también se usarán en los filtros del frontend.
const SEARCH_TYPES = [
  'tracks',
  'releases',
  'artists',
  'users',
  'playlists',
] as const;

type SearchType = (typeof SEARCH_TYPES)[number];

// Sin filtro busca en todo. También acepta varios separados por comas.
function parseSearchTypes(value: unknown): SearchType[] {
  if (value === undefined) {
    return [...SEARCH_TYPES];
  }

  if (typeof value !== 'string') {
    throw new AppError(
      'El filtro type debe ser un texto separado por comas',
      400,
    );
  }

  const values = value
    .toLowerCase()
    .split(',')
    .map(item => item.trim());

  if (
    values.some(
      item => !SEARCH_TYPES.includes(item as SearchType),
    )
  ) {
    throw new AppError(
      'Los filtros permitidos son tracks, releases, artists, users y playlists',
      400,
    );
  }

  // Evita repetir una búsqueda si se envía dos veces la misma categoría.
  return [...new Set(values)] as SearchType[];
}

export async function searchAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (
      Object.keys(req.query).some(
        key => !['q', 'type'].includes(key),
      )
    ) {
      throw new AppError('Solo se permiten q y type', 400);
    }

    const rawQuery = req.query.q;

    if (
      typeof rawQuery !== 'string' ||
      rawQuery.trim().length === 0
    ) {
      throw new AppError(
        'Debe proporcionar un término de búsqueda',
        400,
      );
    }

    const searchTerm = rawQuery.trim();

    if (searchTerm.length > 255) {
      throw new AppError(
        'La búsqueda no puede superar los 255 caracteres',
        400,
      );
    }

    const types = parseSearchTypes(req.query.type);

    // Consulta únicamente las categorías seleccionadas.
    const tracks = types.includes('tracks')
      ? await trackRepo.searchByName(searchTerm)
      : [];

    const releases = types.includes('releases')
      ? await releaseRepo.searchByName(searchTerm)
      : [];

    const artists = types.includes('artists')
      ? await artistRepo.searchByName(searchTerm)
      : [];

    const users = types.includes('users')
      ? await userRepo.searchByName(searchTerm)
      : [];

    const playlists = types.includes('playlists')
      ? await playlistRepo.searchByName(searchTerm)
      : [];

    res.status(200).json({
      success: true,
      data: {
        tracks: tracks.map(track => wrap(track).toPOJO()),
        releases: releases.map(release => wrap(release).toPOJO()),
        artists: artists.map(artist => wrap(artist).toPOJO()),

        // La búsqueda muestra datos públicos del usuario.
        users: users.map(user => ({
          id: user.id,
          username: user.username,
          fullName: user.fullName,
        })),

        playlists: playlists.map(playlist => ({
          id: playlist.id,
          name: playlist.name,
          userId: playlist.user.id,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}