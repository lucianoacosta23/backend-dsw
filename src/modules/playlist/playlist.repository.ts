import { RequestContext } from '@mikro-orm/core';

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

    //verificamos que el nombre de la playlist no este en uso 

    const existing = await em.findOne(Playlist, { name: input.name });
    if (existing) {
      throw new Error('Ya existe una playlist con este nombre');
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


  //esta funcion es para agregar track a una playlist de un usuario, agrega la track solo por id
  async addTrack(playlistId: number, trackId: number): Promise<Playlist> {
    const em = this.getEntityManager();

    // 1. Buscamos la playlist y popularmos sus tracks actuales
    const playlist = await em.findOne(Playlist, { id: playlistId }, { populate: ['tracks'] });
    if (!playlist) {
      throw new AppError('Playlist no encontrada', 404);
    }

    // 2. Buscamos el track que el usuario quiere agregar
    const track = await em.findOne(Track, { id: trackId });
    if (!track) {
      throw new AppError('Track no encontrado', 404);
    }

    // 3. Añadimos el track a la colección de la playlist
    playlist.tracks.add(track);

    // 4. Guardamos los cambios
    await em.flush();
    // 5. Nos aseguramos de popular los track para que viajen en la respuesta
    await em.populate(playlist, ['tracks']);

    return playlist;
  }


  //funcion para eliminar una track
  async removeTrack(playlistId: number, trackId: number) {
  // 1. Obtenemos el Entity Manager del contexto actual de la petición
  const em = RequestContext.getEntityManager();
  if (!em) {
    throw new Error('No se pudo obtener el EntityManager del contexto');
  }

  // 2. Buscamos la playlist populando sus tracks
  const playlist = await em.findOneOrFail(
    Playlist,
    { id: playlistId },
    { populate: ['tracks'] },
  );

  // 3. Buscamos el track
  const track = await em.findOneOrFail(Track, { id: trackId });

  // 4. Validamos si la playlist realmente contiene esa canción
  if (!playlist.tracks.contains(track)) {
    throw new Error('La canción no se encuentra en esta playlist');
  }

  // 5. Removemos la relación y guardamos los cambios
  playlist.tracks.remove(track);
  await em.flush();

  return playlist;
  }

  //funcion para actualizar la play list, como tal solo se puede modificar el nombre de la misma

  async updatePlaylist(id: number, newName: string) {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No se pudo obtener el EntityManager');

    // 1. Verificar si ya existe OTRA playlist con ese mismo nombre (excluyendo la actual)
    const existingWithName = await em.findOne(Playlist, { name: newName });
    if (existingWithName && existingWithName.id !== id) {
      throw new Error('Ya existe otra playlist con este nombre');
    }

    // 2. Buscar la playlist a actualizar
    const playlist = await em.findOneOrFail(Playlist, { id });

    // 3. Actualizar el nombre
    playlist.name = newName;

    // 4. Guardar cambios en la base de datos
    await em.flush();

    return playlist;
  }


  // funcion de eliminar la play list, esto hace una eliminacion total
  async deletePlaylist(id: number) {
  const em = RequestContext.getEntityManager();
  if (!em) throw new Error('No se pudo obtener el EntityManager');

  // 1. Buscamos la playlist (lanza error automático si no existe)
  const playlist = await em.findOneOrFail(Playlist, { id });

  // 2. La eliminamos de la base de datos
  await em.removeAndFlush(playlist);

  return playlist;
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