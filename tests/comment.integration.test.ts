import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
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
import { Comment } from '../src/modules/comments/comment.entity.js';
import { CommentRepository } from '../src/modules/comments/comment.repository.js';
import { COMMENT_EDIT_WINDOW_MS } from '../src/modules/comments/comment.rules.js';

const databaseName = `jukeboxd_comment_test_${randomUUID().replaceAll('-', '')}`;
const connectionOptions = {
  host: config.host, port: config.port, user: config.user,
  password: process.env.DB_PASSWORD ?? '', connectionTimeoutMillis: 5000,
};
const admin = new pg.Client({ ...connectionOptions, database: config.dbName });
const migrationName = 'Migration20260922030000';
const password = 'comment-test-password';
let orm: MikroORM | undefined;
let server: Server | undefined;
let createdDatabase = false;
let baseUrl: string;
let passwordHash: string;

interface PublicComment {
  id: number;
  reviewId: number;
  parentId: number | null;
  author: { id: number; username: string };
  text: string;
  createdAt: string;
  editedAt: string | null;
}

function database(): MikroORM {
  assert.ok(orm);
  return orm;
}

function inContext<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContext.create(database().em, fn);
}

async function request(path: string, options: {
  method?: string; cookie?: string; body?: unknown; raw?: string; header?: boolean; contentType?: string;
} = {}) {
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

async function newUser(category = 'USER') {
  const user = new User();
  user.username = `comment_${randomUUID()}`;
  user.fullName = 'Nombre privado';
  user.email = `${randomUUID()}@example.test`;
  user.spotifyId = randomUUID();
  user.passwordHash = passwordHash;
  user.category = category;
  await database().em.fork().persistAndFlush(user);
  assert.ok(user.id);
  const response = await request('/auth/login', { method: 'POST', body: { email: user.email, password } });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { user: user as User & { id: number }, cookie };
}

async function newReview(authorId: number) {
  const em = database().em.fork();
  const release = new Release();
  release.name = `Release ${randomUUID()}`;
  release.type = ReleaseType.ALBUM;
  release.releaseDate = '2026';
  release.releaseDatePrecision = ReleaseDatePrecision.YEAR;
  const review = new Review();
  review.release = release;
  review.author = em.getReference(User, authorId);
  review.text = 'Reseña para comentar';
  review.rating = 4;
  await em.persistAndFlush([release, review]);
  assert.ok(review.id);
  return review as Review & { id: number };
}

async function createComment(cookie: string, reviewId: number, parentId?: number, text = '  Un comentario  '): Promise<PublicComment> {
  const body = parentId === undefined ? { text } : { text, parentId };
  const response = await request(`/reviews/${reviewId}/comments`, { method: 'POST', cookie, body });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).data as PublicComment;
}

async function persisted(id: number): Promise<Comment> {
  return database().em.fork().findOneOrFail(Comment, { id });
}

async function waitForBlockedWrites(count: number): Promise<void> {
  const deadline = Date.now() + 5000;
  do {
    const result = await admin.query<{ count: number }>(
      `select count(*)::int as count from pg_stat_activity
       where datname = $1 and wait_event_type = 'Lock'
       and query ilike '%review%' and query ilike '%for update%'`, [databaseName],
    );
    if (result.rows[0]!.count >= count) return;
    await delay(20);
  } while (Date.now() < deadline);
  assert.fail(`No se observaron ${count} escrituras esperando el bloqueo de Review`);
}

describe('Comment: PostgreSQL, rutas reales y autenticación por sesión', { concurrency: false }, () => {
  before(async () => {
    assert.match(databaseName, /^jukeboxd_comment_test_[a-f0-9]{32}$/);
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    createdDatabase = true;
    orm = await MikroORM.init({ ...config, dbName: databaseName, migrations: { ...config.migrations, snapshot: false } });
    const current = await orm.em.execute<Array<{ name: string }>>('select current_database() as name');
    assert.equal(current[0]?.name, databaseName);
    // Reconstruye primero el esquema base de main, incluido Review.
    await orm.migrator.up({ to: 'Migration20260922000000' });
    const beforeOid = await orm.em.execute("select 'review'::regclass::oid as oid");
    await orm.migrator.up();
    assert.deepEqual(await orm.em.execute("select 'review'::regclass::oid as oid"), beforeOid,
      'Comment no debe recrear Review');
    passwordHash = await argon2.hash(password);
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'comment-tests-session-secret-32-characters', resave: false, saveUninitialized: false }));
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
      try { await orm?.close(true); } finally {
        try {
          if (createdDatabase) {
            assert.match(databaseName, /^jukeboxd_comment_test_[a-f0-9]{32}$/);
            await admin.query(`drop database "${databaseName}"`);
          }
        } finally { await admin.end(); }
      }
    }
  });

  test('crea varios niveles y expone únicamente hijos directos y datos públicos', async () => {
    const { user, cookie } = await newUser();
    const review = await newReview(user.id);
    const root = await createComment(cookie, review.id);
    assert.equal(root.parentId, null);
    assert.equal(root.text, 'Un comentario');
    assert.equal(root.editedAt, null);
    assert.deepEqual(root.author, { id: user.id, username: user.username });
    assert.deepEqual(Object.keys(root).sort(), ['author', 'createdAt', 'editedAt', 'id', 'parentId', 'reviewId', 'text']);
    let parent = root;
    for (let depth = 0; depth < 12; depth++) {
      const child = await createComment(cookie, review.id, parent.id);
      assert.equal(child.reviewId, review.id);
      assert.equal(child.parentId, parent.id);
      const replies = await (await request(`/comments/${parent.id}/replies`, { header: false })).json();
      assert.deepEqual(replies.data, [child]);
      assert.equal(replies.pagination.total, 1);
      parent = child;
    }
    const roots = await (await request(`/reviews/${review.id}/comments`, { header: false })).json();
    assert.deepEqual(roots.data, [root]);
    assert.deepEqual((await (await request(`/comments/${parent.id}/replies`)).json()).data, []);
    const detail = await request(`/comments/${parent.id}`, { header: false });
    assert.equal(detail.status, 200);
    assert.deepEqual((await detail.json()).data, parent);
  });

  test('rechaza padre de otra reseña, inexistente/borrado y reseña inexistente', async () => {
    const { user, cookie } = await newUser();
    const review = await newReview(user.id);
    const otherReview = await newReview(user.id);
    const parent = await createComment(cookie, review.id);
    await expectError(await request(`/reviews/${otherReview.id}/comments`, {
      method: 'POST', cookie, body: { text: 'Cruce inválido', parentId: parent.id },
    }), 400);
    await expectError(await request(`/reviews/${review.id}/comments`, {
      method: 'POST', cookie, body: { text: 'Inválido', parentId: 2147483647 },
    }), 404);
    assert.equal((await request(`/comments/${parent.id}`, { method: 'DELETE', cookie })).status, 204);
    await expectError(await request(`/reviews/${review.id}/comments`, {
      method: 'POST', cookie, body: { text: 'Inválido', parentId: parent.id },
    }), 404);
    await expectError(await request('/reviews/2147483647/comments', { method: 'POST', cookie, body: { text: 'Inválido' } }), 404);
    await expectError(await request('/reviews/2147483647/comments'), 404);
    await expectError(await request('/comments/2147483647'), 404);
    await expectError(await request('/comments/2147483647/replies'), 404);
  });

  test('escrituras requieren sesión válida y cabecera, y no aceptan autor en el cuerpo', async () => {
    const { user, cookie } = await newUser();
    const review = await newReview(user.id);
    const comment = await createComment(cookie, review.id);
    for (const [method, path, body] of [
      ['POST', `/reviews/${review.id}/comments`, { text: 'Nuevo' }],
      ['PATCH', `/comments/${comment.id}`, { text: 'Nuevo' }],
      ['DELETE', `/comments/${comment.id}`, undefined],
    ] as const) {
      await expectError(await request(path, { method, body }), 401);
      await expectError(await request(path, { method, body, cookie, header: false }), 403);
      await expectError(await request(path, { method, body, cookie: 'connect.sid=invalid' }), 401);
    }
    for (const field of ['author', 'authorId', 'userId']) {
      await expectError(await request(`/reviews/${review.id}/comments`, {
        method: 'POST', cookie, body: { text: 'Suplantación', [field]: 1 },
      }), 400);
    }
  });
  test('valida IDs, JSON, texto, tipos y campos inmutables por HTTP', async () => {
    const { user, cookie } = await newUser();
    const review = await newReview(user.id);
    const comment = await createComment(cookie, review.id);
    const createPath = `/reviews/${review.id}/comments`;
    const editPath = `/comments/${comment.id}`;
    for (const body of [null, [], true, 1, 'texto', {}, { text: '' }, { text: ' \n\t ' },
      { text: 1 }, { text: 'a\0b' }, { text: 'a'.repeat(2001) }, { text: 'ok', extra: 1 },
      { text: 'ok', reviewId: review.id }, { text: 'ok', deletedAt: '2020-01-01' }]) {
      await expectError(await request(createPath, { method: 'POST', cookie, body }), 400);
      await expectError(await request(editPath, { method: 'PATCH', cookie, body }), 400);
    }
    for (const parentId of [null, '1', 0, -1, 1.5, 2147483648, [], {}]) {
      await expectError(await request(createPath, { method: 'POST', cookie, body: { text: 'ok', parentId } }), 400);
    }
    for (const field of ['parentId', 'authorId', 'createdAt', 'editedAt']) {
      await expectError(await request(editPath, { method: 'PATCH', cookie, body: { text: 'ok', [field]: comment.id } }), 400);
    }
    for (const [method, path] of [['POST', createPath], ['PATCH', editPath], ['DELETE', editPath]]) {
      await expectError(await request(path!, { method: method!, cookie, raw: '{' }), 400);
      await expectError(await request(path!, { method: method!, cookie, raw: '{}', contentType: 'text/plain' }), 400);
    }
    await expectError(await request(createPath, { method: 'POST', cookie }), 400);
    await expectError(await request(editPath, { method: 'DELETE', cookie, body: { parentId: comment.id } }), 400);
    for (const id of ['0', '-1', '01', '1.5', '1e2', '2147483648', 'invalid']) {
      for (const path of [`/reviews/${id}/comments`, `/comments/${id}`, `/comments/${id}/replies`]) {
        await expectError(await request(path), 400);
      }
      await expectError(await request(`/reviews/${id}/comments`, { method: 'POST', cookie, body: { text: 'ok' } }), 400);
      await expectError(await request(`/comments/${id}`, { method: 'PATCH', cookie, body: { text: 'ok' } }), 400);
      await expectError(await request(`/comments/${id}`, { method: 'DELETE', cookie }), 400);
    }
    const unicode = await createComment(cookie, review.id, undefined, ` ${'🎵'.repeat(2000)} `);
    assert.equal(Array.from(unicode.text).length, 2000);
  });

  test('solo autor edita; ADMIN ajeno recibe 403 y puede borrar ese mismo comentario', async () => {
    const owner = await newUser();
    const other = await newUser();
    const moderator = await newUser('ADMIN');
    const review = await newReview(other.user.id);
    const comment = await createComment(owner.cookie, review.id);
    const path = `/comments/${comment.id}`;
    for (const cookie of [other.cookie, moderator.cookie]) {
      await expectError(await request(path, { method: 'PATCH', cookie, body: { text: 'Intruso' } }), 403);
    }
    // Ser autor de la reseña tampoco otorga permiso de borrar un comentario ajeno.
    await expectError(await request(path, { method: 'DELETE', cookie: other.cookie }), 403);
    assert.equal((await persisted(comment.id)).text, comment.text);
    assert.equal((await persisted(comment.id)).editedAt, null);
    const edit = await request(path, { method: 'PATCH', cookie: owner.cookie, body: { text: ' Editado ' } });
    assert.equal(edit.status, 200);
    const updated = (await edit.json()).data as PublicComment;
    assert.equal(updated.text, 'Editado');
    assert.ok(updated.editedAt);
    assert.equal(updated.createdAt, comment.createdAt);
    assert.equal(updated.parentId, null);
    assert.deepEqual(updated.author, comment.author);
    await database().em.fork().nativeUpdate(Comment, { id: comment.id }, { createdAt: new Date('2020-01-01') });
    assert.equal((await request(path, { method: 'DELETE', cookie: moderator.cookie })).status, 204);
    assert.ok((await persisted(comment.id)).deletedAt);

    const ownAdminComment = await createComment(moderator.cookie, review.id);
    assert.equal((await request(`/comments/${ownAdminComment.id}`, {
      method: 'PATCH', cookie: moderator.cookie, body: { text: 'Soy el autor' },
    })).status, 200);
  });

  test('24 horas exactas: ediciones reiteradas conservan createdAt y no amplían el plazo', async () => {
    const owner = await newUser();
    const review = await newReview(owner.user.id);
    const comment = await createComment(owner.cookie, review.id);
    const createdAt = new Date('2026-01-01T00:00:00Z');
    await database().em.fork().nativeUpdate(Comment, { id: comment.id }, { createdAt });
    const deadline = createdAt.getTime() + COMMENT_EDIT_WINDOW_MS;
    let now = new Date(deadline - 1000);
    const repository = new CommentRepository(() => now);
    const actor = { id: owner.user.id, category: 'USER' };
    await inContext(() => repository.updateText(comment.id, 'Primera edición', actor));
    now = new Date(deadline - 1);
    await inContext(() => repository.updateText(comment.id, 'Última edición válida', actor));
    now = new Date(deadline);
    for (const category of ['USER', 'ADMIN']) {
      await assert.rejects(inContext(() => repository.updateText(comment.id, 'Fuera de plazo', { ...actor, category })),
        (error: unknown) => error instanceof AppError && error.statusCode === 403);
    }
    const stored = await persisted(comment.id);
    assert.equal(stored.createdAt.getTime(), createdAt.getTime());
    assert.equal(stored.editedAt?.getTime(), deadline - 1);
    assert.equal(stored.text, 'Última edición válida');
    await expectError(await request(`/comments/${comment.id}`, {
      method: 'PATCH', cookie: owner.cookie, body: { text: 'Fuera de plazo' },
    }), 403);
    assert.equal((await request(`/comments/${comment.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
  });

  test('baja atómica del subárbol con autores distintos conserva hermanos y ancestros', async () => {
    const owner = await newUser();
    const other = await newUser();
    const review = await newReview(owner.user.id);
    const root = await createComment(other.cookie, review.id);
    const target = await createComment(owner.cookie, review.id, root.id);
    const sibling = await createComment(other.cookie, review.id, root.id);
    const child = await createComment(other.cookie, review.id, target.id);
    const grandchild = await createComment(owner.cookie, review.id, child.id);
    const previouslyDeleted = await createComment(other.cookie, review.id, target.id);
    assert.equal((await request(`/comments/${previouslyDeleted.id}`, { method: 'DELETE', cookie: other.cookie })).status, 204);
    const previousDate = (await persisted(previouslyDeleted.id)).deletedAt;
    const deletion = await request(`/comments/${target.id}`, { method: 'DELETE', cookie: owner.cookie });
    assert.equal(deletion.status, 204);
    assert.equal(await deletion.text(), '');
    const deletionTime = (await persisted(target.id)).deletedAt!.getTime();
    for (const item of [target, child, grandchild]) {
      const stored = await persisted(item.id);
      assert.equal(stored.deletedAt?.getTime(), deletionTime);
      assert.equal(stored.text, item.text);
      await expectError(await request(`/comments/${item.id}`), 404);
      await expectError(await request(`/comments/${item.id}/replies`), 404);
      for (const cookie of [owner.cookie, other.cookie]) {
        await expectError(await request(`/comments/${item.id}`, { method: 'PATCH', cookie, body: { text: 'No revive' } }), 404);
        await expectError(await request(`/comments/${item.id}`, { method: 'DELETE', cookie }), 404);
      }
    }
    assert.equal((await persisted(previouslyDeleted.id)).deletedAt?.getTime(), previousDate?.getTime());
    const replies = await (await request(`/comments/${root.id}/replies`)).json();
    assert.deepEqual(replies.data, [sibling]);
    assert.equal(replies.pagination.total, 1);
    assert.equal((await request(`/comments/${root.id}`)).status, 200);
  });

  test('si falla un descendiente, toda la baja del subárbol se revierte', async () => {
    const owner = await newUser();
    const review = await newReview(owner.user.id);
    const root = await createComment(owner.cookie, review.id);
    const child = await createComment(owner.cookie, review.id, root.id);
    const em = database().em.fork();
    await em.execute(`create function fail_comment_delete_test() returns trigger language plpgsql as $$
      begin
        if new.id = ${child.id} and new.deleted_at is not null then
          raise exception 'Fallo controlado en descendiente';
        end if;
        return new;
      end $$`);
    await em.execute('create trigger fail_comment_delete before update on "comment" for each row execute function fail_comment_delete_test()');
    try {
      await expectError(await request(`/comments/${root.id}`, { method: 'DELETE', cookie: owner.cookie }), 500);
      assert.equal((await persisted(root.id)).deletedAt, null);
      assert.equal((await persisted(child.id)).deletedAt, null);
    } finally {
      await em.execute('drop trigger fail_comment_delete on "comment"');
      await em.execute('drop function fail_comment_delete_test()');
    }
  });

  test('Review borrada oculta todas las rutas de Comment e impide todas sus escrituras', async () => {
    const owner = await newUser();
    const moderator = await newUser('ADMIN');
    const review = await newReview(owner.user.id);
    const root = await createComment(owner.cookie, review.id);
    const child = await createComment(moderator.cookie, review.id, root.id);
    assert.equal((await request(`/reviews/${review.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
    await expectError(await request(`/reviews/${review.id}/comments`), 404);
    for (const cookie of [owner.cookie, moderator.cookie]) {
      for (const body of [{ text: 'Raíz' }, { text: 'Hijo', parentId: root.id }]) {
        await expectError(await request(`/reviews/${review.id}/comments`, { method: 'POST', cookie, body }), 404);
      }
      for (const item of [root, child]) {
        await expectError(await request(`/comments/${item.id}`), 404);
        await expectError(await request(`/comments/${item.id}/replies`), 404);
        await expectError(await request(`/comments/${item.id}`, { method: 'PATCH', cookie, body: { text: 'Oculto' } }), 404);
        await expectError(await request(`/comments/${item.id}`, { method: 'DELETE', cookie }), 404);
      }
    }
  });

  test('paginación ASC por fecha/ID, solo hijos directos y totales sin borrados', async () => {
    const { user, cookie } = await newUser();
    const review = await newReview(user.id);
    const roots = [];
    for (let i = 0; i < 4; i++) roots.push(await createComment(cookie, review.id));
    const parent = roots[0]!;
    const children = [];
    for (let i = 0; i < 4; i++) children.push(await createComment(cookie, review.id, parent.id));
    await createComment(cookie, review.id, children[0]!.id);
    await database().em.fork().nativeUpdate(Comment, { review: review.id }, { createdAt: new Date('2026-01-01') });
    // Mayor ID pero fecha más antigua debe aparecer primero.
    await database().em.fork().nativeUpdate(Comment, { id: roots[3]!.id }, { createdAt: new Date('2025-01-01') });
    await request(`/comments/${roots[1]!.id}`, { method: 'DELETE', cookie });
    await request(`/comments/${children[1]!.id}`, { method: 'DELETE', cookie });
    for (const [path, expected] of [
      [`/reviews/${review.id}/comments`, [roots[3]!.id, parent.id, roots[2]!.id]],
      [`/comments/${parent.id}/replies`, [children[0]!.id, children[2]!.id, children[3]!.id]],
    ] as const) {
      for (const page of [1, 2, 3]) {
        const response = await request(`${path}?page=${page}&pageSize=2`);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.deepEqual(body.data.map((item: PublicComment) => item.id), expected.slice((page - 1) * 2, page * 2));
        assert.deepEqual(body.pagination, { page, pageSize: 2, total: 3, totalPages: 2 });
        for (const item of body.data) assert.deepEqual(Object.keys(item.author).sort(), ['id', 'username']);
      }
      for (const query of ['page=0', 'pageSize=101', 'page=1&page=2', 'sort=likes', 'parentId=1']) {
        await expectError(await request(`${path}?${query}`), 400);
      }
    }
    const emptyReview = await newReview(user.id);
    const empty = await (await request(`/reviews/${emptyReview.id}/comments`)).json();
    assert.deepEqual(empty.data, []);
    assert.deepEqual(empty.pagination, { page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  for (const target of ['parent', 'ancestor', 'review'] as const) {
    for (const first of ['create', 'delete'] as const) {
      test(`carrera ${target}: ${first} primero; no quedan respuestas visibles bajo un borrado`, async () => {
        const owner = await newUser();
        const other = await newUser();
        const review = await newReview(owner.user.id);
        const root = await createComment(owner.cookie, review.id);
        const parent = target === 'ancestor' ? await createComment(other.cookie, review.id, root.id) : root;
        const blocker = new pg.Client({ ...connectionOptions, database: databaseName });
        await blocker.connect();
        try {
          await blocker.query('begin');
          await blocker.query('select id from review where id = $1 for update', [review.id]);
          const create = () => request(`/reviews/${review.id}/comments`, {
            method: 'POST', cookie: other.cookie, body: { text: 'Respuesta concurrente', parentId: parent.id },
          });
          const remove = () => request(target === 'review' ? `/reviews/${review.id}` : `/comments/${root.id}`, {
            method: 'DELETE', cookie: owner.cookie,
          });
          // Se observa el bloqueo real en PostgreSQL; no se supone un orden por timers.
          const firstRequest = first === 'create' ? create() : remove();
          await waitForBlockedWrites(1);
          const secondRequest = first === 'create' ? remove() : create();
          await waitForBlockedWrites(2);
          await blocker.query('commit');
          const responses = await Promise.all([firstRequest, secondRequest]);
          const creation = responses[first === 'create' ? 0 : 1]!;
          const deletion = responses[first === 'delete' ? 0 : 1]!;
          assert.equal(deletion.status, 204, await deletion.clone().text());
          if (first === 'create') {
            assert.equal(creation.status, 201, await creation.clone().text());
            const child = (await creation.json()).data as PublicComment;
            await expectError(await request(`/comments/${child.id}`), 404);
            if (target !== 'review') assert.ok((await persisted(child.id)).deletedAt);
          } else {
            await expectError(creation, 404);
          }
          await expectError(await request(`/comments/${parent.id}/replies`), 404);
          assert.equal(await database().em.fork().count(Comment, {
            review: { id: review.id, deletedAt: null }, parent: parent.id, deletedAt: null,
          }), 0);
        } finally {
          await blocker.query('rollback');
          await blocker.end();
        }
      });
    }
  }

  test('dos bajas concurrentes: una sola gana y editar no revive un subárbol borrado', async () => {
    const owner = await newUser();
    const review = await newReview(owner.user.id);
    const root = await createComment(owner.cookie, review.id);
    const child = await createComment(owner.cookie, review.id, root.id);
    const results = await Promise.all([
      request(`/comments/${root.id}`, { method: 'DELETE', cookie: owner.cookie }),
      request(`/comments/${root.id}`, { method: 'DELETE', cookie: owner.cookie }),
      request(`/comments/${child.id}`, { method: 'PATCH', cookie: owner.cookie, body: { text: 'En carrera' } }),
    ]);
    assert.deepEqual(results.slice(0, 2).map(response => response.status).sort(), [204, 404]);
    assert.ok([200, 404].includes(results[2]!.status));
    assert.ok((await persisted(child.id)).deletedAt);
    await expectError(await request(`/comments/${child.id}`), 404);
  });

  test('migración coincide con Comment, conserva Review y tiene índices para hijos y subárboles', async () => {
    const em = database().em.fork();
    const indexes = await em.execute<Array<{ indexname: string; indexdef: string }>>(
      "select indexname, indexdef from pg_indexes where tablename = 'comment'",
    );
    assert.match(indexes.find(index => index.indexname === 'comment_visible_children_idx')!.indexdef,
      /review_id, parent_id, created_at, id\) WHERE \(deleted_at IS NULL\)/);
    assert.match(indexes.find(index => index.indexname === 'comment_parent_idx')!.indexdef, /\(parent_id\)/);
    assert.doesNotMatch(indexes.find(index => index.indexname === 'comment_parent_idx')!.indexdef, /WHERE/);
    const schemaDiff = await database().schema.getUpdateSchemaSQL({ wrap: false });
    assert.deepEqual(schemaDiff.split(';').filter(sql => /\bcomment\b/.test(sql)), [],
      'No debe haber diferencias de esquema de Comment; Review tiene una diferencia previa de rating');

    const sample = await em.findOneOrFail(Comment, { id: { $gt: 0 } });
    for (const text of ['', 'a'.repeat(2001)]) {
      await assert.rejects(em.execute('insert into "comment" (author_id, review_id, text) values (?, ?, ?)',
        [sample.author.id, sample.review.id, text]),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === '23514');
    }
    const users = await em.count(User);
    const reviews = await em.count(Review);
    const reviewOid = await em.execute("select 'review'::regclass::oid as oid");
    await database().migrator.down({ migrations: [migrationName] });
    assert.equal((await em.execute<Array<{ name: string | null }>>("select to_regclass('comment') as name"))[0]?.name, null);
    assert.equal(await em.count(User), users);
    assert.equal(await em.count(Review), reviews);
    await database().migrator.up({ migrations: [migrationName] });
    assert.equal(await em.count(Comment), 0);
    assert.deepEqual(await em.execute("select 'review'::regclass::oid as oid"), reviewOid);
  });
});
