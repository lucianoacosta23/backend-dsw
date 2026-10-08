import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, readdir, rm, access, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import argon2 from 'argon2';
import sharp from 'sharp';
import pg from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import { RequestContext, LockMode } from '@mikro-orm/core';
import config from '../src/config/mikro-orm.config.js';
import router from '../src/routes/index.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { notFoundMiddleware } from '../src/middlewares/not-found.middleware.js';
import { User } from '../src/modules/users/user.entity.js';
import { Release, ReleaseType, ReleaseDatePrecision } from '../src/modules/releases/release.entity.js';
import { ReleaseRepository } from '../src/modules/releases/release.repository.js';
import { Track } from '../src/modules/tracks/track.entity.js';
import { Playlist } from '../src/modules/playlist/playlist.entity.js';
import { Review } from '../src/modules/reviews/review.entity.js';
import { ProfileImage } from '../src/modules/profiles/profile-image.entity.js';
import { UserFavoriteRelease } from '../src/modules/profiles/user-favorite-release.entity.js';
import { UserFavoriteTrack } from '../src/modules/profiles/user-favorite-track.entity.js';
import { ImageService } from '../src/modules/profiles/image.service.js';
import { LocalImageStorage } from '../src/modules/profiles/image.storage.js';
import { optionalAuth } from '../src/middlewares/auth.middleware.js';
import { authRepository } from '../src/modules/auth/auth.repository.js';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

const name = `jukeboxd_profile_test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Client({ host: config.host, port: config.port, user: config.user, password: process.env.DB_PASSWORD ?? '', database: config.dbName, connectionTimeoutMillis: 5000 });
let orm: MikroORM;
let server: Server;
let base: string;
let directory: string;
let created = false;
let hash: string;
let snapshot: Buffer;
const priorUpload = process.env.UPLOAD_DIR;
const priorBase = process.env.PUBLIC_BASE_URL;
const snapshotPath = resolve('src/migrations/.snapshot-jukeboxd.json');
const context = <T>(fn: () => Promise<T>) => RequestContext.create(orm.em, fn);

async function request(path: string, options: { method?: string; cookie?: string; body?: unknown; header?: boolean; raw?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.header !== false) headers['X-Jukeboxd-Request'] = '1';
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined || options.raw !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = options.raw ?? JSON.stringify(options.body);
  }
  return fetch(base + path, init);
}
async function data(response: Response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
async function error(response: Response, status: number) {
  const body = await data(response, status);
  assert.deepEqual(Object.keys(body).sort(), ['message', 'success']);
  assert.equal(body.success, false);
}
function privateFieldsAbsent(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!['email', 'passwordHash', 'spotifyId', 'category', 'key', 'owner', 'session'].includes(key), `Filtración: ${key}`);
    privateFieldsAbsent(child);
  }
}
async function user(category = 'USER') {
  const entity = new User();
  Object.assign(entity, { username: `profile_${randomUUID()}`, fullName: 'Nombre público', email: `${randomUUID()}@example.test`, passwordHash: hash, spotifyId: randomUUID(), category });
  await orm.em.fork().persistAndFlush(entity);
  const response = await request('/auth/login', { method: 'POST', body: { email: entity.email, password: 'profile-password' } });
  await data(response);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  return { id: entity.id!, entity, cookie };
}
async function catalog(type = ReleaseType.ALBUM) {
  const release = new Release();
  Object.assign(release, { name: 'Proyecto', type, releaseDate: '2026', releaseDatePrecision: ReleaseDatePrecision.YEAR });
  const track = new Track();
  Object.assign(track, { name: 'Canción', release, durationMs: 1000, discNumber: 1, trackNumber: 1 });
  await orm.em.fork().persistAndFlush([release, track]);
  return { releaseId: release.id!, trackId: track.id! };
}
async function patch(cookie: string, body: unknown) {
  return request('/users/me/profile', { method: 'PATCH', cookie, body });
}
async function upload(cookie: string, purpose = 'avatar', buffer?: Buffer) {
  const content = buffer ?? await sharp({ create: { width: 900, height: 600, channels: 3, background: 'red' } }).png().toBuffer();
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(content)], { type: 'image/jpeg' }), '../../original.jpg');
  form.append('purpose', purpose);
  return fetch(base + '/users/me/images', { method: 'POST', headers: { Cookie: cookie, 'X-Jukeboxd-Request': '1' }, body: form });
}

async function blocked(count: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await admin.query<{ count: number }>(`select count(*)::int as count from pg_stat_activity
      where datname = $1 and wait_event_type = 'Lock'`, [name]);
    if (result.rows[0]!.count >= count) return;
    await delay(15);
  }
  assert.fail(`No se observaron ${count} operaciones bloqueadas`);
}

async function holdUser(id: number) {
  let unlock!: () => void;
  let acquired!: () => void;
  const gate = new Promise<void>(done => { unlock = done; });
  const ready = new Promise<void>(done => { acquired = done; });
  const transaction = orm.em.fork().transactional(async tx => {
    await tx.findOneOrFail(User, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
    acquired(); await gate;
  });
  await ready;
  return { unlock, transaction };
}

describe('Profile: PostgreSQL temporal, rutas reales y archivos aislados', { concurrency: false }, () => {
  before(async () => {
    assert.match(name, /^jukeboxd_profile_test_[a-f0-9]{32}$/);
    snapshot = await readFile(snapshotPath);
    directory = await mkdtemp(join(tmpdir(), 'jukeboxd-profile-test-'));
    process.env.UPLOAD_DIR = directory;
    delete process.env.PUBLIC_BASE_URL;
    await admin.connect();
    await admin.query(`create database "${name}"`);
    created = true;
    orm = await MikroORM.init({ ...config, dbName: name, migrations: { ...config.migrations, snapshot: false } });
    await orm.migrator.up();
    hash = await argon2.hash('profile-password');
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'profile-test-session-secret-32-characters', resave: false, saveUninitialized: false }));
    app.use((_req, _res, next) => RequestContext.create(orm.em, next));
    app.use(router);
    app.use(notFoundMiddleware);
    app.use(errorMiddleware);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
  });
  after(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(err => err ? reject(err) : done())); }
    if (orm) await orm.close(true);
    if (created) await admin.query(`drop database "${name}" with (force)`);
    await admin.end();
    if (directory) {
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'));
      assert.ok(directory.includes('jukeboxd-profile-test-'));
      await rm(directory, { recursive: true, force: true });
    }
    if (priorUpload === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = priorUpload;
    if (priorBase === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = priorBase;
    if (snapshot) assert.deepEqual(await readFile(snapshotPath), snapshot, 'El snapshot local se conserva byte a byte');
  });

  test('migración reversible y correspondencia del modelo de perfiles, sin alterar snapshot', async t => {
    await orm.migrator.down({ migrations: ['Migration20261007200000_profiles'] });
    const legacy = await orm.em.getConnection().execute<Array<{ id: number }>>(
      'insert into "user" (username, full_name, category, created_at) values (?, ?, ?, now()) returning id',
      [`legacy_${randomUUID()}`, 'Usuario anterior', 'USER'],
    );
    await orm.migrator.up();
    const sql = await orm.schema.getUpdateSchemaSQL({ wrap: false });
    const profileDrift = sql.split('\n').filter(line => /profile_image|user_favorite_|avatar_image|cover_image/.test(line));
    assert.deepEqual(profileDrift, [], profileDrift.join('\n'));
    if (sql.trim()) t.diagnostic(`Diferencias preexistentes fuera de perfiles: ${sql}`);
    const profile = (await data(await request(`/users/${legacy[0]!.id}/profile`))).data;
    assert.equal(profile.avatarUrl, null); assert.equal(profile.coverUrl, null);
    assert.deepEqual(profile.favoriteReleases, []); assert.deepEqual(profile.favoriteTracks, []);
  });

  test('perfil público, propio, búsqueda exacta, privacidad, flags y sesión inválida', async () => {
    const owner = await user();
    const viewer = await user();
    const anonymous = await request(`/users/${owner.id}/profile`);
    assert.equal(anonymous.headers.get('cache-control'), 'no-store');
    const profile = (await data(anonymous)).data;
    privateFieldsAbsent(profile);
    assert.deepEqual(profile.favoriteReleases, []);
    assert.deepEqual(profile.favoriteTracks, []);
    assert.equal(profile.avatarUrl, null);
    assert.equal(profile.coverUrl, null);
    assert.equal(profile.isOwnProfile, false);
    const own = (await data(await request('/users/me', { cookie: owner.cookie }))).data;
    assert.equal(own.isOwnProfile, true);
    const search = await data(await request(`/users/search?username=${encodeURIComponent(`  ${owner.entity.username.toUpperCase()}  `)}`));
    assert.deepEqual(search.data, profile);
    await error(await request('/users/me'), 401);
    await error(await request('/users'), 401);
    await error(await request(`/users/${owner.id}`), 401);
    await error(await request('/users/0/profile'), 400);
    await error(await request('/users/2147483647/profile'), 404);
    await error(await request('/users/search?username=missing'), 404);
    await error(await request('/users/search?username='), 400);
    await data(await request(`/users/${owner.id}/follow`, { method: 'PUT', cookie: viewer.cookie }), 201);
    await data(await request(`/users/${viewer.id}/follow`, { method: 'PUT', cookie: owner.cookie }), 201);
    const visited = (await data(await request(`/users/${owner.id}/profile`, { cookie: viewer.cookie }))).data;
    assert.equal(visited.followersCount, 1); assert.equal(visited.followingCount, 1);
    assert.equal(visited.isFollowing, true); assert.equal(visited.followsMe, true);
    await orm.em.fork().nativeDelete(User, viewer.id);
    const stale = (await data(await request(`/users/${owner.id}/profile`, { cookie: viewer.cookie }))).data;
    assert.equal(stale.isFollowing, false); assert.equal(stale.followsMe, false);
    await error(await request('/users/me', { cookie: viewer.cookie }), 401);
  });

  test('favoritos: cinco, orden, singles, omisiones, vaciar y rollback integral', async () => {
    const owner = await user();
    const items = await Promise.all(Array.from({ length: 5 }, () => catalog()));
    const releaseIds = items.map(item => item.releaseId);
    const trackIds = items.map(item => item.trackId);
    const single = await catalog(ReleaseType.SINGLE);
    let profile = (await data(await patch(owner.cookie, { favoriteReleaseIds: releaseIds, favoriteTrackIds: trackIds }))).data;
    assert.deepEqual(profile.favoriteReleases.map((r: { id: number }) => r.id), releaseIds);
    privateFieldsAbsent(profile);
    profile = (await data(await patch(owner.cookie, { favoriteReleaseIds: [...releaseIds].reverse() }))).data;
    assert.deepEqual(profile.favoriteReleases.map((r: { id: number }) => r.id), [...releaseIds].reverse());
    assert.deepEqual(profile.favoriteTracks.map((r: { id: number }) => r.id), trackIds);
    await error(await patch(owner.cookie, { favoriteReleaseIds: [single.releaseId] }), 400);
    await data(await patch(owner.cookie, { favoriteTrackIds: [single.trackId] }));
    for (const body of [{}, { userId: owner.id }, { favoriteReleaseIds: [...releaseIds, single.releaseId] },
      { favoriteTrackIds: [trackIds[0], trackIds[0]] }, { favoriteTrackIds: ['1'] },
      { favoriteReleaseIds: [], favoriteTrackIds: [2147483647] }]) await error(await patch(owner.cookie, body), 400);
    profile = (await data(await request('/users/me', { cookie: owner.cookie }))).data;
    assert.deepEqual(profile.favoriteReleases.map((r: { id: number }) => r.id), [...releaseIds].reverse());
    profile = (await data(await patch(owner.cookie, { favoriteReleaseIds: [], favoriteTrackIds: [] }))).data;
    assert.deepEqual(profile.favoriteReleases, []); assert.deepEqual(profile.favoriteTracks, []);
    await error(await request('/users/me/profile', { method: 'PATCH', body: { coverImageId: null } }), 401);
    await error(await request('/users/me/profile', { method: 'PATCH', cookie: owner.cookie, header: false, body: { coverImageId: null } }), 403);
    await error(await request('/users/me/profile', { method: 'PATCH', cookie: owner.cookie, raw: '{' }), 400);
  });

  test('solo dueño puede editar cuenta por la ruta anterior, incluido ADMIN ajeno', async () => {
    const owner = await user(); const other = await user('ADMIN');
    await error(await request(`/users/${owner.id}`, { method: 'PATCH', cookie: other.cookie, body: { fullName: 'Intruso' } }), 403);
    await data(await request(`/users/${owner.id}`, { method: 'PATCH', cookie: owner.cookie, body: { fullName: 'Mi nombre' } }));
    assert.equal((await data(await request(`/users/${owner.id}/profile`))).data.fullName, 'Mi nombre');
    await error(await patch(other.cookie, { userId: owner.id, avatarImageId: null }), 400);
  });

  test('subir, servir, asignar, reemplazar, rollback y permisos de imágenes', async () => {
    const owner = await user(); const other = await user();
    const avatar = (await data(await upload(owner.cookie), 201)).data;
    assert.equal((await data(await request('/users/me', { cookie: owner.cookie }))).data.avatarUrl, null);
    const served = await request(avatar.url);
    assert.equal(served.status, 200); assert.match(served.headers.get('content-type')!, /image\/webp/);
    const metadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    assert.equal(metadata.width, 512);
    await error(await patch(other.cookie, { avatarImageId: avatar.imageId }), 403);
    await error(await patch(owner.cookie, { coverImageId: avatar.imageId }), 400);
    await error(await patch(owner.cookie, { avatarImageId: 2147483647 }), 400);
    await data(await patch(owner.cookie, { avatarImageId: avatar.imageId }));
    const replacement = (await data(await upload(owner.cookie), 201)).data;
    await error(await patch(owner.cookie, { avatarImageId: replacement.imageId, favoriteTrackIds: [2147483647] }), 400);
    assert.equal((await data(await request('/users/me', { cookie: owner.cookie }))).data.avatarUrl, avatar.url);
    assert.equal((await request(avatar.url)).status, 200);
    await data(await patch(owner.cookie, { avatarImageId: replacement.imageId }));
    await error(await request(avatar.url), 404);
    await data(await patch(owner.cookie, { avatarImageId: null }));
    await error(await request(replacement.url), 404);
    await error(await request('/media/.env'), 404);
    await error(await request('/media'), 404);
    await error(await upload(owner.cookie, 'invalid'), 400);
    await error(await upload(owner.cookie, 'avatar', Buffer.from('falso jpg')), 415);
    await error(await upload(owner.cookie, 'avatar', Buffer.alloc(5 * 1024 * 1024 + 1)), 413);
  });

  test('limpieza de antiguas no asignadas, conservación de asignadas y eliminación de cuenta', async () => {
    const owner = await user();
    const a = (await data(await upload(owner.cookie), 201)).data;
    const b = (await data(await upload(owner.cookie, 'cover'), 201)).data;
    const fresh = (await data(await upload(owner.cookie), 201)).data;
    await data(await patch(owner.cookie, { coverImageId: b.imageId }));
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await orm.em.fork().nativeUpdate(ProfileImage, { id: { $in: [a.imageId, b.imageId] } }, { createdAt: old });
    await new ImageService(orm.em.fork()).prune();
    assert.equal(await orm.em.fork().findOne(ProfileImage, a.imageId), null);
    assert.ok(await orm.em.fork().findOne(ProfileImage, b.imageId));
    assert.ok(await orm.em.fork().findOne(ProfileImage, fresh.imageId));
    await error(await request(a.url), 404);
    assert.equal((await request(b.url)).status, 200);
    assert.equal((await request(`/users/${owner.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
    await error(await request(b.url), 404);
    await error(await request(fresh.url), 404);
    assert.equal(await orm.em.fork().count(ProfileImage, { id: { $in: [b.imageId, fresh.imageId] } }), 0);
  });

  test('playlists por autor: solo propias, flags, paginación, privacidad y rutas privadas', async () => {
    const owner = await user(); const viewer = await user(); const empty = await user();
    const make = async (ownerId: number, label: string) => {
      const em = orm.em.fork(); const p = new Playlist(); p.name = label; p.user = em.getReference(User, ownerId);
      await em.persistAndFlush(p); return p.id!;
    };
    const first = await make(owner.id, 'Primera'); const second = await make(owner.id, 'Segunda');
    const foreign = await make(viewer.id, 'Ajena guardada');
    await data(await request(`/playlist/${foreign}/save`, { method: 'POST', cookie: owner.cookie }));
    await data(await request(`/playlist/${second}/save`, { method: 'POST', cookie: viewer.cookie }));
    const listing = await data(await request(`/users/${owner.id}/playlists?pageSize=1`));
    assert.equal(listing.pagination.total, 2); assert.equal(listing.pagination.totalPages, 2);
    assert.equal(listing.data[0].id, second); assert.equal(listing.data[0].savedByMe, false);
    assert.equal(listing.data[0].saveCount, 1); privateFieldsAbsent(listing);
    assert.equal((await data(await request(`/users/${owner.id}/playlists?pageSize=1&page=2`))).data[0].id, first);
    assert.equal((await data(await request(`/users/${owner.id}/playlists`, { cookie: viewer.cookie }))).data[0].savedByMe, true);
    assert.equal((await data(await request(`/users/${owner.id}/playlists`, { cookie: owner.cookie }))).data[0].isOwnPlaylist, true);
    assert.deepEqual((await data(await request(`/users/${empty.id}/playlists`))).data, []);
    await error(await request('/users/2147483647/playlists'), 404);
    for (const query of ['page=0', 'page=1000001', 'pageSize=101', 'pageSize=1.2', 'other=1']) await error(await request(`/users/${owner.id}/playlists?${query}`), 400);
    await error(await request('/playlist/mine'), 401); await error(await request('/playlist/saved'), 401);
    assert.equal((await data(await request('/playlist/mine', { cookie: owner.cookie }))).pagination.total, 2);
    assert.equal((await data(await request('/playlist/saved', { cookie: owner.cookie }))).pagination.total, 1);
    privateFieldsAbsent(await data(await request('/playlist', { cookie: owner.cookie })));
    privateFieldsAbsent(await data(await request('/playlist', { method: 'POST', cookie: owner.cookie, body: { name: 'Nueva' } }), 201));
    privateFieldsAbsent(await data(await request(`/playlist/${first}`, { method: 'PATCH', cookie: owner.cookie, body: { name: 'Cambio' } })));
  });

  test('catálogo SINGLE retira favoritos en la misma transacción y conserva canciones', async () => {
    const owner = await user(); const item = await catalog();
    await data(await patch(owner.cookie, { favoriteReleaseIds: [item.releaseId], favoriteTrackIds: [item.trackId] }));
    await context(() => new ReleaseRepository().update(item.releaseId, { type: ReleaseType.SINGLE }));
    const profile = (await data(await request(`/users/${owner.id}/profile`))).data;
    assert.deepEqual(profile.favoriteReleases, []); assert.equal(profile.favoriteTracks[0].id, item.trackId);
  });

  test('cambio a SINGLE contra asignación: se serializan ambos órdenes', async () => {
    for (const assigningFirst of [true, false]) {
      const owner = await user(); const item = await catalog();
      const tx = orm.em.fork();
      await tx.begin();
      try {
        await tx.findOneOrFail(Release, item.releaseId, { lockMode: LockMode.PESSIMISTIC_WRITE });
        let assigning: Promise<Response>; let changing: Promise<unknown>;
        if (assigningFirst) {
          assigning = patch(owner.cookie, { favoriteReleaseIds: [item.releaseId] });
          await blocked(1);
          changing = context(() => new ReleaseRepository().update(item.releaseId, { type: ReleaseType.SINGLE }));
        } else {
          changing = context(() => new ReleaseRepository().update(item.releaseId, { type: ReleaseType.SINGLE }));
          await blocked(1);
          assigning = patch(owner.cookie, { favoriteReleaseIds: [item.releaseId] });
        }
        await blocked(2);
        await tx.commit();
        const [response] = await Promise.all([assigning, changing]);
        if (assigningFirst) await data(response); else await error(response, 400);
        assert.equal(await orm.em.fork().count(UserFavoriteRelease, { release: item.releaseId }), 0);
      } catch (error) {
        if (tx.isInTransaction()) await tx.rollback();
        throw error;
      }
    }
  });

  test('reviews siguen públicas y no filtran campos del autor', async () => {
    const owner = await user(); const item = await catalog(); const em = orm.em.fork();
    const review = new Review(); Object.assign(review, { author: em.getReference(User, owner.id), release: em.getReference(Release, item.releaseId), text: 'Review pública', rating: 4 });
    await em.persistAndFlush(review);
    const result = await data(await request(`/reviews?authorId=${owner.id}`));
    privateFieldsAbsent(result); assert.equal(result.data.length, 1);
  });

  test('dos ediciones simultáneas esperan el bloqueo del usuario y dejan listas completas', async () => {
    const owner = await user(); const a = await catalog(); const b = await catalog();
    const held = await holdUser(owner.id);
    let edits: Promise<Response>[] = [];
    try {
      edits = [patch(owner.cookie, { favoriteReleaseIds: [a.releaseId, b.releaseId] }), patch(owner.cookie, { favoriteReleaseIds: [b.releaseId, a.releaseId] })];
      await blocked(2);
    } finally { held.unlock(); await held.transaction; }
    for (const response of await Promise.all(edits)) await data(response);
    const rows = await orm.em.fork().find(UserFavoriteRelease, { user: owner.id }, { orderBy: { position: 'ASC' } });
    assert.deepEqual(rows.map(r => r.position), [1, 2]);
    assert.deepEqual(rows.map(r => r.release.id).sort(), [a.releaseId, b.releaseId].sort());
  });

  test('asignación contra limpieza: ambos órdenes serializados preservan referencias válidas', async () => {
    for (const assignmentFirst of [true, false]) {
      const owner = await user(); const image = (await data(await upload(owner.cookie), 201)).data;
      const held = await holdUser(owner.id);
      const cleaner = new ImageService(orm.em.fork());
      let assigning!: Promise<Response>; let cleaning!: Promise<boolean>;
      try {
        if (assignmentFirst) { assigning = patch(owner.cookie, { avatarImageId: image.imageId }); await blocked(1); cleaning = cleaner.cleanup(image.imageId); }
        else { cleaning = cleaner.cleanup(image.imageId); await blocked(1); assigning = patch(owner.cookie, { avatarImageId: image.imageId }); }
        await blocked(2);
      } finally { held.unlock(); await held.transaction; }
      const [response, removed] = await Promise.all([assigning, cleaning]);
      if (assignmentFirst) {
        await data(response); assert.equal(removed, false); assert.equal((await request(image.url)).status, 200);
      } else { await error(response, 400); assert.equal(removed, true); }
      const persisted = await orm.em.fork().findOneOrFail(User, owner.id, { populate: ['avatarImage'] });
      if (persisted.avatarImage) await access(join(directory, persisted.avatarImage.key));
    }
  });

  test('limpieza fallida conserva registro para reintento sin invalidar cambios confirmados', async () => {
    const owner = await user(); const image = (await data(await upload(owner.cookie), 201)).data;
    const storage = new LocalImageStorage(directory);
    const failing = { save: storage.save.bind(storage), url: storage.url.bind(storage), delete: async () => { throw new Error('disco temporalmente ocupado'); } };
    await new ImageService(orm.em.fork(), failing).cleanupSafely([image.imageId]);
    assert.ok(await orm.em.fork().findOne(ProfileImage, image.imageId));
    assert.equal((await request(image.url)).status, 200);
    assert.equal(await new ImageService(orm.em.fork()).cleanup(image.imageId), true);
  });

  test('fallo de persistencia limpia archivo y formatos rechazados no dejan archivos', async () => {
    const beforeFiles = await readdir(directory);
    const owner = await user();
    await error(await upload(owner.cookie, 'avatar', Buffer.from('invalid')), 415);
    const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toBuffer();
    const { ImagePurpose } = await import('../src/modules/profiles/profile-image.entity.js');
    await assert.rejects(new ImageService(orm.em.fork()).upload(2147483647, ImagePurpose.AVATAR, buffer));
    assert.deepEqual(await readdir(directory), beforeFiles);
  });

  test('multipart rechaza archivos/campos extra, archivo ausente y escrituras sin protección', async () => {
    const owner = await user();
    const content = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
    for (const mode of ['extra-file', 'extra-field', 'missing-file', 'wrong-field']) {
      const form = new FormData();
      form.append('purpose', 'avatar');
      if (mode !== 'missing-file') form.append(mode === 'wrong-field' ? 'image' : 'file', new Blob([new Uint8Array(content)]), 'image.png');
      if (mode === 'extra-file') form.append('file', new Blob([new Uint8Array(content)]), 'other.png');
      if (mode === 'extra-field') form.append('userId', String(owner.id));
      await error(await fetch(base + '/users/me/images', { method: 'POST', headers: { Cookie: owner.cookie, 'X-Jukeboxd-Request': '1' }, body: form }), 400);
    }
    await error(await request('/users/me/images', { method: 'POST' }), 401);
    await error(await request('/users/me/images', { method: 'POST', cookie: owner.cookie, header: false }), 403);
    await error(await request('/users/me/images', { method: 'POST', cookie: owner.cookie, body: { purpose: 'avatar' } }), 400);
  });

  test('limpieza respeta el límite exacto de 24 horas', async () => {
    const owner = await user(); const image = (await data(await upload(owner.cookie), 201)).data;
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    await orm.em.fork().nativeUpdate(ProfileImage, image.imageId, { createdAt });
    const cleaner = new ImageService(orm.em.fork());
    await cleaner.prune(new Date('2026-01-02T00:00:00.000Z'));
    assert.ok(await orm.em.fork().findOne(ProfileImage, image.imageId));
    await cleaner.prune(new Date('2026-01-02T00:00:00.001Z'));
    assert.equal(await orm.em.fork().findOne(ProfileImage, image.imageId), null);
  });

  test('restricciones SQL, cascadas y huecos conservan el orden relativo', async () => {
    const owner = await user(); const a = await catalog(); const b = await catalog();
    await data(await patch(owner.cookie, { favoriteReleaseIds: [a.releaseId, b.releaseId], favoriteTrackIds: [a.trackId, b.trackId] }));
    const connection = orm.em.getConnection();
    for (const [releaseId, position] of [[a.releaseId, 3], [b.releaseId, 1], [b.releaseId, 0], [b.releaseId, 6], [2147483647, 3]]) {
      await assert.rejects(connection.execute('insert into user_favorite_release (user_id, release_id, position) values (?, ?, ?)', [owner.id, releaseId, position]));
    }
    await orm.em.fork().nativeDelete(Track, a.trackId);
    await orm.em.fork().nativeDelete(Release, a.releaseId);
    const rows = await orm.em.fork().find(UserFavoriteRelease, { user: owner.id });
    assert.equal(rows[0]!.position, 2);
    const profile = (await data(await request(`/users/${owner.id}/profile`))).data;
    assert.equal(profile.favoriteReleases[0].id, b.releaseId);
    assert.equal(profile.favoriteTracks[0].id, b.trackId);
    assert.equal((await request(`/users/${owner.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
    assert.equal(await orm.em.fork().count(UserFavoriteRelease, { user: owner.id }), 0);
    assert.equal(await orm.em.fork().count(UserFavoriteTrack, { user: owner.id }), 0);
    assert.ok(await orm.em.fork().findOne(Track, b.trackId));
  });

  test('optionalAuth propaga fallas reales de base de datos', async t => {
    const failure = new Error('fallo simulado de base');
    t.mock.method(authRepository, 'findById', async () => { throw failure; });
    let forwarded: unknown;
    await optionalAuth({ session: { userId: 1 } } as ExpressRequest,
      { locals: {}, setHeader() {} } as unknown as ExpressResponse, error => { forwarded = error; });
    assert.equal(forwarded, failure);
  });
});
