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

  // Busca en Spotify sin guardar todavía los resultados en nuestra base.
  async searchCatalog(
    query: string,
    types: Array<'album' | 'track' | 'artist'>,
  ): Promise<{
    albums: unknown[];
    tracks: unknown[];
    artists: unknown[];
  }> {
    if (types.length === 0) {
      return { albums: [], tracks: [], artists: [] };
    }

    const searchTerm = query.trim();

    if (!searchTerm || searchTerm.length > 255) {
      throw new Error('El término de búsqueda de Spotify no es válido');
    }

    const params = new URLSearchParams({
      q: searchTerm,
      type: [...new Set(types)].join(','),
      market: 'AR',
      limit: '10',
    });

    // Reutiliza el token, los tiempos de espera y el manejo de errores.
    const response = asObject(
      await this.getJson(
        `https://api.spotify.com/v1/search?${params.toString()}`,
      ),
      'resultados de búsqueda',
    );

    const readItems = (
      key: 'albums' | 'tracks' | 'artists',
      requested: boolean,
    ): unknown[] => {
      if (!requested) return [];

      const page = asObject(response[key], `resultados de ${key}`);

      if (!Array.isArray(page.items)) {
        throw new Error(
          `Spotify devolvió una lista inválida de ${key}`,
        );
      }

      // Algunos resultados pueden venir como null.
      return page.items.filter(item => item !== null);
    };

    return {
      albums: readItems('albums', types.includes('album')),
      tracks: readItems('tracks', types.includes('track')),
      artists: readItems('artists', types.includes('artist')),
    };
  }

  // Consulta una canción. Todavía no guarda nada en nuestra base.
  async getTrack(
    trackId: string,
  ): Promise<Record<string, unknown>> {
    if (!/^[a-zA-Z0-9]{22}$/.test(trackId)) {
      throw new Error('El ID de canción de Spotify no es válido');
    }

    const track = asObject(
      await this.getJson(
        `https://api.spotify.com/v1/tracks/${trackId}`,
      ),
      'canción',
    );

    if (track.id !== trackId) {
      throw new Error(
        'Spotify devolvió una canción diferente a la solicitada',
      );
    }

    return track;
  }

  // Consulta un artista, incluyendo sus imágenes.
  async getArtist(
    artistId: string,
  ): Promise<Record<string, unknown>> {
    if (!/^[a-zA-Z0-9]{22}$/.test(artistId)) {
      throw new Error('El ID de artista de Spotify no es válido');
    }

    const artist = asObject(
      await this.getJson(
        `https://api.spotify.com/v1/artists/${artistId}`,
      ),
      'artista',
    );

    if (artist.id !== artistId) {
      throw new Error(
        'Spotify devolvió un artista diferente al solicitado',
      );
    }

    return artist;
  }

  // Consulta una página de la discografía sin importar los releases.
  async getArtistReleases(artistId: string, offset = 0): Promise<{
    items: Array<{
      spotifyId: string;
      name: string;
      type: 'ALBUM' | 'SINGLE' | 'COMPILATION';
      imageUrl: string | null;
      releaseDate: string;
    }>;
    total: number;
    nextOffset: number | null;
  }> {
    if (!/^[a-zA-Z0-9]{22}$/.test(artistId)) {
      throw new Error('El ID de artista de Spotify no es válido');
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
      throw new Error('El desplazamiento de Spotify no es válido');
    }
    const params = new URLSearchParams({
      include_groups: 'album,single,compilation',
      market: 'AR', limit: '10', offset: String(offset),
    });
    const page = asObject(await this.getJson(
      `https://api.spotify.com/v1/artists/${artistId}/albums?${params}`,
    ), 'discografía');
    if (!Array.isArray(page.items) || typeof page.total !== 'number'
      || !Number.isSafeInteger(page.total) || page.total < 0
      || page.offset !== offset || (page.next !== null && typeof page.next !== 'string')) {
      throw new Error('Spotify devolvió una paginación de releases inválida');
    }
    const items = page.items.filter(item => item !== null).map(value => {
      const album = asObject(value, 'release del artista');
      if (typeof album.id !== 'string' || !/^[a-zA-Z0-9]{22}$/.test(album.id)
        || typeof album.name !== 'string' || typeof album.release_date !== 'string'
        || !/^[0-9]{4}(-[0-9]{2}){0,2}$/.test(album.release_date)
        || !Array.isArray(album.images)) {
        throw new Error('Spotify devolvió un release inválido');
      }
      let type: 'ALBUM' | 'SINGLE' | 'COMPILATION';
      switch (album.album_type) {
        case 'album': type = 'ALBUM'; break;
        case 'single': type = 'SINGLE'; break;
        case 'compilation': type = 'COMPILATION'; break;
        default: throw new Error('Spotify devolvió un tipo de release inválido');
      }
      const image = album.images.length ? asObject(album.images[0], 'portada') : null;
      return {
        spotifyId: album.id, name: album.name, type,
        imageUrl: image && typeof image.url === 'string' ? image.url : null,
        releaseDate: album.release_date,
      };
    });
    // No aceptamos una URL de paginación del navegador ni seguimos URLs arbitrarias.
    let nextOffset: number | null = null;
    if (page.next !== null) {
      const next = new URL(page.next as string);
      const rawOffset = next.searchParams.get('offset');
      if (next.origin !== 'https://api.spotify.com'
        || next.pathname !== `/v1/artists/${artistId}/albums`
        || !rawOffset || !/^[0-9]+$/.test(rawOffset)) {
        throw new Error('Spotify devolvió una página siguiente inválida');
      }
      nextOffset = Number(rawOffset);
      if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > 100000) {
        throw new Error('Spotify devolvió un desplazamiento inválido');
      }
    }
    return { items, total: page.total, nextOffset };
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