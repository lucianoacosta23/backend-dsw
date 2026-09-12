import 'dotenv/config';

async function checkSpotify(): Promise<void> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Faltan SPOTIFY_CLIENT_ID o SPOTIFY_CLIENT_SECRET en el .env',
    );
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`,
  ).toString('base64');

  const response = await fetch(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Spotify rechazó la solicitud de token. HTTP ${response.status}`,
    );
  }

  const data: unknown = await response.json();

  if (
    typeof data !== 'object' ||
    data === null ||
    !('access_token' in data) ||
    typeof data.access_token !== 'string' ||
    data.access_token.length === 0
  ) {
    throw new Error('Spotify no devolvió un token válido');
  }

  console.log('Spotify aceptó las credenciales de Jukeboxd.');
  console.log('Token de aplicación obtenido correctamente.');

    const albumId = '2xkZV2Hl1Omi8rk2D7t5lN';

  const albumResponse = await fetch(
    `https://api.spotify.com/v1/albums/${albumId}?market=AR`,
    {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
      },
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!albumResponse.ok) {
    const errorBody = await albumResponse.text();

    console.error('Respuesta de Spotify:', errorBody);

    throw new Error(
      `No se pudo consultar el álbum. HTTP ${albumResponse.status}`,
    );
  }

  const album: unknown = await albumResponse.json();

  console.log('Álbum obtenido correctamente:');
  console.log(JSON.stringify(album, null, 2));
}

checkSpotify().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Error inesperado',
  );
  process.exitCode = 1;
});