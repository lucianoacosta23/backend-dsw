import { RequestContext } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { Artist } from '../artists/artist.entity.js';
import { Release } from '../releases/release.entity.js';
import { Track } from './track.entity.js';

export interface CreateTrackInput {
  name: string;
  durationMs: number;
  discNumber: number;
  trackNumber: number;
  explicit?: boolean;
  releaseId: number;
  artistIds: number[];
}

export type UpdateTrackInput = Partial<CreateTrackInput>;

export class TrackRepository {
  private getEntityManager() {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em;
  }

  async findAll(): Promise<Track[]> {
    const em = this.getEntityManager();

    return em.find(Track, {}, {
      populate: ['release', 'artists'],
      orderBy: {
        release: { id: 'asc' },
        discNumber: 'asc',
        trackNumber: 'asc',
        id: 'asc',
      },
    });
  }

  async findById(id: number): Promise<Track | null> {
    const em = this.getEntityManager();

    return em.findOne(Track, { id }, {
      populate: ['release', 'artists'],
    });
  }

  async create(data: CreateTrackInput): Promise<Track> {
    const em = this.getEntityManager();

    const release = await em.findOne(Release, {
      id: data.releaseId,
    });

    if (!release) {
      throw new AppError('El lanzamiento indicado no existe', 400);
    }

    const artists = await em.find(Artist, {
      id: { $in: data.artistIds },
    });

    if (artists.length !== data.artistIds.length) {
      throw new AppError('Uno o más artistas no existen', 400);
    }

    const track = new Track();

    track.name = data.name;
    track.durationMs = data.durationMs;
    track.discNumber = data.discNumber;
    track.trackNumber = data.trackNumber;
    track.explicit = data.explicit ?? false;
    track.release = release;
    track.artists.set(artists);

    await em.persistAndFlush(track);

    return track;
  }

  async update(
    id: number,
    data: UpdateTrackInput,
  ): Promise<Track | null> {
    const em = this.getEntityManager();

    const track = await em.findOne(Track, { id }, {
      populate: ['release', 'artists'],
    });

    if (!track) {
      return null;
    }

    // Validamos las referencias antes de modificar la entidad.
    let release: Release | undefined;
    let artists: Artist[] | undefined;

    if (data.releaseId !== undefined) {
      const foundRelease = await em.findOne(Release, {
        id: data.releaseId,
      });

      if (!foundRelease) {
        throw new AppError('El lanzamiento indicado no existe', 400);
      }

      release = foundRelease;
    }

    if (data.artistIds !== undefined) {
      artists = await em.find(Artist, {
        id: { $in: data.artistIds },
      });

      if (artists.length !== data.artistIds.length) {
        throw new AppError('Uno o más artistas no existen', 400);
      }
    }

    if (data.name !== undefined) {
      track.name = data.name;
    }

    if (data.durationMs !== undefined) {
      track.durationMs = data.durationMs;
    }

    if (data.discNumber !== undefined) {
      track.discNumber = data.discNumber;
    }

    if (data.trackNumber !== undefined) {
      track.trackNumber = data.trackNumber;
    }

    if (data.explicit !== undefined) {
      track.explicit = data.explicit;
    }

    if (release !== undefined) {
      track.release = release;
    }

    if (artists !== undefined) {
      track.artists.set(artists);
    }

    await em.flush();

    return track;
  }

  async delete(id: number): Promise<boolean> {
    const em = this.getEntityManager();

    const track = await em.findOne(Track, { id });

    if (!track) {
      return false;
    }

    await em.removeAndFlush(track);

    return true;
  }
}