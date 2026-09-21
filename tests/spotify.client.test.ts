import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { SpotifyClient } from '../src/modules/spotify/spotify.client.js';

const albumId = 'A'.repeat(22);

const albumUrl =
  `https://api.spotify.com/v1/albums/${albumId}?market=AR`;

const secondPageUrl =
  `https://api.spotify.com/v1/albums/${albumId}/tracks` +
  '?offset=2&limit=2&market=AR';

const tracks = [
  { id: 'B'.repeat(22), name: 'Pista uno' },
  { id: 'C'.repeat(22), name: 'Pista dos' },
  { id: 'D'.repeat(22), name: 'Pista tres' },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function simulateSpotify(
  t: TestContext,
  declaredTotal: number,
): string[] {
  const requestedUrls: string[] = [];

  t.mock.method(
    globalThis,
    'fetch',
    async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url =
        input instanceof Request
          ? input.url
          : String(input);

      requestedUrls.push(url);

      if (url === 'https://accounts.spotify.com/api/token') {
        assert.equal(init?.method, 'POST');

        return jsonResponse({
          access_token: 'token-ficticio-para-la-prueba',
          expires_in: 3600,
        });
      }

      const headers = new Headers(init?.headers);

      assert.equal(
        headers.get('Authorization'),
        'Bearer token-ficticio-para-la-prueba',
      );

      if (url === albumUrl) {
        return jsonResponse({
          id: albumId,
          name: 'Álbum de prueba',
          total_tracks: declaredTotal,
          tracks: {
            items: tracks.slice(0, 2),
            next: secondPageUrl,
          },
        });
      }

      if (url === secondPageUrl) {
        return jsonResponse({
          items: tracks.slice(2),
          next: null,
        });
      }

      throw new Error(`Consulta inesperada durante la prueba: ${url}`);
    },
  );

  return requestedUrls;
}

test('reúne todas las pistas siguiendo la paginación', async t => {
  const requestedUrls = simulateSpotify(t, 3);

  const client = new SpotifyClient(
    'client-id-ficticio',
    'client-secret-ficticio',
  );

  const result = await client.getAlbumWithTracks(albumId);

  assert.equal(result.album.id, albumId);

  // Comprueba cantidad, contenido y orden.
  assert.deepEqual(result.tracks, tracks);

  // Debe pedir ambas páginas y obtener el token una sola vez.
  assert.deepEqual(requestedUrls, [
    'https://accounts.spotify.com/api/token',
    albumUrl,
    secondPageUrl,
  ]);
});

test('rechaza una lista incompleta de pistas', async t => {
  // Spotify anuncia 4 pistas, pero las páginas solo contienen 3.
  const requestedUrls = simulateSpotify(t, 4);

  const client = new SpotifyClient(
    'client-id-ficticio',
    'client-secret-ficticio',
  );

  await assert.rejects(
    () => client.getAlbumWithTracks(albumId),
    /La cantidad de pistas recibidas no coincide con el álbum/,
  );

  assert.deepEqual(requestedUrls, [
    'https://accounts.spotify.com/api/token',
    albumUrl,
    secondPageUrl,
  ]);
});