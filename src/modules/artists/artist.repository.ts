import { RequestContext } from '@mikro-orm/core';
import { Artist } from './artist.entity.js';

export interface CreateArtistInput {
  name: string;
  biography?: string | null;
  imageUrl?: string | null;
}

export interface UpdateArtistInput {
  name?: string;
  biography?: string | null;
  imageUrl?: string | null;
}

export class ArtistRepository {
  private getEntityManager() {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em;
  }

  async findAll(): Promise<Artist[]> {
    const em = this.getEntityManager();

    return em.find(Artist, {});
  }

  async findById(id: number): Promise<Artist | null> {
    const em = this.getEntityManager();

    return em.findOne(Artist, { id });
  }

  async create(data: CreateArtistInput): Promise<Artist> {
    const em = this.getEntityManager();

    const artist = new Artist();

    artist.name = data.name;
    artist.biography = data.biography ?? null;
    artist.imageUrl = data.imageUrl ?? null;

    await em.persistAndFlush(artist);

    return artist;
  }

  async update(
    id: number,
    data: UpdateArtistInput,
  ): Promise<Artist | null> {
    const em = this.getEntityManager();

    const artist = await em.findOne(Artist, { id });

    if (!artist) {
      return null;
    }

    if (data.name !== undefined) {
      artist.name = data.name;
    }

    if (data.biography !== undefined) {
      artist.biography = data.biography;
    }

    if (data.imageUrl !== undefined) {
      artist.imageUrl = data.imageUrl;
    }

    await em.flush();

    return artist;
  }

  async delete(id: number): Promise<boolean> {
    const em = this.getEntityManager();

    const artist = await em.findOne(Artist, { id });

    if (!artist) {
      return false;
    }

    await em.removeAndFlush(artist);

    return true;
  }
}