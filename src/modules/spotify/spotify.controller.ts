import type { Request, Response, NextFunction } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { SpotifyApiError } from './spotify-api.error.js';
import { AppError } from '../../shared/errors/app-error.js';
import { SpotifyClient } from './spotify.client.js';
import { SpotifyImporter } from './spotify.importer.js';

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