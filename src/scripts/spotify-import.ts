import 'dotenv/config';
import { MikroORM } from '@mikro-orm/postgresql';

import config from '../config/mikro-orm.config.js';
import { SpotifyClient } from '../modules/spotify/spotify.client.js';
import { SpotifyImporter } from '../modules/spotify/spotify.importer.js';

async function main(): Promise<void> {
  const albumId = process.argv[2];
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!albumId) {
    throw new Error(
      'Uso: npx tsx src/scripts/spotify-import.ts ID_DEL_ALBUM',
    );
  }

  if (!clientId || !clientSecret) {
    throw new Error('Faltan las credenciales de Spotify en el .env');
  }

  const orm = await MikroORM.init(config);

  try {
    const client = new SpotifyClient(clientId, clientSecret);
    const importer = new SpotifyImporter(client, orm.em.fork());

    const result = await importer.importAlbum(albumId);

    console.log('Importación completada:');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await orm.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Error inesperado',
  );
  process.exitCode = 1;
});