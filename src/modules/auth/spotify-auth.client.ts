interface SpotifyProfile {
  accountId: string;
  displayName: string | null;
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
      `Spotify devolvió una respuesta inválida: ${description}`,
    );
  }

  return value as Record<string, unknown>;
}

export class SpotifyAuthClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Faltan las variables de autenticación de Spotify',
      );
    }
  }

  authorizationUrl(state: string): string {
    const url = new URL('https://accounts.spotify.com/authorize');

    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'user-read-private',
    }).toString();

    return url.toString();
  }

  async exchangeCode(code: string): Promise<string> {
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
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Spotify rechazó el código de autorización. HTTP ${response.status}`,
      );
    }

    const body: unknown = await response.json();
    const data = asObject(body, 'token');

    if (
      typeof data.access_token !== 'string' ||
      data.access_token.length === 0
    ) {
      throw new Error('Spotify no devolvió un token válido');
    }

    return data.access_token;
  }

  async getCurrentProfile(
    accessToken: string,
  ): Promise<SpotifyProfile> {
    const response = await fetch(
      'https://api.spotify.com/v1/me',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      throw new Error(
        `No se pudo consultar el perfil de Spotify. HTTP ${response.status}`,
      );
    }

    const body: unknown = await response.json();
    const data = asObject(body, 'perfil');

    if (
      typeof data.account_id !== 'string' ||
      data.account_id.length === 0 ||
      data.account_id.length > 255
    ) {
      throw new Error(
        'Spotify no devolvió un identificador de cuenta válido',
      );
    }

    let displayName: string | null = null;

    if (typeof data.display_name === 'string') {
      const normalizedName = data.display_name.trim();

      if (normalizedName.length > 0) {
        displayName = normalizedName.slice(0, 255);
      }
    }

    return {
      accountId: data.account_id,
      displayName,
    };
  }
}