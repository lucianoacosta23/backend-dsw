import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { after, before, describe, test, type TestContext } from 'node:test';
import express from 'express';
import session from 'express-session';

import authRouter from '../src/modules/auth/auth.route.js';
import { authRepository } from '../src/modules/auth/auth.repository.js';
import { SpotifyAuthClient } from '../src/modules/auth/spotify-auth.client.js';
import { User } from '../src/modules/users/user.entity.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

let backend: Server;
let frontend: Server;
let backendUrl: string;
let frontendUrl: string;
const envKeys = ['FRONTEND_URL', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI'] as const;
const previousEnv = new Map(envKeys.map(key => [key, process.env[key]]));

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server | undefined) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function startAttempt(returnUrl = '/library?tab=saved', authenticated = false) {
  let cookie: string | undefined;
  if (authenticated) {
    const seed = await fetch(`${backendUrl}/test/session`, { method: 'POST' });
    cookie = seed.headers.get('set-cookie')!.split(';')[0]!;
  }
  const response = await fetch(`${backendUrl}/auth/spotify/login?${new URLSearchParams({ returnUrl })}`, {
    redirect: 'manual', headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal(response.status, 302);
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
  assert.ok(cookie);
  const state = new URL(response.headers.get('location')!).searchParams.get('state');
  assert.ok(state);
  return { cookie, state };
}

async function callback(cookie: string, query: Record<string, string>) {
  return fetch(`${backendUrl}/auth/spotify/callback?${new URLSearchParams(query)}`, {
    redirect: 'manual', headers: { Cookie: cookie },
  });
}

async function readSession(cookie: string) {
  return (await fetch(`${backendUrl}/test/session`, { headers: { Cookie: cookie } })).json();
}

function mockDependencies(t: TestContext, user: User | null = null) {
  const exchange = t.mock.method(SpotifyAuthClient.prototype, 'exchangeCode', async () => 'test-access-token');
  const profile = t.mock.method(SpotifyAuthClient.prototype, 'getCurrentProfile', async () => ({ accountId: 'spotify-test-account', displayName: 'Nombre Spotify' }));
  const find = t.mock.method(authRepository, 'findBySpotifyId', async () => user);
  const createSpotify = t.mock.method(authRepository, 'createSpotify', async () => { throw new Error('No debe crear usuarios en el callback'); });
  const createLocal = t.mock.method(authRepository, 'createLocal', async () => { throw new Error('No debe crear usuarios en el callback'); });
  return { exchange, profile, find, createSpotify, createLocal };
}

function assertNoExternalWork(mocks: ReturnType<typeof mockDependencies>) {
  for (const fn of Object.values(mocks)) assert.equal(fn.mock.callCount(), 0);
}

function assertAttemptCleared(value: Record<string, unknown>) {
  assert.equal(value.spotifyOauthState, undefined);
  assert.equal(value.spotifyReturnUrl, undefined);
}

describe('Spotify OAuth: cancelación y destinos del callback', { concurrency: false }, () => {
  before(async () => {
    const frontApp = express();
    frontApp.get('/', (_req, res) => res.send('Home público del frontend'));
    const front = await listen(frontApp);
    frontend = front.server;
    frontendUrl = front.url;
    process.env.FRONTEND_URL = `${frontendUrl}///`;
    process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';
    process.env.SPOTIFY_REDIRECT_URI = 'http://127.0.0.1/auth/spotify/callback';

    const app = express();
    app.use(session({ name: 'jukeboxd.sid', secret: 'spotify-callback-test-secret-32-characters', resave: false, saveUninitialized: false }));
    // Solo en esta aplicación de pruebas: permite observar la sesión real sin base de datos.
    app.post('/test/session', (req, res) => {
      req.session.userId = 42;
      req.session.userVersion = 9;
      res.json({ sessionId: req.sessionID });
    });
    app.get('/test/session', (req, res) => res.json({ sessionId: req.sessionID, ...req.session }));
    app.use('/auth', authRouter);
    app.use(errorMiddleware);
    const back = await listen(app);
    backend = back.server;
    backendUrl = back.url;
  });

  after(async () => {
    await Promise.all([close(backend), close(frontend)]);
    for (const key of envKeys) {
      const value = previousEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('cancelación válida devuelve 303 al home público y termina en el frontend', async t => {
    const mocks = mockDependencies(t);
    const attempt = await startAttempt('/dashboard/private');
    const response = await callback(attempt.cookie, {
      state: attempt.state, error: 'access_denied', code: 'must-not-exchange',
      returnUrl: 'https://untrusted.example/', frontendUrl: 'https://untrusted.example/',
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${frontendUrl}/`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(!response.headers.get('content-type')?.includes('application/json'));
    const home = await fetch(response.headers.get('location')!);
    assert.equal(home.url, `${frontendUrl}/`);
    assert.equal(home.status, 200);
    assert.equal(await home.text(), 'Home público del frontend');
    const persisted = await readSession(attempt.cookie);
    assertAttemptCleared(persisted);
    assert.equal(persisted.userId, undefined);
    assert.equal(persisted.pendingSpotifyRegistration, undefined);
    assertNoExternalWork(mocks);
  });

  test('cancelación conserva el ID y los datos de una sesión válida preexistente', async t => {
    const mocks = mockDependencies(t);
    const attempt = await startAttempt('/users/me', true);
    const beforeSession = await readSession(attempt.cookie);
    const response = await callback(attempt.cookie, { state: attempt.state, error: 'access_denied' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${frontendUrl}/`);
    const afterSession = await readSession(attempt.cookie);
    assert.equal(afterSession.sessionId, beforeSession.sessionId);
    assert.equal(afterSession.userId, 42);
    assert.equal(afterSession.userVersion, 9);
    assertAttemptCleared(afterSession);
    assertNoExternalWork(mocks);
  });

  for (const kind of ['incorrecto', 'ausente', 'sin intento'] as const) {
    test(`access_denied con state ${kind} sigue siendo un error de seguridad`, async t => {
      const mocks = mockDependencies(t);
      const attempt = await startAttempt();
      const cookie = kind === 'sin intento' ? '' : attempt.cookie;
      const query: Record<string, string> = { error: 'access_denied' };
      if (kind !== 'ausente') query.state = kind === 'incorrecto' ? 'x'.repeat(attempt.state.length) : attempt.state;
      const response = await callback(cookie, query);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('location'), null);
      assert.equal((await response.json()).message, 'La validación de seguridad de Spotify falló');
      assertAttemptCleared(await readSession(cookie));
      assertNoExternalWork(mocks);
    });
  }

  test('state consumido por una cancelación no se puede reutilizar', async t => {
    const mocks = mockDependencies(t);
    const attempt = await startAttempt();
    assert.equal((await callback(attempt.cookie, { state: attempt.state, error: 'access_denied' })).status, 303);
    const replay = await callback(attempt.cookie, { state: attempt.state, error: 'access_denied' });
    assert.equal(replay.status, 400);
    assert.equal(replay.headers.get('location'), null);
    assertNoExternalWork(mocks);
  });

  test('otros errores de Spotify y código ausente no se convierten en cancelación', async t => {
    const mocks = mockDependencies(t);
    for (const query of [{ error: 'server_error' }, {}]) {
      const attempt = await startAttempt();
      const response = await callback(attempt.cookie, { state: attempt.state, ...query });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('location'), null);
      assertAttemptCleared(await readSession(attempt.cookie));
    }
    assertNoExternalWork(mocks);
  });

  test('fallos del intercambio de código siguen siendo errores, sin redirección de cancelación', async t => {
    const mocks = mockDependencies(t);
    t.mock.method(SpotifyAuthClient.prototype, 'exchangeCode', async () => { throw new Error('Fallo simulado del intercambio'); });
    const attempt = await startAttempt();
    const response = await callback(attempt.cookie, { state: attempt.state, code: 'valid-code' });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('location'), null);
    assertAttemptCleared(await readSession(attempt.cookie));
    assert.equal(mocks.profile.mock.callCount(), 0);
    assert.equal(mocks.find.mock.callCount(), 0);
    assert.equal(mocks.createSpotify.mock.callCount(), 0);
  });

  for (const returnUrl of ['/library?tab=saved', '/']) {
    test(`flujo exitoso conserva el destino para usuario existente: ${returnUrl}`, async t => {
      const user = Object.assign(new User(), { id: 71, username: 'spotify_user', sessionVersion: 3 });
      const mocks = mockDependencies(t, user);
      const attempt = await startAttempt(returnUrl);
      const beforeSession = await readSession(attempt.cookie);
      const response = await callback(attempt.cookie, { state: attempt.state, code: 'valid-code' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), `${frontendUrl}${returnUrl === '/' ? '/dashboard' : returnUrl}`);
      assert.deepEqual(mocks.exchange.mock.calls[0]!.arguments, ['valid-code']);
      assert.deepEqual(mocks.profile.mock.calls[0]!.arguments, ['test-access-token']);
      assert.deepEqual(mocks.find.mock.calls[0]!.arguments, ['spotify-test-account']);
      const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
      const persisted = await readSession(cookie);
      assert.notEqual(persisted.sessionId, beforeSession.sessionId);
      assert.equal(persisted.userId, 71);
      assert.equal(persisted.userVersion, 3);
      assertAttemptCleared(persisted);
      assert.equal(mocks.createSpotify.mock.callCount(), 0);
      assert.equal(mocks.createLocal.mock.callCount(), 0);
    });
  }

  test('flujo exitoso de cuenta nueva sigue enviando al registro de Spotify', async t => {
    const mocks = mockDependencies(t);
    const attempt = await startAttempt('/library');
    const response = await callback(attempt.cookie, { state: attempt.state, code: 'valid-code' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${frontendUrl}/register/spotify`);
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    const persisted = await readSession(cookie);
    assert.equal(persisted.userId, undefined);
    assert.equal(persisted.pendingSpotifyRegistration.spotifyId, 'spotify-test-account');
    assert.equal(persisted.pendingSpotifyRegistration.returnUrl, '/library');
    assertAttemptCleared(persisted);
    assert.equal(mocks.exchange.mock.callCount(), 1);
    assert.equal(mocks.profile.mock.callCount(), 1);
    assert.equal(mocks.createSpotify.mock.callCount(), 0);
    assert.equal(mocks.createLocal.mock.callCount(), 0);
  });
});
