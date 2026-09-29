import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/shared/errors/app-error.js';
import {
  assertCanDeleteComment, assertCanEditComment, COMMENT_EDIT_WINDOW_MS,
} from '../src/modules/comments/comment.rules.js';
import {
  parseCommentId, parseCommentPage, parseCommentText, parseCreateComment,
  parseEditComment, validateDeleteCommentBody,
} from '../src/modules/comments/comment.validation.js';

const status = (code: number) => (error: unknown) => error instanceof AppError && error.statusCode === code;

test('Comment: texto recortado, Unicode, límites 1/2000 y rechazo de NUL', () => {
  assert.equal(parseCommentText(' \t texto \n'), 'texto');
  assert.equal(parseCommentText('a'), 'a');
  assert.equal(parseCommentText(` ${'🎵'.repeat(2000)} `), '🎵'.repeat(2000));
  for (const value of [undefined, null, true, 1, {}, [], '', ' \n\t', 'a\0b', '🎵'.repeat(2001)]) {
    assert.throws(() => parseCommentText(value), status(400));
  }
});

test('Comment: creación acepta solo text/parentId y edición solo text', () => {
  assert.deepEqual(parseCreateComment({ text: ' raíz ' }), { text: 'raíz' });
  assert.deepEqual(parseCreateComment({ text: ' hijo ', parentId: 1 }), { text: 'hijo', parentId: 1 });
  assert.equal(parseEditComment({ text: ' editado ' }), 'editado');
  for (const value of [null, '1', 0, -1, 1.5, 2147483648, true, {}, []]) {
    assert.throws(() => parseCreateComment({ text: 'ok', parentId: value }), status(400));
  }
  for (const field of ['id', 'reviewId', 'author', 'authorId', 'createdAt', 'editedAt', 'deletedAt', 'likes']) {
    assert.throws(() => parseCreateComment({ text: 'ok', [field]: 1 }), status(400));
    assert.throws(() => parseEditComment({ text: 'ok', [field]: 1 }), status(400));
  }
  assert.throws(() => parseEditComment({ text: 'ok', parentId: 1 }), status(400));
  for (const value of [undefined, null, {}, [], 1, 'texto']) {
    assert.throws(() => parseCreateComment(value), status(400));
    assert.throws(() => parseEditComment(value), status(400));
  }
  assert.doesNotThrow(() => validateDeleteCommentBody(undefined));
  assert.doesNotThrow(() => validateDeleteCommentBody({}));
  for (const value of [null, [], { deletedAt: '2020-01-01' }]) {
    assert.throws(() => validateDeleteCommentBody(value), status(400));
  }
});

test('Comment: IDs estrictos y paginación limitada sin parámetros extra', () => {
  assert.equal(parseCommentId('2147483647'), 2147483647);
  for (const value of [undefined, null, '0', '01', '-1', '1.0', '1e2', '1x', ' 1', '2147483648', ['1', '2'], {}]) {
    assert.throws(() => parseCommentId(value), status(400));
  }
  assert.deepEqual(parseCommentPage({}), { page: 1, pageSize: 20 });
  assert.deepEqual(parseCommentPage({ page: '2', pageSize: '100' }), { page: 2, pageSize: 100 });
  for (const query of [{ page: '0' }, { pageSize: '101' }, { page: ['1', '2'] }, { sort: 'likes' },
    { parentId: '1' }, { page: '2147483647', pageSize: '100' }]) {
    assert.throws(() => parseCommentPage(query), status(400));
  }
});

test('Comment: solo autor, incluso ADMIN, puede editar hasta un ms antes de las 24 horas', () => {
  const comment = { author: { id: 7 }, createdAt: new Date('2026-01-01'), deletedAt: null };
  const deadline = comment.createdAt.getTime() + COMMENT_EDIT_WINDOW_MS;
  for (const category of ['USER', 'ADMIN']) {
    assert.doesNotThrow(() => assertCanEditComment(comment, { id: 7, category }, new Date(deadline - 1)));
    for (const now of [deadline, deadline + 1]) {
      assert.throws(() => assertCanEditComment(comment, { id: 7, category }, new Date(now)), status(403));
    }
    assert.throws(() => assertCanEditComment(comment, { id: 8, category }, comment.createdAt), status(403));
  }
});

test('Comment: autor o ADMIN borran sin plazo y comentarios borrados siempre dan 404', () => {
  const comment = { author: { id: 7 }, createdAt: new Date('2020-01-01'), deletedAt: null };
  for (const actor of [{ id: 7, category: 'USER' }, { id: 8, category: 'ADMIN' }]) {
    assert.doesNotThrow(() => assertCanDeleteComment(comment, actor));
    const deleted = { ...comment, deletedAt: new Date() };
    assert.throws(() => assertCanDeleteComment(deleted, actor), status(404));
    assert.throws(() => assertCanEditComment(deleted, actor, comment.createdAt), status(404));
  }
  assert.throws(() => assertCanDeleteComment(comment, { id: 8, category: 'USER' }), status(403));
});
