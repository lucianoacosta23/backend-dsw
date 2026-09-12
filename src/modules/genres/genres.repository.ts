import { RequestContext } from '@mikro-orm/core';
import { Genre } from './genres.entity.js';

export interface GenreInput {
  name: string;
}

export class GenreRepository {
  private getEntityManager() {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em;
  }

  async findAll(): Promise<Genre[]> {
    const em = this.getEntityManager();

    return em.find(Genre, {}, {
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number): Promise<Genre | null> {
    const em = this.getEntityManager();

    return em.findOne(Genre, { id });
  }

  async create(data: GenreInput): Promise<Genre> {
    const em = this.getEntityManager();

    const genre = new Genre();
    genre.name = data.name;

    await em.persistAndFlush(genre);

    return genre;
  }

  async update(
    id: number,
    data: GenreInput,
  ): Promise<Genre | null> {
    const em = this.getEntityManager();

    const genre = await em.findOne(Genre, { id });

    if (!genre) {
      return null;
    }

    genre.name = data.name;

    await em.flush();

    return genre;
  }

  async delete(id: number): Promise<boolean> {
    const em = this.getEntityManager();

    const genre = await em.findOne(Genre, { id });

    if (!genre) {
      return false;
    }

    await em.removeAndFlush(genre);

    return true;
  }
}