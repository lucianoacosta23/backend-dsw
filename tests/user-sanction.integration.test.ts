import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import session from 'express-session';
import * as argon2 from 'argon2';
import pg from 'pg';
import { MikroORM } from '@mikro-orm/postgresql';
import { RequestContext } from '@mikro-orm/core';

import config from '../src/config/mikro-orm.config.js';
import router from '../src/routes/index.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { notFoundMiddleware } from '../src/middlewares/not-found.middleware.js';
import { AppError } from '../src/shared/errors/app-error.js';
import { User } from '../src/modules/users/user.entity.js';
import { Release, ReleaseDatePrecision, ReleaseType } from '../src/modules/releases/release.entity.js';
import { Review } from '../src/modules/reviews/review.entity.js';
import { ReviewRepository } from '../src/modules/reviews/review.repository.js';
import { Playlist } from '../src/modules/playlist/playlist.entity.js';
import { PlaylistSave } from '../src/modules/playlist/playlist-save.entity.js';
import { Comment } from '../src/modules/comments/comment.entity.js';
import { UserSanction } from '../src/modules/users/user-sanction.entity.js';
import { ReviewReport } from '../src/modules/reports/report.entity.js';
import { REVIEW_EDIT_WINDOW_MS } from '../src/modules/reviews/review.rules.js';

// Base nueva por ejecución. Nunca se migran ni se limpian bases existentes.
const databaseName = `jukeboxd_sanction_test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Client({
  host: config.host,
  port: config.port,
  database: config.dbName,
  user: config.user,
  password: process.env.DB_PASSWORD ?? '',
  connectionTimeoutMillis: 5000,
});
const password = 'review-test-password';
const repository = new ReviewRepository();
let orm: MikroORM | undefined;
let server: Server | undefined;
let createdDatabase = false;
let baseUrl: string;
let passwordHash: string;

interface PublicReview {
  id: number;
  author: { id: number; username: string };
  releaseId: number;
  text: string;
  rating: number;
  createdAt: string;
  editedAt: string | null;
}

function database(): MikroORM {
  assert.ok(orm);
  return orm;
}

async function inContext<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContext.create(database().em, fn);
}

async function request(path: string, options: { method?: string; cookie?: string; body?: unknown; raw?: string; header?: boolean; contentType?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.header !== false) headers['X-Jukeboxd-Request'] = '1';
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.raw !== undefined || options.body !== undefined) {
    headers['Content-Type'] = options.contentType ?? 'application/json';
    init.body = options.raw ?? JSON.stringify(options.body);
  }
  return fetch(`${baseUrl}${path}`, init);
}

async function expectError(response: globalThis.Response, status: number) {
  assert.equal(response.status, status, await response.clone().text());
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['message', 'success']);
  assert.equal(body.success, false);
  assert.equal(typeof body.message, 'string');
}

async function newUser(category = 'USER', id?: number): Promise<{ user: User & { id: number }; cookie: string }> {
  const user = new User();
  if (id !== undefined) user.id = id;
  user.username = `review_${randomUUID()}`;
  user.fullName = 'Dato privado';
  user.email = `${randomUUID()}@example.test`;
  user.spotifyId = randomUUID();
  user.passwordHash = passwordHash;
  user.category = category;
  await database().em.fork().persistAndFlush(user);
  assert.ok(user.id);

  // Login y requireAuth reales; solo el almacén de sesiones es en memoria.
  const response = await request('/auth/login', { method: 'POST', body: { email: user.email, password } });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { user: user as User & { id: number }, cookie };
}

async function newRelease(): Promise<Release & { id: number }> {
  const release = new Release();
  release.name = `Release ${randomUUID()}`;
  release.type = ReleaseType.ALBUM;
  release.releaseDate = '2026';
  release.releaseDatePrecision = ReleaseDatePrecision.YEAR;
  await database().em.fork().persistAndFlush(release);
  assert.ok(release.id);
  return release as Release & { id: number };
}

async function createReview(cookie: string, releaseId: number, rating = 3.5, text = '  Buena reseña  '): Promise<PublicReview> {
  const response = await request('/reviews', { method: 'POST', cookie, body: { releaseId, rating, text } });
  assert.equal(response.status, 201, await response.clone().text());
  const body = await response.json();
  return body.data as PublicReview;
}

async function persisted(id: number): Promise<Review> {
  return database().em.fork().findOneOrFail(Review, { id });
}

describe('Review con PostgreSQL, migraciones, rutas y sesiones reales', { concurrency: false }, () => {
  before(async () => {
    assert.match(databaseName, /^jukeboxd_sanction_test_[a-f0-9]{32}$/);
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    createdDatabase = true;
    orm = await MikroORM.init({
      ...config,
      dbName: databaseName,
      migrations: { ...config.migrations, snapshot: false },
    });
    const current = await orm.em.getConnection().execute<Array<{ name: string }>>('select current_database() as name');
    assert.equal(current[0]?.name, databaseName);
    await orm.migrator.up();
    passwordHash = await argon2.hash(password);

    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'review-tests-session-secret-32-characters', resave: false, saveUninitialized: false }));
    app.use((_req, _res, next) => RequestContext.create(database().em, next));
    app.use(router);
    app.use(notFoundMiddleware);
    app.use(errorMiddleware);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    } finally {
      try {
        await orm?.close(true);
      } finally {
        try {
          if (createdDatabase) {
            assert.match(databaseName, /^jukeboxd_sanction_test_[a-f0-9]{32}$/);
            await admin.query(`drop database "${databaseName}"`);
          }
        } finally {
          await admin.end();
        }
      }
    }
  });


  test('sanciones: contrato, permisos, borrado, evidencia, sesiones, expiración y baneo', async () => {
    const moderator = await newUser('ADMIN');
    const author = await newUser();
    const other = await newUser();
    const release = await newRelease();
    const review = await createReview(author.cookie, release.id);
    const otherReview = await createReview(other.cookie, release.id);
    const em = database().em.fork();
    const playlist = new Playlist();
    playlist.name = 'Conservar al suspender';
    playlist.user = em.getReference(User, author.user.id);
    const comment = new Comment();
    comment.author = em.getReference(User, other.user.id);
    comment.review = em.getReference(Review, review.id);
    comment.text = 'Comentario asociado';
    await em.persistAndFlush([playlist, comment]);
    const saved = new PlaylistSave();
    saved.user = em.getReference(User, other.user.id);
    saved.playlist = playlist;
    await em.persistAndFlush(saved);
    for (const [id, cookie] of [[review.id, other.cookie], [otherReview.id, author.cookie]] as const) {
      const reported = await request(`/reviews/${id}/reports`, { method: 'POST', cookie, body: { reason: 'HARASSMENT', details: 'Detalle para auditoría' } });
      assert.equal(reported.status, 201, await reported.clone().text());
    }
    const path = `/admin/users/${author.user.id}/sanctions`;
    const until = new Date(Date.now() + 86400000).toISOString();
    const suspendBody = { action: 'SUSPEND', reason: 'Acoso reiterado', suspendedUntil: until };
    const sanction = (body: unknown, cookie = moderator.cookie, customPath = path, header = true) => request(customPath, { method: 'POST', cookie, body, header });
    await expectError(await request('/admin/users'), 401);
    await expectError(await request('/admin/users', { cookie: author.cookie }), 403);
    await expectError(await sanction(suspendBody, author.cookie), 403);
    await expectError(await sanction(suspendBody, moderator.cookie, path, false), 403);
    await expectError(await sanction({ ...suspendBody, reason: '' }), 400);
    await expectError(await sanction({ ...suspendBody, suspendedUntil: '2020-01-01T00:00:00.000Z' }), 400);
    await expectError(await sanction({ ...suspendBody, administratorId: other.user.id }), 400);
    await expectError(await sanction(suspendBody, moderator.cookie, `/admin/users/${moderator.user.id}/sanctions`), 403);
    await expectError(await sanction(suspendBody, moderator.cookie, '/admin/users/2147483647/sanctions'), 404);
    assert.ok(await database().em.fork().findOne(Review, review.id));

    const before = await request(`/admin/users/${author.user.id}`, { cookie: moderator.cookie });
    const beforeData = (await before.json()).data;
    assert.equal(beforeData.pendingReportCount, 1);
    assert.equal(beforeData.status, 'ENABLED');
    assert.equal(beforeData.activeSanction, null);
    assert.ok(!('email' in beforeData));

    const results = await Promise.all([sanction(suspendBody), sanction(suspendBody)]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    const response = await results.find(result => result.status === 201)!.json();
    assert.equal(response.data.status, 'SUSPENDED');
    assert.equal(response.data.suspendedUntil, until);
    assert.equal(response.data.activeSanction.action, 'SUSPEND');
    assert.equal(response.data.activeSanction.administrator.id, moderator.user.id);
    assert.equal(response.data.removedReviewCount, 1);
    assert.equal(await database().em.fork().count(Review, { author: author.user.id }), 0);
    assert.equal(await database().em.fork().count(ReviewReport, { reporter: author.user.id }), 0);
    assert.equal(await database().em.fork().count(ReviewReport, { review: review.id }), 0);
    assert.equal(await database().em.fork().count(Comment, { review: review.id }), 0);
    assert.equal(await database().em.fork().count(Playlist, { user: author.user.id }), 1);
    assert.equal(await database().em.fork().count(PlaylistSave, { playlist: playlist.id! }), 1);
    assert.ok(await database().em.fork().findOne(Review, otherReview.id));

    for (const endpoint of ['/auth/me', '/users/me']) {
      const blocked = await request(endpoint, { cookie: author.cookie });
      assert.equal(blocked.status, 403);
      const restriction = await blocked.json();
      assert.equal(restriction.code, 'ACCOUNT_SUSPENDED');
      assert.equal(restriction.suspendedUntil, until);
    }
    const login = () => request('/auth/login', { method: 'POST', body: { email: author.user.email, password } });
    assert.equal((await login()).status, 403);
    const profile = await request(`/users/${author.user.id}/profile`);
    const profileData = (await profile.json()).data;
    assert.equal(profileData.restricted, true);
    assert.equal(profileData.status, 'SUSPENDED');
    assert.ok(!('fullName' in profileData));
    const evidence = await request(`/admin/users/${author.user.id}/review-reports`, { cookie: moderator.cookie });
    const groups = (await evidence.json()).data;
    assert.equal(groups[0].review.id, review.id);
    assert.equal(groups[0].review.reportCount, 0);
    assert.ok(groups[0].review.deletedAt);
    assert.equal(groups[0].reports[0].details, 'Detalle para auditoría');

    const enabled = await sanction({ action: 'REACTIVATE', reason: 'Revisión administrativa' });
    assert.equal(enabled.status, 201);
    assert.equal((await enabled.json()).data.status, 'ENABLED');
    assert.equal((await request('/auth/me', { cookie: author.cookie })).status, 401);
    assert.equal((await login()).status, 200);
    assert.equal(await database().em.fork().count(Review, { author: author.user.id }), 0);
    assert.equal(await database().em.fork().count(ReviewReport, { reporter: author.user.id }), 0);
    await expectError(await sanction({ action: 'REACTIVATE', reason: 'Duplicado' }), 409);

    const again = await sanction(suspendBody);
    assert.equal(again.status, 201);
    await database().em.fork().nativeUpdate(User, { id: author.user.id }, { suspendedUntil: new Date(Date.now() - 1000) });
    const expired = await request(`/admin/users/${author.user.id}`, { cookie: moderator.cookie });
    const expiredData = (await expired.json()).data;
    assert.equal(expiredData.status, 'ENABLED');
    assert.equal(expiredData.activeSanction, null);
    assert.equal((await login()).status, 200);

    const banned = await sanction({ action: 'BAN', reason: 'Reincidencia' });
    assert.equal(banned.status, 201, await banned.clone().text());
    const bannedData = (await banned.json()).data;
    assert.equal(bannedData.status, 'BANNED');
    assert.equal(bannedData.suspendedUntil, null);
    assert.equal(bannedData.activeSanction.action, 'BAN');
    assert.equal(await database().em.fork().count(Playlist, { user: author.user.id }), 0);
    assert.equal(await database().em.fork().count(PlaylistSave, { playlist: playlist.id! }), 0);
    const bannedLogin = await login();
    assert.equal(bannedLogin.status, 403);
    assert.equal((await bannedLogin.json()).code, 'ACCOUNT_BANNED');
    await expectError(await sanction({ action: 'BAN', reason: 'Duplicado' }), 409);
    const history = await request(path, { cookie: moderator.cookie });
    const entries = (await history.json()).data;
    assert.equal(entries.length, 4);
    assert.equal(new Set(entries.map((entry: { id: number }) => entry.id)).size, 4);
    assert.equal(entries[0].action, 'BAN');
    assert.equal((await sanction({ action: 'REACTIVATE', reason: 'Revisión' })).status, 201);
    assert.equal(await database().em.fork().count(Playlist, { user: author.user.id }), 0);
  });

  test('una falla al eliminar playlists revierte cuenta, reseñas, reportes e historial', async () => {
    const moderator = await newUser('ADMIN');
    const author = await newUser();
    const release = await newRelease();
    const review = await createReview(author.cookie, release.id);
    const em = database().em.fork();
    const playlist = new Playlist();
    playlist.name = 'Playlist protegida solo para comprobar rollback';
    playlist.user = em.getReference(User, author.user.id);
    await em.persistAndFlush(playlist);
    // Restricción exclusiva de esta base temporal: fuerza una falla después del borrado de reseñas.
    await em.getConnection().execute('create table sanction_rollback_test (playlist_id integer references playlist(id))');
    await em.getConnection().execute('insert into sanction_rollback_test values (?)', [playlist.id]);
    try {
      const result = await request(`/admin/users/${author.user.id}/sanctions`, {
        method: 'POST', cookie: moderator.cookie, body: { action: 'BAN', reason: 'Prueba de rollback' },
      });
      assert.equal(result.status, 500);
      const restored = await database().em.fork().findOneOrFail(User, author.user.id);
      assert.equal(restored.status, 'ENABLED');
      assert.equal(restored.sessionVersion, 0);
      assert.ok(await database().em.fork().findOne(Review, review.id));
      assert.ok(await database().em.fork().findOne(Playlist, playlist.id!));
      assert.equal(await database().em.fork().count(UserSanction, { user: author.user.id }), 0);
      assert.equal((await request('/auth/me', { cookie: author.cookie })).status, 200);
    } finally {
      await em.getConnection().execute('drop table sanction_rollback_test');
    }
  });

  test('la migración coincide con el modelo de sanciones', async () => {
    const sql = await database().schema.getUpdateSchemaSQL({ wrap: false });
    const changes = sql.split('\n').filter(line => /user_sanction|suspended_until|session_version|user_status/.test(line));
    assert.deepEqual(changes, [], changes.join('\n'));
  });

  test('listado global: prioridad, paginación, búsqueda y registro activo', async () => {
    const moderator = await newUser('ADMIN');
    const em = database().em.fork();
    const users: User[] = [];
    for (let i = 0; i < 12; i++) {
      const user = new User();
      user.username = `priority_${i}_${randomUUID()}`;
      user.fullName = `Nombre ${i}`;
      user.category = 'USER';
      users.push(user);
    }
    await em.persistAndFlush(users);
    const release = await newRelease();
    const target = users[11]!;
    const review = new Review();
    review.author = target;
    review.release = em.getReference(Release, release.id);
    review.rating = 2;
    await em.persistAndFlush(review);
    for (const reporter of users.slice(0, 3)) {
      const report = new ReviewReport();
      report.review = review;
      report.reporter = reporter;
      report.reason = 'SPAM';
      em.persist(report);
    }
    await em.flush();
    const list = await request('/admin/users?pageSize=10&sort=priority', { cookie: moderator.cookie });
    assert.equal(list.status, 200, await list.clone().text());
    const body = await list.json();
    assert.equal(body.data.length, 10);
    assert.ok(body.pagination.total > 10);
    assert.equal(body.data[0].id, target.id);
    assert.equal(body.data[0].criticalReviewCount, 1);
    assert.equal(body.data[0].pendingReportCount, 3);
    assert.ok(!('email' in body.data[0]));
    const search = await request(`/admin/users?q=${encodeURIComponent(users[8]!.username)}`, { cookie: moderator.cookie });
    assert.equal((await search.json()).data[0].id, users[8]!.id);
    await expectError(await request('/admin/users?page=0', { cookie: moderator.cookie }), 400);
    await expectError(await request('/admin/users?pageSize=101', { cookie: moderator.cookie }), 400);
    const registered = await request('/auth/register', { method: 'POST', body: { email: `${randomUUID()}@example.test`, username: `registered_${randomUUID()}`, fullName: 'Nuevo usuario', password } });
    assert.equal(registered.status, 201);
    const newData = (await registered.json()).data;
    assert.equal(newData.status, 'ENABLED');
    assert.equal(newData.suspendedUntil, null);
    assert.equal((await database().em.fork().findOneOrFail(User, newData.id)).status, 'ENABLED');
  });
});
