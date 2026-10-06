import type { Request, Response, NextFunction } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { SpotifyApiError } from './spotify-api.error.js';
import { AppError } from '../../shared/errors/app-error.js';
import { SpotifyClient } from './spotify.client.js';
import { SpotifyImporter } from './spotify.importer.js';
import { Release } from '../releases/release.entity.js';

let spotifyClient: SpotifyClient | undefined;

function getSpotifyClient(): SpotifyClient {
  if (spotifyClient) {
    return spotifyClient;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Faltan SPOTIFY_CLIENT_ID o SPOTIFY_CLIENT_SECRET',
    );
  }

  spotifyClient = new SpotifyClient(clientId, clientSecret);

  return spotifyClient;
}

export async function importAlbum(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const spotifyId = req.params.spotifyId;

    if (
      typeof spotifyId !== 'string' ||
      !/^[a-zA-Z0-9]{22}$/.test(spotifyId)
    ) {
      throw new AppError(
        'El ID del álbum debe tener 22 caracteres alfanuméricos',
        400,
      );
    }

    const em = RequestContext.getEntityManager();

    if (!(em instanceof EntityManager)) {
      throw new Error(
        'No hay un contexto de PostgreSQL activo',
      );
    }

    const importer = new SpotifyImporter(
      getSpotifyClient(),
      em.fork(),
    );

    const result = await importer.importAlbum(spotifyId);

    res.setHeader('Cache-Control', 'no-store');

    res.status(result.createdRelease ? 201 : 200).json({
      message: result.createdRelease
        ? 'Álbum importado correctamente'
        : 'Álbum actualizado correctamente',
      data: result,
    });
  }   catch (error) {
    if (error instanceof SpotifyApiError) {
      if (error.retryAfter !== null) {
        res.setHeader('Retry-After', error.retryAfter);
      }

      next(new AppError(error.message, error.statusCode));
      return;
    }

    next(error);
  }
}
// Consulta Spotify sin guardar resultados en la base local.
export async function searchSpotify(
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
      rawQuery.trim().length === 0 ||
      rawQuery.trim().length > 255
    ) {
      throw new AppError(
        'La búsqueda debe tener entre 1 y 255 caracteres',
        400,
      );
    }

    // Spotify utiliza estos nombres para las categorías.
    const allowedTypes = ['album', 'track', 'artist'] as const;
    type SpotifySearchType = (typeof allowedTypes)[number];

    let types: SpotifySearchType[] = [...allowedTypes];

    if (req.query.type !== undefined) {
      if (typeof req.query.type !== 'string') {
        throw new AppError('type debe ser un texto', 400);
      }

      const values = req.query.type
        .toLowerCase()
        .split(',')
        .map(value => value.trim());

      if (
        values.some(
          value =>
            !allowedTypes.includes(value as SpotifySearchType),
        )
      ) {
        throw new AppError(
          'Los filtros permitidos son album, track y artist',
          400,
        );
      }

      types = [...new Set(values)] as SpotifySearchType[];
    }

    // Reutiliza el cliente y las credenciales que usa el importador.
    const results = await getSpotifyClient().searchCatalog(
      rawQuery.trim(),
      types,
    );

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      message: 'Resultados de Spotify',
      data: results,
    });
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      if (error.retryAfter !== null) {
        res.setHeader('Retry-After', error.retryAfter);
      }

      next(new AppError(error.message, error.statusCode));
      return;
    }

    next(error);
  }
}
// Convierte un álbum de Spotify en un lanzamiento local para abrir su detalle.
export async function importSelectedAlbum(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const spotifyId = req.params.spotifyId;

    if (
      typeof spotifyId !== 'string' ||
      !/^[a-zA-Z0-9]{22}$/.test(spotifyId)
    ) {
      throw new AppError(
        'El ID del álbum debe tener 22 caracteres alfanuméricos',
        400,
      );
    }

    const em = RequestContext.getEntityManager();

    if (!(em instanceof EntityManager)) {
      throw new Error('No hay un contexto de PostgreSQL activo');
    }

    res.setHeader('Cache-Control', 'no-store');

    // Si ya lo tenemos, reutilizamos el registro sin actualizarlo.
    const existing = await em.findOne(Release, { spotifyId });

    if (existing) {
      res.status(200).json({
        message: 'El álbum ya está en el catálogo',
        data: {
          releaseId: existing.id,
          createdRelease: false,
        },
      });

      return;
    }

    // El importador también guarda las canciones y sus artistas.
    const importer = new SpotifyImporter(
      getSpotifyClient(),
      em.fork(),
    );

    const result = await importer.importAlbum(spotifyId);

    res.status(result.createdRelease ? 201 : 200).json({
      message: 'Álbum disponible en el catálogo',
      data: {
        releaseId: result.releaseId,
        createdRelease: result.createdRelease,
      },
    });
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      if (error.retryAfter !== null) {
        res.setHeader('Retry-After', error.retryAfter);
      }

      next(new AppError(error.message, error.statusCode));
      return;
    }

    next(error);
  }
}