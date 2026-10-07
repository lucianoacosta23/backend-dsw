import { LockMode, RequestContext } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { Playlist } from './playlist.entity.js';
import { PlaylistSave } from './playlist-save.entity.js';

export type PlaylistListMode = 'mine' | 'saved' | 'popular';

export interface PlaylistListInput {
  page: number;
  pageSize: number;
}

interface PlaylistListRow {
  id: number;
  name: string;
  author_id: number;
  username: string;
  full_name: string;
  track_count: number;
  save_count: number;
  saved_by_me: boolean;
}

export class PlaylistLibraryRepository {
  private getEntityManager() {
    const em = RequestContext.getEntityManager();

    if (!em) {
      throw new Error('No hay un contexto de base de datos activo');
    }

    return em;
  }

  async save(playlistId: number, userId: number) {
    return this.getEntityManager().transactional(async tx => {
      // Coordina guardados, bajas y modificaciones de esta playlist.
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

      if (playlist.user.id === userId) {
        throw new AppError(
          'Esta playlist ya aparece entre las que creaste',
          403,
        );
      }

      const existing = await tx.findOne(PlaylistSave, {
        playlist: playlistId,
        user: userId,
      });

      // Guardar dos veces mantiene un único registro.
      if (!existing) {
        const saved = new PlaylistSave();
        saved.playlist = playlist;
        saved.user = tx.getReference(User, userId);

        await tx.persistAndFlush(saved);
      }

      return {
        playlistId,
        savedByMe: true,
        saveCount: await tx.count(PlaylistSave, {
          playlist: playlistId,
        }),
      };
    });
  }

  async unsave(playlistId: number, userId: number) {
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

      const saved = await tx.findOne(PlaylistSave, {
        playlist: playlistId,
        user: userId,
      });

      // Solo elimina el guardado del usuario conectado.
      if (saved) {
        await tx.removeAndFlush(saved);
      }

      return {
        playlistId,
        savedByMe: false,
        saveCount: await tx.count(PlaylistSave, {
          playlist: playlistId,
        }),
      };
    });
  }

  // Devuelve una playlist con sus canciones para la vista de detalle.
  async findDetail(playlistId: number, viewerId: number) {
    const em = this.getEntityManager();

    const playlist = await em.findOne(
      Playlist,
      { id: playlistId },
      { populate: ['user', 'tracks.release', 'tracks.artists'] },
    );

    if (!playlist) {
      throw new AppError('Playlist no encontrada', 404);
    }

    const [saveCount, savedByViewer] = await Promise.all([
      em.count(PlaylistSave, { playlist: playlistId }),
      em.count(PlaylistSave, {
        playlist: playlistId,
        user: viewerId,
      }),
    ]);

    // La tabla playlist_tracks no guarda posición: se ordena por ID
    // para que la lista siempre se vea igual.
    const tracks = [...playlist.tracks.getItems()].sort(
      (a, b) => (a.id ?? 0) - (b.id ?? 0),
    );

    return {
      id: playlist.id,
      name: playlist.name,
      author: {
        id: playlist.user.id,
        username: playlist.user.username,
        fullName: playlist.user.fullName,
      },
      saveCount,
      savedByMe: savedByViewer > 0,
      isOwnPlaylist: playlist.user.id === viewerId,
      tracks: tracks.map(track => ({
        id: track.id,
        spotifyId: track.spotifyId,
        name: track.name,
        durationMs: track.durationMs,
        release: {
          id: track.release.id,
          name: track.release.name,
          imageUrl: track.release.imageUrl,
        },
        artists: track.artists.getItems().map(artist => ({
          id: artist.id,
          name: artist.name,
        })),
      })),
    };
  }

  async list(
    mode: PlaylistListMode,
    viewerId: number,
    input: PlaylistListInput,
  ) {
    const em = this.getEntityManager();

    // Estos fragmentos son internos: no contienen texto del usuario.
    let condition = 'TRUE';
    let order = 'p.id DESC';
    const filterParams: number[] = [];

    if (mode === 'mine') {
      condition = 'p.user_id = ?';
      filterParams.push(viewerId);
    } else if (mode === 'saved') {
      condition = `
        EXISTS (
          SELECT 1
          FROM playlist_save AS mine
          WHERE mine.playlist_id = p.id
            AND mine.user_id = ?
        )
      `;
      filterParams.push(viewerId);

      order = `
        (
          SELECT mine.created_at
          FROM playlist_save AS mine
          WHERE mine.playlist_id = p.id
            AND mine.user_id = ?
        ) DESC,
        p.id DESC
      `;
    } else if (mode === 'popular') {
      order = 'save_count DESC, p.id DESC';
    } else {
      throw new Error('Listado de playlists no válido');
    }

    const totals = (await em.getConnection().execute(
      `
        SELECT COUNT(*)::int AS total
        FROM playlist AS p
        WHERE ${condition}
      `,
      filterParams,
    )) as Array<{ total: number }>;

    const offset = (input.page - 1) * input.pageSize;

    const rows = (await em.getConnection().execute(
      `
        SELECT
          p.id,
          p.name,
          u.id AS author_id,
          u.username,
          u.full_name,
          (
            SELECT COUNT(*)::int
            FROM playlist_tracks AS pt
            WHERE pt.playlist_id = p.id
          ) AS track_count,
          (
            SELECT COUNT(*)::int
            FROM playlist_save AS s
            WHERE s.playlist_id = p.id
          ) AS save_count,
          EXISTS (
            SELECT 1
            FROM playlist_save AS mine
            WHERE mine.playlist_id = p.id
              AND mine.user_id = ?
          ) AS saved_by_me
        FROM playlist AS p
        JOIN "user" AS u ON u.id = p.user_id
        WHERE ${condition}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `,
      [
        viewerId,
        ...filterParams,
        ...(mode === 'saved' ? [viewerId] : []),
        input.pageSize,
        offset,
      ],
    )) as PlaylistListRow[];

    return {
      total: Number(totals[0]?.total ?? 0),
      items: rows.map(row => ({
        id: row.id,
        name: row.name,
        author: {
          id: row.author_id,
          username: row.username,
          fullName: row.full_name,
        },
        trackCount: Number(row.track_count),
        saveCount: Number(row.save_count),
        savedByMe: row.saved_by_me,
        isOwnPlaylist: row.author_id === viewerId,
      })),
    };
  }
}