import type { EntityManager } from '@mikro-orm/postgresql';

import { Artist } from '../artists/artist.entity.js';
import {
  Release,
  ReleaseType,
  ReleaseDatePrecision,
} from '../releases/release.entity.js';
import { Track } from '../tracks/track.entity.js';
import { SpotifyClient } from './spotify.client.js';

function object(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`${field}: se esperaba un objeto`);
  }

  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > 255
  ) {
    throw new Error(`${field}: texto vacío o inválido`);
  }

  return value.trim();
}

function spotifyId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9]{22}$/.test(value)
  ) {
    throw new Error('Spotify devolvió un ID inválido');
  }

  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  ) {
    throw new Error(`${field}: entero positivo inválido`);
  }

  return value;
}

function parseArtists(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('El lanzamiento o la pista no tiene artistas');
  }

  const artists = value.map(item => {
    const artist = object(item, 'artista');

    return {
      spotifyId: spotifyId(artist.id),
      name: text(artist.name, 'nombre del artista'),
    };
  });

  return [...new Map(
    artists.map(artist => [artist.spotifyId, artist]),
  ).values()];
}

function parseDate(
  dateValue: unknown,
  precisionValue: unknown,
) {
  const date = text(dateValue, 'fecha');

  let precision: ReleaseDatePrecision;
  let fullDate: string;

  switch (precisionValue) {
    case 'year':
      if (!/^\d{4}$/.test(date)) {
        throw new Error('Formato de año inválido');
      }

      precision = ReleaseDatePrecision.YEAR;
      fullDate = `${date}-01-01`;
      break;

    case 'month':
      if (!/^\d{4}-\d{2}$/.test(date)) {
        throw new Error('Formato de mes inválido');
      }

      precision = ReleaseDatePrecision.MONTH;
      fullDate = `${date}-01`;
      break;

    case 'day':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Formato de fecha inválido');
      }

      precision = ReleaseDatePrecision.DAY;
      fullDate = date;
      break;

    default:
      throw new Error('Precisión de fecha desconocida');
  }

  const parsed = new Date(`${fullDate}T00:00:00.000Z`);

  if (
    Number(date.slice(0, 4)) < 1 ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== fullDate
  ) {
    throw new Error('Spotify devolvió una fecha inexistente');
  }

  return { date, precision };
}

function parseReleaseType(value: unknown): ReleaseType {
  switch (value) {
    case 'album':
      return ReleaseType.ALBUM;
    case 'single':
      return ReleaseType.SINGLE;
    case 'compilation':
      return ReleaseType.COMPILATION;
    default:
      throw new Error('Tipo de lanzamiento desconocido');
  }
}

function parseImage(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error('Lista de imágenes inválida');
  }

  if (value.length === 0) {
    return null;
  }

  const image = object(value[0], 'imagen');

  if (typeof image.url !== 'string') {
    throw new Error('URL de imagen inválida');
  }

  const url = new URL(image.url);

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Protocolo de imagen inválido');
  }

  return url.href;
}

export class SpotifyImporter {
  constructor(
    private readonly client: SpotifyClient,
    private readonly em: EntityManager,
  ) {}

  async importAlbum(albumId: string) {
    // Las solicitudes HTTP ocurren antes de abrir la transacción.
    const { album, tracks } =
      await this.client.getAlbumWithTracks(albumId);

    const releaseData = {
      spotifyId: spotifyId(album.id),
      name: text(album.name, 'nombre del lanzamiento'),
      type: parseReleaseType(album.album_type),
      imageUrl: parseImage(album.images),
      artists: parseArtists(album.artists),
      ...parseDate(album.release_date, album.release_date_precision),
    };

    const tracksData = tracks.map(item => {
      const track = object(item, 'pista');

      if (typeof track.explicit !== 'boolean') {
        throw new Error('Indicador explicit inválido');
      }

      return {
        spotifyId: spotifyId(track.id),
        name: text(track.name, 'nombre de la pista'),
        durationMs: positiveInteger(track.duration_ms, 'duración'),
        discNumber: positiveInteger(track.disc_number, 'disco'),
        trackNumber: positiveInteger(track.track_number, 'posición'),
        explicit: track.explicit,
        artists: parseArtists(track.artists),
      };
    });

    if (
      new Set(tracksData.map(track => track.spotifyId)).size !==
      tracksData.length
    ) {
      throw new Error('El álbum contiene IDs de pistas repetidos');
    }

    return this.em.transactional(async tx => {
      // Serializa las importaciones que pasan por este importador.
      // El bloqueo se libera al terminar la transacción.
      await tx.execute('select pg_advisory_xact_lock(20260914)');

      const artistsBySpotifyId = new Map<string, Artist>();
      let createdArtists = 0;
      let createdTracks = 0;
      let updatedTracks = 0;

      const allArtists = new Map(
        [
          ...releaseData.artists,
          ...tracksData.flatMap(track => track.artists),
        ].map(artist => [artist.spotifyId, artist]),
      );

      for (const data of allArtists.values()) {
        let artist = await tx.findOne(Artist, {
          spotifyId: data.spotifyId,
        });

        if (!artist) {
          artist = new Artist();
          artist.spotifyId = data.spotifyId;
          tx.persist(artist);
          createdArtists++;
        }

        artist.name = data.name;
        artistsBySpotifyId.set(data.spotifyId, artist);
      }

      const resolveArtists = (
        values: Array<{ spotifyId: string; name: string }>,
      ): Artist[] => values.map(value => {
        const artist = artistsBySpotifyId.get(value.spotifyId);

        if (!artist) {
          throw new Error('No se pudo resolver un artista importado');
        }

        return artist;
      });

      let release: Release | null = await tx.findOne(Release, {
        spotifyId: releaseData.spotifyId,
      }, {
        populate: ['artists'],
      });

      const createdRelease = release === null;

      if (!release) {
        release = new Release();
        release.spotifyId = releaseData.spotifyId;
        release.type = releaseData.type;
        tx.persist(release);
      }

      // Conserva clasificaciones EP/MIXTAPE asignadas manualmente.
      if (
        release.type !== ReleaseType.EP &&
        release.type !== ReleaseType.MIXTAPE
      ) {
        release.type = releaseData.type;
      }

      release.name = releaseData.name;
      release.releaseDate = releaseData.date;
      release.releaseDatePrecision = releaseData.precision;

      if (releaseData.imageUrl !== null) {
        release.imageUrl = releaseData.imageUrl;
      }

      release.artists.set(resolveArtists(releaseData.artists));

      for (const data of tracksData) {
      let track: Track | null = await tx.findOne(Track, {
          spotifyId: data.spotifyId,
        }, {
          populate: ['release', 'artists'],
        });

        if (track) {
          if (track.release.spotifyId !== releaseData.spotifyId) {
            throw new Error(
              `La pista ${data.spotifyId} ya pertenece a otro lanzamiento`,
            );
          }

          updatedTracks++;
        } else {
          track = new Track();
          track.spotifyId = data.spotifyId;
          tx.persist(track);
          createdTracks++;
        }

        track.name = data.name;
        track.durationMs = data.durationMs;
        track.discNumber = data.discNumber;
        track.trackNumber = data.trackNumber;
        track.explicit = data.explicit;
        track.release = release;
        track.artists.set(resolveArtists(data.artists));
      }

      await tx.flush();

      return {
        releaseId: release.id,
        name: release.name,
        createdRelease,
        createdArtists,
        createdTracks,
        updatedTracks,
        receivedTracks: tracksData.length,
      };
    });
  }
}