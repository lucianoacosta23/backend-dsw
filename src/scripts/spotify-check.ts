import 'dotenv/config';

import { SpotifyClient } from '../modules/spotify/spotify.client.js';

async function checkSpotify(): Promise<void> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Faltan SPOTIFY_CLIENT_ID o SPOTIFY_CLIENT_SECRET en el .env',
    );
  }

  const albumId =
    process.argv[2] ?? '2xkZV2Hl1Omi8rk2D7t5lN';

  const client = new SpotifyClient(clientId, clientSecret);

  const { album, tracks } =
    await client.getAlbumWithTracks(albumId);

  console.log(JSON.stringify({
    spotifyId: album.id,
    name: album.name,
    type: album.album_type,
    releaseDate: album.release_date,
    precision: album.release_date_precision,
    totalTracks: album.total_tracks,
    receivedTracks: tracks.length,
    artists: album.artists,
  }, null, 2));
}

checkSpotify().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Error inesperado',
  );
  process.exitCode = 1;
});