import { RequestContext } from '@mikro-orm/core';
import type { Playlist } from './playlist.entity.js';

// Lista explícita: nunca serializar entidades User ni sus relaciones de perfil.
export async function publicPlaylist(playlist: Playlist) {
  const em = RequestContext.getEntityManager()!;
  await em.populate(playlist, ['user', 'tracks.release', 'tracks.artists']);
  return {
    id: playlist.id, name: playlist.name,
    user: { id: playlist.user.id, username: playlist.user.username, fullName: playlist.user.fullName },
    tracks: playlist.tracks.getItems().map(track => ({
      id: track.id, spotifyId: track.spotifyId, name: track.name, durationMs: track.durationMs,
      discNumber: track.discNumber, trackNumber: track.trackNumber, explicit: track.explicit,
      release: { id: track.release.id, name: track.release.name, imageUrl: track.release.imageUrl },
      artists: track.artists.getItems().map(({ id, name }) => ({ id, name })),
    })),
  };
}
