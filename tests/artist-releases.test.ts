import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SpotifyClient } from '../src/modules/spotify/spotify.client.js';
import { SpotifyApiError } from '../src/modules/spotify/spotify-api.error.js';

const artistId = 'A'.repeat(22);
const albumId = 'B'.repeat(22);
const endpoint = `https://api.spotify.com/v1/artists/${artistId}/albums`;
const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
const item = (type: string) => ({
  id: albumId, name: 'Release de prueba', album_type: type,
  release_date: '2025-03', images: [{ url: 'https://i.scdn.co/image/prueba' }],
});

test('consulta páginas de a diez, conserva tipos y reutiliza el token', async t => {
  let tokenRequests = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://accounts.spotify.com/api/token') {
      tokenRequests++;
      return json({ access_token: 'token-falso', expires_in: 3600 });
    }
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, endpoint);
    assert.equal(parsed.searchParams.get('limit'), '10');
    assert.equal(parsed.searchParams.get('market'), 'AR');
    assert.equal(parsed.searchParams.get('include_groups'), 'album,single,compilation');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token-falso');
    const offset = Number(parsed.searchParams.get('offset'));
    return json({ offset, total: 11,
      items: offset === 0 ? [item('album'), item('single'), null] : [item('compilation')],
      next: offset === 0 ? `${endpoint}?offset=10&limit=10` : null,
    });
  });
  const client = new SpotifyClient('id-falso', 'secreto-falso');
  const first = await client.getArtistReleases(artistId);
  assert.equal(first.nextOffset, 10);
  assert.deepEqual(first.items.map(value => value.type), ['ALBUM', 'SINGLE']);
  assert.equal(first.items[0]?.spotifyId, albumId);
  const last = await client.getArtistReleases(artistId, 10);
  assert.equal(last.nextOffset, null);
  assert.equal(last.items[0]?.type, 'COMPILATION');
  assert.equal(tokenRequests, 1);
});

test('rechaza una URL siguiente de otro dominio', async t => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input).includes('/api/token')) return json({ access_token: 'falso', expires_in: 3600 });
    return json({ offset: 0, total: 20, items: [item('album')], next: 'https://otro.example/releases?offset=10' });
  });
  await assert.rejects(new SpotifyClient('falso', 'falso').getArtistReleases(artistId), /página siguiente inválida/);
});

test('propaga el límite de consultas de Spotify con Retry-After', async t => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input).includes('/api/token')) return json({ access_token: 'falso', expires_in: 3600 });
    return new Response('', { status: 429, headers: { 'Retry-After': '30' } });
  });
  await assert.rejects(new SpotifyClient('falso', 'falso').getArtistReleases(artistId), error => {
    assert.ok(error instanceof SpotifyApiError);
    assert.equal(error.statusCode, 429);
    assert.equal(error.retryAfter, '30');
    return true;
  });
});

test('no consulta Spotify con un ID u offset inválido', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('No debería consultar'); });
  const client = new SpotifyClient('falso', 'falso');
  await assert.rejects(client.getArtistReleases('incorrecto'), /ID de artista/);
  await assert.rejects(client.getArtistReleases(artistId, -1), /desplazamiento/);
  assert.equal(mock.mock.callCount(), 0);
});
