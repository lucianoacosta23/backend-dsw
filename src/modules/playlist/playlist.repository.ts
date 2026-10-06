import { LockMode, RequestContext } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { Track } from '../tracks/track.entity.js';
import { User } from '../users/user.entity.js';
import { Playlist } from './playlist.entity.js';

export interface CreatePlaylistInput {
  name: string;
  userId: number;
  trackIds?: number[];
}

export class PlaylistRepository {
  private getEntityManager() {
    const em = RequestContext.getEntityManager();
    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }
    return em;
  }


  async findAll(): Promise<Playlist[]> {
    const em = this.getEntityManager();

    return em.find(Playlist, {}, {
      populate: ['user', 'tracks'],
    });
  }

  async create(input: CreatePlaylistInput): Promise<Playlist> {
    const em = this.getEntityManager();

    // 1. Verificamos que el usuario exista
    const user = await em.findOne(User, { id: input.userId });
    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

  


    // 2. Creamos la instancia de la playlist 
    const playlist = em.create(Playlist, {
      name: input.name,
      user: user,
    });

    // 3. Guardamos en la base de datos
    await em.persistAndFlush(playlist);

    return playlist;
  }


    async addTrack(
    playlistId: number,
    trackId: number,
    ownerId: number,
  ): Promise<Playlist> {
    return this.getEntityManager().transactional(async tx => {
      // Coordina las solicitudes que agregan canciones a esta playlist.
      const playlist = await tx.findOne(
        Playlist,
        { id: playlistId },
        {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        },
      );

      if (!playlist) {
        throw new AppError('Playlist no encontrada', 404);
      }

      // El dueño debe coincidir con el usuario de la sesión.
      if (playlist.user.id !== ownerId) {
        throw new AppError(
          'Solo podés agregar canciones a tus propias playlists',
          403,
        );
      }

      await tx.populate(playlist, ['tracks']);

      const track = await tx.findOne(Track, { id: trackId });

      if (!track) {
        throw new AppError('Canción no encontrada', 404);
      }

      // Repetir la solicitud no agrega otra copia de la canción.
      if (!playlist.tracks.contains(track)) {
        playlist.tracks.add(track);
        await tx.flush();
      }

      // Prepara los datos que necesita la lista del frontend.
      await tx.populate(playlist, [
        'tracks.release',
        'tracks.artists',
      ]);

      return playlist;
    });
  }


  async removeTrack(
    playlistId: number,
    trackId: number,
    ownerId: number,
  ): Promise<Playlist> {
    return this.getEntityManager().transactional(async tx => {
      const playlist = await tx.findOne(
        Playlist,
        { id: playlistId },
        {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        },
      );

      if (!playlist) {
        throw new AppError('Playlist no encontrada', 404);
      }

      // Comprueba el dueño antes de modificar la colección.
      if (playlist.user.id !== ownerId) {
        throw new AppError(
          'Solo podés quitar canciones de tus propias playlists',
          403,
        );
      }

      await tx.populate(playlist, ['tracks']);

      const track = playlist.tracks
        .getItems()
        .find(item => item.id === trackId);

      if (!track) {
        throw new AppError(
          'La canción no se encuentra en esta playlist',
          404,
        );
      }

      // Quita la relación; la canción permanece en el catálogo.
      playlist.tracks.remove(track);
      await tx.flush();

      await tx.populate(playlist, [
        'tracks.release',
        'tracks.artists',
      ]);

      return playlist;
    });
  }

  async updatePlaylist(
    id: number,
    newName: string,
    ownerId: number,
  ): Promise<Playlist> {
    return this.getEntityManager().transactional(async tx => {
      const playlist = await tx.findOne(
        Playlist,
        { id },
        {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        },
      );

      if (!playlist) {
        throw new AppError('Playlist no encontrada', 404);
      }

      if (playlist.user.id !== ownerId) {
        throw new AppError(
          'Solo podés renombrar tus propias playlists',
          403,
        );
      }

      playlist.name = newName;
      await tx.flush();

      return playlist;
    });
  }

  async deletePlaylist(
    id: number,
    ownerId: number,
  ): Promise<void> {
    await this.getEntityManager().transactional(async tx => {
      const playlist = await tx.findOne(
        Playlist,
        { id },
        {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        },
      );

      if (!playlist) {
        throw new AppError('Playlist no encontrada', 404);
      }

      if (playlist.user.id !== ownerId) {
        throw new AppError(
          'Solo podés eliminar tus propias playlists',
          403,
        );
      }

      await tx.removeAndFlush(playlist);
    });
  }


  //funcion para buscar una play list por nombre, esta la usa el buscador
  async searchByName(name: string): Promise<Playlist[]> {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No se pudo obtener el EntityManager');

    return await em.find(Playlist, {
      name: { $ilike: `%${name}%` }
    });
  }
}