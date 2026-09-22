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
import { REVIEW_EDIT_WINDOW_MS } from '../src/modules/reviews/review.rules.js';

// Base nueva por ejecución. Nunca se migran ni se limpian bases existentes.
const databaseName = `jukeboxd_review_test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Client({
  host: config.host,
  port: config.port,
  database: config.dbName,
  user: config.user,
  password: process.env.DB_PASSWORD ?? '',
  connectionTimeoutMillis: 5000,
});
const migrationName = 'Migration20260922000000';
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
    assert.match(databaseName, /^jukeboxd_review_test_[a-f0-9]{32}$/);
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
            assert.match(databaseName, /^jukeboxd_review_test_[a-f0-9]{32}$/);
            await admin.query(`drop database "${databaseName}"`);
          }
        } finally {
          await admin.end();
        }
      }
    }
  });

  test('crea varias reseñas por pareja, toda la escala y respuestas públicas sin datos sensibles', async () => {
    const { user, cookie } = await newUser();
    const release = await newRelease();
    const ids: number[] = [];
    for (const rating of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
      const review = await createReview(cookie, release.id, rating);
      ids.push(review.id);
      assert.equal(review.rating, rating);
      assert.equal(review.text, 'Buena reseña');
      assert.equal(review.editedAt, null);
      assert.deepEqual(review.author, { id: user.id, username: user.username });
      assert.deepEqual(Object.keys(review).sort(), ['author', 'createdAt', 'editedAt', 'id', 'rating', 'releaseId', 'text']);
      const response = await request(`/reviews/${review.id}`, { header: false });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data, review);
    }
    assert.equal(new Set(ids).size, 9);
    assert.equal(await database().em.fork().count(Review, { author: user.id, release: release.id }), 9);
  });

  test('escrituras requieren sesión y cabecera; el autor no puede suplantarse desde el cuerpo', async () => {
    const { user, cookie } = await newUser();
    const release = await newRelease();
    const body = { releaseId: release.id, text: 'Texto', rating: 4 };
    const review = await createReview(cookie, release.id);
    for (const [method, path, data] of [
      ['POST', '/reviews', body],
      ['PATCH', `/reviews/${review.id}`, { text: 'Nuevo texto' }],
      ['DELETE', `/reviews/${review.id}`, undefined],
    ] as const) {
      await expectError(await request(path, { method, body: data }), 401);
      await expectError(await request(path, { method, cookie, body: data, header: false }), 403);
      await expectError(await request(path, { method, cookie: 'connect.sid=invalid', body: data }), 401);
    }
    for (const field of ['authorId', 'userId', 'author', 'createdAt', 'deletedAt']) {
      await expectError(await request('/reviews', { method: 'POST', cookie, body: { ...body, [field]: user.id } }), 400);
    }
    // Una sesión persistida cuyo usuario ya no existe también debe rechazarse.
    const stale = await newUser();
    await database().em.fork().nativeDelete(User, { id: stale.user.id });
    await expectError(await request('/reviews', { method: 'POST', cookie: stale.cookie, body }), 401);
  });

  test('valida JSON, tipos, campos, texto, puntuación, IDs y lanzamiento inexistente por HTTP', async () => {
    const { cookie } = await newUser();
    const release = await newRelease();
    const valid = { releaseId: release.id, text: 'Texto', rating: 4 };
    for (const body of [null, [], true, 1, 'texto', {}, { ...valid, extra: true },
      { ...valid, releaseId: '1' }, { ...valid, releaseId: 0 }, { ...valid, releaseId: 2147483648 },
      { ...valid, text: ' \n\t' }, { ...valid, text: 3 }, { ...valid, text: 'a'.repeat(2001) },
      { ...valid, text: 'a\0b' }, { ...valid, rating: '1,5' }, { ...valid, rating: null },
      { ...valid, rating: 1.49 }, { ...valid, rating: 0.5 }, { ...valid, rating: 5.5 }]) {
      await expectError(await request('/reviews', { method: 'POST', cookie, body }), 400);
    }
    await expectError(await request('/reviews', { method: 'POST', cookie, raw: '{"rating":' }), 400);
    await expectError(await request('/reviews', { method: 'POST', cookie, body: { ...valid, text: 'a'.repeat(110000) } }), 413);
    await expectError(await request('/reviews', { method: 'POST', cookie, raw: '{}', contentType: 'text/plain' }), 400);
    await expectError(await request('/reviews', { method: 'POST', cookie }), 400);
    await expectError(await request('/reviews', { method: 'POST', cookie, body: { ...valid, releaseId: 2147483647 } }), 404);
    for (const id of ['0', '-1', '01', '1.5', '1e2', '2147483648', 'invalid']) {
      await expectError(await request(`/reviews/${id}`), 400);
      await expectError(await request(`/reviews/${id}`, { method: 'PATCH', cookie, body: { text: 'Texto' } }), 400);
      await expectError(await request(`/reviews/${id}`, { method: 'DELETE', cookie }), 400);
    }
    await expectError(await request('/reviews/2147483647'), 404);
    const unicode = await createReview(cookie, release.id, 1.5, ` ${'🎵'.repeat(2000)} `);
    assert.equal(Array.from(unicode.text).length, 2000);
  });

  test('PATCH valida el cuerpo y solo cambia texto y editedAt; nunca createdAt ni rating', async () => {
    const { cookie } = await newUser();
    const release = await newRelease();
    const review = await createReview(cookie, release.id);
    const path = `/reviews/${review.id}`;
    for (const body of [{}, [], null, { text: '' }, { text: 1 }, { text: 'a'.repeat(2001) },
      { text: 'Texto', rating: 3.5 }, { text: 'Texto', releaseId: release.id },
      { text: 'Texto', editedAt: new Date().toISOString() }]) {
      await expectError(await request(path, { method: 'PATCH', cookie, body }), 400);
    }
    await expectError(await request(path, { method: 'PATCH', cookie, raw: '{' }), 400);
    for (const text of ['Editado una vez', 'Editado dos veces']) {
      const response = await request(path, { method: 'PATCH', cookie, body: { text: ` ${text} ` } });
      assert.equal(response.status, 200, await response.clone().text());
      const updated = (await response.json()).data as PublicReview;
      assert.equal(updated.text, text);
      assert.ok(updated.editedAt);
      assert.equal(updated.createdAt, review.createdAt);
      assert.equal(updated.rating, review.rating);
    }
  });

  test('permisos usan author.id: ADMIN ajeno recibe 403 al editar y puede borrar la misma reseña', async () => {
    const owner = await newUser();
    const other = await newUser('USER', 1000000);
    const administrator = await newUser('ADMIN');
    const release = await newRelease();
    // Fuerza review.id === other.user.id para detectar el uso erróneo de requireSelfOrAdmin.
    const seeded = await database().em.getConnection().execute<Array<{ id: number }>>(
      'insert into review (id, author_id, release_id, text, rating) values (?, ?, ?, ?, ?) returning id',
      [other.user.id, owner.user.id, release.id, 'Propiedad del autor', 4],
    );
    const id = seeded[0]!.id;
    // Mantener la secuencia por delante del ID explícito de esta prueba.
    await database().em.getConnection().execute("select setval(pg_get_serial_sequence('review', 'id'), (select max(id) from review))");
    const path = `/reviews/${id}`;
    await expectError(await request(path, { method: 'PATCH', cookie: other.cookie, body: { text: 'Intruso' } }), 403);
    await expectError(await request(path, { method: 'DELETE', cookie: other.cookie }), 403);
    assert.equal((await request(path, { method: 'PATCH', cookie: owner.cookie, body: { text: 'Autor' } })).status, 200);
    const beforeAdminEdit = await persisted(id);
    await expectError(await request(path, { method: 'PATCH', cookie: administrator.cookie, body: { text: 'Moderado' } }), 403);
    const afterAdminEdit = await persisted(id);
    assert.equal(afterAdminEdit.text, 'Autor');
    assert.equal(afterAdminEdit.editedAt?.getTime(), beforeAdminEdit.editedAt?.getTime());
    await expectError(await request(path, { method: 'PATCH', cookie: administrator.cookie, body: { text: 'Moderado', rating: 5 } }), 400);
    assert.equal((await request(path, { method: 'DELETE', cookie: administrator.cookie })).status, 204);
    assert.ok((await persisted(id)).deletedAt);
  });

  test('ADMIN puede editar su propia reseña dentro del plazo y borrar reseñas ajenas antiguas', async () => {
    const owner = await newUser();
    const administrator = await newUser('ADMIN');
    const release = await newRelease();
    const ownReview = await createReview(administrator.cookie, release.id);
    const otherReview = await createReview(owner.cookie, release.id);
    assert.equal((await request(`/reviews/${ownReview.id}`, {
      method: 'PATCH', cookie: administrator.cookie, body: { text: 'Editado por su autor ADMIN' },
    })).status, 200);

    await database().em.fork().nativeUpdate(Review, { release: release.id }, {
      createdAt: new Date('2020-01-01T00:00:00Z'),
    });
    for (const review of [ownReview, otherReview]) {
      await expectError(await request(`/reviews/${review.id}`, {
        method: 'PATCH', cookie: administrator.cookie, body: { text: 'Fuera de plazo' },
      }), 403);
    }
    assert.equal((await request(`/reviews/${otherReview.id}`, {
      method: 'DELETE', cookie: administrator.cookie,
    })).status, 204);
    assert.ok((await persisted(otherReview.id)).deletedAt);
  });

  test('plazo exacto de 24 horas persiste para el autor, incluso ADMIN, y editar no lo extiende', async () => {
    const owner = await newUser();
    const release = await newRelease();
    const review = await createReview(owner.cookie, release.id);
    const createdAt = new Date('2026-01-01T00:00:00Z');
    await database().em.fork().nativeUpdate(Review, { id: review.id }, { createdAt });
    const deadline = createdAt.getTime() + REVIEW_EDIT_WINDOW_MS;
    let now = new Date(deadline - 1);
    const timed = new ReviewRepository(() => now);
    const actor = { id: owner.user.id, category: 'USER' };
    await inContext(() => timed.updateText(review.id, 'Último instante válido', actor));
    assert.equal((await persisted(review.id)).editedAt?.getTime(), deadline - 1);
    now = new Date(deadline);
    for (const category of ['USER', 'ADMIN']) {
      await assert.rejects(inContext(() => timed.updateText(review.id, 'Demasiado tarde', { ...actor, category })),
        (error: unknown) => error instanceof AppError && error.statusCode === 403);
    }
    const stored = await persisted(review.id);
    assert.equal(stored.createdAt.getTime(), createdAt.getTime());
    assert.equal(stored.editedAt?.getTime(), deadline - 1);
    assert.equal(stored.text, 'Último instante válido');
    await expectError(await request(`/reviews/${review.id}`, { method: 'PATCH', cookie: owner.cookie, body: { text: 'Fuera de plazo' } }), 403);
    assert.equal((await request(`/reviews/${review.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
  });

  test('borrado lógico oculta lecturas y no admite nuevas ediciones ni bajas', async () => {
    const owner = await newUser();
    const adminUser = await newUser('ADMIN');
    const release = await newRelease();
    const review = await createReview(owner.cookie, release.id);
    const path = `/reviews/${review.id}`;
    await expectError(await request(path, { method: 'DELETE', cookie: owner.cookie, body: { deletedAt: '2020-01-01' } }), 400);
    await expectError(await request(path, { method: 'DELETE', cookie: owner.cookie, raw: '{}', contentType: 'text/plain' }), 400);
    await expectError(await request(path, { method: 'DELETE', cookie: owner.cookie, raw: '{' }), 400);
    const deletion = await request(path, { method: 'DELETE', cookie: owner.cookie });
    assert.equal(deletion.status, 204);
    assert.equal(await deletion.text(), '');
    const stored = await persisted(review.id);
    assert.ok(stored.deletedAt);
    assert.equal(stored.rating, review.rating);
    assert.equal(stored.text, review.text);
    await expectError(await request(path), 404);
    for (const cookie of [owner.cookie, adminUser.cookie]) {
      await expectError(await request(path, { method: 'PATCH', cookie, body: { text: 'No revive' } }), 404);
      await expectError(await request(path, { method: 'DELETE', cookie }), 404);
    }
    for (const query of [`releaseId=${release.id}`, `authorId=${owner.user.id}`]) {
      const response = await request(`/reviews?${query}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.data, []);
      assert.equal(body.pagination.total, 0);
    }
    assert.equal((await persisted(review.id)).deletedAt?.getTime(), stored.deletedAt.getTime());
  });

  test('listados públicos paginados filtran por autor/lanzamiento y desempatan por ID', async () => {
    const owner = await newUser();
    const other = await newUser();
    const release = await newRelease();
    const secondRelease = await newRelease();
    const first = await createReview(owner.cookie, release.id);
    const second = await createReview(owner.cookie, release.id);
    const third = await createReview(other.cookie, release.id);
    const outside = await createReview(owner.cookie, secondRelease.id);
    const sameDate = new Date('2026-01-01T00:00:00Z');
    await database().em.fork().nativeUpdate(Review, { release: release.id }, { createdAt: sameDate });
    for (const [page, ids] of [[1, [third.id, second.id]], [2, [first.id]], [3, []]] as const) {
      const response = await request(`/reviews?releaseId=${release.id}&page=${page}&pageSize=2`, { header: false });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.data.map((item: PublicReview) => item.id), ids);
      assert.deepEqual(body.pagination, { page, pageSize: 2, total: 3, totalPages: 2 });
      assert.equal(body.sort, 'newest');
      for (const item of body.data) assert.deepEqual(Object.keys(item.author).sort(), ['id', 'username']);
    }
    const byAuthor = await (await request(`/reviews?authorId=${owner.user.id}`)).json();
    assert.deepEqual(byAuthor.data.map((item: PublicReview) => item.id), [outside.id, second.id, first.id]);
    const intersection = await (await request(`/reviews?authorId=${owner.user.id}&releaseId=${release.id}`)).json();
    assert.deepEqual(intersection.data.map((item: PublicReview) => item.id), [second.id, first.id]);
    for (const query of ['', 'authorId=0', `releaseId=${release.id}&pageSize=101`, 'releaseId=1&releaseId=2',
      `releaseId=${release.id}&sort=likes`, `authorId=${owner.user.id}&page=0`, 'releaseId[x]=1']) {
      await expectError(await request(`/reviews?${query}`), 400);
    }
  });

  test('última puntuación: A/B/B borrada no reactiva A; C sí cuenta; fecha precede al ID', async () => {
    const owner = await newUser();
    const release = await newRelease();
    const eligible = () => inContext(() => repository.findEligibleRating(owner.user.id, release.id));
    assert.equal(await eligible(), null);
    const a = await createReview(owner.cookie, release.id, 2);
    const b = await createReview(owner.cookie, release.id, 5);
    const sameDate = new Date('2026-01-01');
    await database().em.fork().nativeUpdate(Review, { release: release.id }, { createdAt: sameDate });
    assert.equal(await eligible(), 5, 'B gana el empate de fechas por ID');
    await request(`/reviews/${b.id}`, { method: 'DELETE', cookie: owner.cookie });
    assert.equal(await eligible(), null);
    assert.equal((await request(`/reviews/${a.id}`)).status, 200, 'A sigue visible');
    const c = await createReview(owner.cookie, release.id, 3.5);
    assert.equal(await eligible(), 3.5);
    // Un ID mayor con fecha menor no reemplaza C.
    const older = await createReview(owner.cookie, release.id, 1);
    await database().em.fork().nativeUpdate(Review, { id: older.id }, { createdAt: new Date('2025-01-01') });
    assert.equal(await eligible(), 3.5);
    const other = await newUser();
    await createReview(other.cookie, release.id, 4.5);
    const otherRelease = await newRelease();
    await createReview(owner.cookie, otherRelease.id, 4);
    assert.equal(await eligible(), 3.5, 'Las otras parejas no interfieren');
    await request(`/reviews/${c.id}`, { method: 'PATCH', cookie: owner.cookie, body: { text: 'Sigue C' } });
    assert.equal(await eligible(), 3.5);
    await request(`/reviews/${a.id}`, { method: 'DELETE', cookie: owner.cookie });
    assert.equal(await eligible(), 3.5, 'Borrar una anterior no altera la última');
  });

  test('dos bajas concurrentes producen una sola baja; edición concurrente no revive la reseña', async () => {
    const owner = await newUser();
    const release = await newRelease();
    const review = await createReview(owner.cookie, release.id);
    const path = `/reviews/${review.id}`;
    const deletions = await Promise.all([
      request(path, { method: 'DELETE', cookie: owner.cookie }),
      request(path, { method: 'DELETE', cookie: owner.cookie }),
    ]);
    assert.deepEqual(deletions.map(response => response.status).sort(), [204, 404]);
    const second = await createReview(owner.cookie, release.id);
    const [edit, deletion] = await Promise.all([
      request(`/reviews/${second.id}`, { method: 'PATCH', cookie: owner.cookie, body: { text: 'En carrera' } }),
      request(`/reviews/${second.id}`, { method: 'DELETE', cookie: owner.cookie }),
    ]);
    assert.ok([200, 404].includes(edit.status));
    assert.equal(deletion.status, 204);
    assert.ok((await persisted(second.id)).deletedAt);
    await expectError(await request(`/reviews/${second.id}`), 404);
  });

  test('PostgreSQL rechaza puntajes fuera de escala sin redondearlos y conserva claves foráneas', async () => {
    const { user } = await newUser();
    const release = await newRelease();
    const connection = database().em.getConnection();
    for (const rating of ['0', '0.5', '1.49', '1.51', '2.25', '5.01', '5.5', 'NaN', 'Infinity', '-Infinity']) {
      await assert.rejects(connection.execute(
        'insert into review (author_id, release_id, text, rating) values (?, ?, ?, ?)',
        [user.id, release.id, 'SQL directo', rating],
      ), (error: unknown) => error instanceof Error && 'code' in error && error.code === '23514');
    }
    for (const field of ['rating', 'text', 'author_id', 'release_id']) {
      const values: Record<string, unknown> = { rating: 4, text: 'Texto', author_id: user.id, release_id: release.id };
      values[field] = null;
      await assert.rejects(connection.execute(
        'insert into review (author_id, release_id, text, rating) values (?, ?, ?, ?)',
        [values.author_id, values.release_id, values.text, values.rating],
      ), (error: unknown) => error instanceof Error && 'code' in error && error.code === '23502');
    }
    for (const text of ['', 'a'.repeat(2001)]) {
      await assert.rejects(connection.execute(
        'insert into review (author_id, release_id, text, rating) values (?, ?, ?, ?)',
        [user.id, release.id, text, 4],
      ), (error: unknown) => error instanceof Error && 'code' in error && error.code === '23514');
    }
    for (const [authorId, releaseId] of [[2147483647, release.id], [user.id, 2147483647]]) {
      await assert.rejects(connection.execute(
        'insert into review (author_id, release_id, text, rating) values (?, ?, ?, ?)',
        [authorId, releaseId, 'Texto', 4],
      ), (error: unknown) => error instanceof Error && 'code' in error && error.code === '23503');
    }
  });

  test('migración registra índices correctos y down/up afecta solamente Review', async () => {
    const connection = database().em.getConnection();
    const indexes = await connection.execute<Array<{ indexname: string; indexdef: string }>>(
      "select indexname, indexdef from pg_indexes where tablename = 'review'",
    );
    const latest = indexes.find(index => index.indexname === 'review_author_release_latest_idx');
    assert.ok(latest);
    assert.match(latest.indexdef, /author_id, release_id, created_at DESC, id DESC/);
    assert.doesNotMatch(latest.indexdef, /WHERE|UNIQUE/);
    for (const name of ['review_release_visible_idx', 'review_author_visible_idx']) {
      assert.match(indexes.find(index => index.indexname === name)!.indexdef, /WHERE \(deleted_at IS NULL\)/);
    }
    const em = database().em.fork();
    const users = await em.count(User);
    const releases = await em.count(Release);
    await database().migrator.down({ migrations: [migrationName] });
    const absent = await connection.execute<Array<{ name: string | null }>>("select to_regclass('review') as name");
    assert.equal(absent[0]?.name, null);
    assert.equal(await em.count(User), users);
    assert.equal(await em.count(Release), releases);
    await database().migrator.up({ migrations: [migrationName] });
    assert.equal(await em.count(Review), 0);
    const schemaDiff = await database().schema.getUpdateSchemaSQL({ wrap: false });
    assert.doesNotMatch(schemaDiff, /(?:alter table|create (?:unique )?index|drop (?:table|index))[^;]*\breview\b/i,
      'La entidad Review y su migración deben describir el mismo esquema');
  });
});
