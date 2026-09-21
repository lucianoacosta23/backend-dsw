import { SpotifyApiError } from './spotify-api.error.js';

function checkSpotifyResponse(
  response: Response,
  allowNotFound: boolean,
): void {
  if (response.ok) {
    return;
  }

  if (response.status === 429) {
    const rawRetryAfter = response.headers.get('retry-after');

    const retryAfter =
      rawRetryAfter !== null && /^\d+$/.test(rawRetryAfter)
        ? rawRetryAfter
        : null;

    throw new SpotifyApiError(
      'Spotify alcanzó su límite de solicitudes. Reintentá más tarde.',
      429,
      retryAfter,
    );
  }

  if (allowNotFound && response.status === 404) {
    throw new SpotifyApiError(
      'No se encontró el recurso solicitado en Spotify',
      404,
    );
  }

  throw new SpotifyApiError(
    'Spotify no pudo completar la solicitud',
    502,
  );
}

function asObject(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `Respuesta inválida de Spotify: ${description}`,
    );
  }

  return value as Record<string, unknown>;
}

export class SpotifyClient {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    if (!clientId || !clientSecret) {
      throw new Error('Faltan las credenciales de Spotify');
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
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
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );

    checkSpotifyResponse(response, false);

    const body: unknown = await response.json();
    const data = asObject(body, 'token');

    if (
      typeof data.access_token !== 'string' ||
      data.access_token.length === 0 ||
      typeof data.expires_in !== 'number' ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0
    ) {
      throw new Error('Spotify devolvió un token inválido');
    }

    this.accessToken = data.access_token;

    // Renovamos el token un poco antes de su vencimiento.
    this.expiresAt =
      Date.now() + Math.max(0, data.expires_in - 60) * 1000;

    return this.accessToken;
  }

  private async getJson(url: string): Promise<unknown> {
    const parsedUrl = new URL(url);

    // También verificamos las URLs recibidas en "next".
    if (
      parsedUrl.origin !== 'https://api.spotify.com' ||
      !parsedUrl.pathname.startsWith('/v1/') ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error('URL de consulta de Spotify no permitida');
    }

    // Un único reintento si Spotify rechaza el token.
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getAccessToken();

      const response = await fetch(parsedUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 401 && attempt === 0) {
        this.accessToken = null;
        this.expiresAt = 0;
        continue;
      }

      checkSpotifyResponse(response, true);

      const body: unknown = await response.json();
      return body;
    }

    throw new SpotifyApiError(
      'Spotify rechazó la autorización',
      502,
    );
  }

  async getAlbumWithTracks(albumId: string): Promise<{
    album: Record<string, unknown>;
    tracks: unknown[];
  }> {
    if (!/^[a-zA-Z0-9]{22}$/.test(albumId)) {
      throw new Error('El ID de álbum de Spotify no es válido');
    }

    const album = asObject(
      await this.getJson(
        `https://api.spotify.com/v1/albums/${albumId}?market=AR`,
      ),
      'álbum',
    );

    if (album.id !== albumId) {
      throw new Error(
        'Spotify devolvió un álbum diferente al solicitado',
      );
    }

    const tracks: unknown[] = [];
    const visitedPages = new Set<string>();

    let page = asObject(album.tracks, 'página de pistas');

    while (true) {
      if (!Array.isArray(page.items)) {
        throw new Error(
          'Spotify devolvió una lista de pistas inválida',
        );
      }

      tracks.push(...page.items);

      if (page.next === null) {
        break;
      }

      if (
        typeof page.next !== 'string' ||
        page.next.length === 0
      ) {
        throw new Error(
          'Spotify devolvió una paginación inválida',
        );
      }

      if (visitedPages.has(page.next)) {
        throw new Error('Spotify devolvió una página repetida');
      }

      visitedPages.add(page.next);

      page = asObject(
        await this.getJson(page.next),
        'página de pistas',
      );
    }

    if (
      typeof album.total_tracks !== 'number' ||
      !Number.isInteger(album.total_tracks) ||
      album.total_tracks < 0 ||
      tracks.length !== album.total_tracks
    ) {
      throw new Error(
        'La cantidad de pistas recibidas no coincide con el álbum',
      );
    }

    return { album, tracks };
  }
}