import {
  LockMode,
  RequestContext,
} from '@mikro-orm/core';

import { Artist } from '../artists/artist.entity.js';
import { Genre } from '../genres/genres.entity.js';
import { AppError } from '../../shared/errors/app-error.js';
import { Release, ReleaseType } from './release.entity.js';
import type {
  ReleaseDatePrecision,
} from './release.entity.js';

export interface CreateReleaseInput {
  name: string;
  type: ReleaseType;
  description?: string | null;
  imageUrl?: string | null;
  releaseDate: string;
  releaseDatePrecision: ReleaseDatePrecision;
  artistIds: number[];
  genreIds?: number[];
}

export type UpdateReleaseInput = Partial<CreateReleaseInput>;

export class ReleaseRepository {
  private getEntityManager() {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em;
  }

  async findAll(): Promise<Release[]> {
    const em = this.getEntityManager();

    return em.find(Release, {}, {
      populate: ['artists', 'genres'],
      orderBy: { name: 'asc', id: 'asc' },
    });
  }

  async findPopularAlbums(limit: number): Promise<Array<{ release: Release; reviewCount: number }>> {
    const em = this.getEntityManager();
    const rows: Array<{ id: number; reviewCount: number }> = await em.getConnection().execute(
      `select r."id" as "id", count(rv."id")::int as "reviewCount"
       from "release" r
       left join "review" rv
         on rv."release_id" = r."id" and rv."deleted_at" is null
       group by r."id"
       order by count(rv."id") desc, r."name" asc, r."id" asc
       limit ?`,
      [limit],
    );

    if (rows.length === 0) return [];

    const releases = await em.find(Release, {
      id: { $in: rows.map(row => Number(row.id)) },
    }, { populate: ['artists'] });
    const releasesById = new Map(
      releases.flatMap(release => release.id === undefined ? [] : [[release.id, release] as const]),
    );

    return rows.flatMap(row => {
      const release = releasesById.get(Number(row.id));
      return release
        ? [{ release, reviewCount: Number(row.reviewCount) }]
        : [];
    });
  }

  async findById(id: number): Promise<Release | null> {
    const em = this.getEntityManager();

    return em.findOne(Release, { id }, {
      populate: ['artists', 'genres', 'tracks.artists'],
    });
  }

  async create(data: CreateReleaseInput): Promise<Release> {
    const em = this.getEntityManager();

    const artists = await em.find(Artist, {
      id: { $in: data.artistIds },
    });

    if (artists.length !== data.artistIds.length) {
      throw new AppError('Uno o más artistas no existen', 400);
    }

    const genreIds = data.genreIds ?? [];

    const genres = await em.find(Genre, {
      id: { $in: genreIds },
    });

    if (genres.length !== genreIds.length) {
      throw new AppError('Uno o más géneros no existen', 400);
    }

    const release = new Release();

    release.name = data.name;
    release.type = data.type;
    release.description = data.description ?? null;
    release.imageUrl = data.imageUrl ?? null;
    release.releaseDate = data.releaseDate;
    release.releaseDatePrecision = data.releaseDatePrecision;

    release.artists.set(artists);
    release.genres.set(genres);

    await em.persistAndFlush(release);

    return release;
  }

  async update(
    id: number,
    data: UpdateReleaseInput,
  ): Promise<Release | null> {
    const em = this.getEntityManager();

    return em.transactional(async tx => {
      const release = await tx.findOne(Release, { id }, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });

      if (!release) {
        return null;
      }

      await tx.populate(release, ['artists', 'genres']);

      if (data.artistIds !== undefined) {
        const artists = await tx.find(Artist, {
          id: { $in: data.artistIds },
        });

        if (artists.length !== data.artistIds.length) {
          throw new AppError('Uno o más artistas no existen', 400);
        }

        release.artists.set(artists);
      }

      if (data.genreIds !== undefined) {
        const genres = await tx.find(Genre, {
          id: { $in: data.genreIds },
        });

        if (genres.length !== data.genreIds.length) {
          throw new AppError('Uno o más géneros no existen', 400);
        }

        release.genres.set(genres);
      }

      if (data.name !== undefined) {
        release.name = data.name;
      }

      if (data.type !== undefined) {
        release.type = data.type;
      }

      if (data.description !== undefined) {
        release.description = data.description;
      }

      if (data.imageUrl !== undefined) {
        release.imageUrl = data.imageUrl;
      }

      if (data.releaseDate !== undefined) {
        release.releaseDate = data.releaseDate;
      }

      if (data.releaseDatePrecision !== undefined) {
        release.releaseDatePrecision = data.releaseDatePrecision;
      }

      await tx.flush();

      return release;
    });
  }

  async delete(id: number): Promise<boolean> {
    const em = this.getEntityManager();

    const release = await em.findOne(Release, { id });

    if (!release) {
      return false;
    }

    await em.removeAndFlush(release);

    return true;
  }


  async searchByName(searchTerm: string): Promise<Release[]> {
    const em = this.getEntityManager();

    return em.find(Release, {
      
      name: { $ilike: `%${searchTerm}%` }, 
    }, {
      populate: ['artists', 'tracks'], // Trae las relaciones si las necesitas
      orderBy: {
        name: 'asc',
      },
    });
  }

}
