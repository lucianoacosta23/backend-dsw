import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AppError } from '../src/shared/errors/app-error.js';
import {
  assertCanEditReview,
  assertCanManageReview,
  REVIEW_EDIT_WINDOW_MS,
} from '../src/modules/reviews/review.rules.js';
import {
  parseCreateReview,
  parseEditReview,
  parseReviewId,
  parseReviewList,
  parseReviewRating,
  parseReviewText,
} from '../src/modules/reviews/review.validation.js';

const badRequest = (error: unknown) => error instanceof AppError && error.statusCode === 400;
const forbidden = (error: unknown) => error instanceof AppError && error.statusCode === 403;

test('rating acepta exactamente los nueve valores de la escala, como números JSON', () => {
  for (const rating of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
    assert.equal(parseReviewRating(rating), rating);
  }
  for (const rating of [undefined, null, true, '1.5', '1,5', [], {}, 0, 0.5, 5.5, -1, 1.49, 1.51, 2.25, NaN, Infinity, -Infinity]) {
    assert.throws(() => parseReviewRating(rating), badRequest, String(rating));
  }
});

test('texto obligatorio, trim y longitud Unicode de 1 a 2000 caracteres', () => {
  assert.equal(parseReviewText(' \n buena reseña \t '), 'buena reseña');
  assert.equal(parseReviewText(` ${'🎵'.repeat(2000)} `), '🎵'.repeat(2000));
  for (const text of ['', ' \t\n ', null, undefined, 1, {}, [], 'a\0b', 'a'.repeat(2001), '🎵'.repeat(2001)]) {
    assert.throws(() => parseReviewText(text), badRequest);
  }
});

test('create y patch rechazan suplantación, campos extra y cambios del puntaje', () => {
  const valid = { releaseId: 1, text: ' texto ', rating: 3.5 };
  assert.deepEqual(parseCreateReview(valid), { ...valid, text: 'texto' });
  for (const field of ['author', 'authorId', 'userId', 'id', 'createdAt', 'editedAt', 'deletedAt', 'likes']) {
    assert.throws(() => parseCreateReview({ ...valid, [field]: 1 }), badRequest);
    assert.throws(() => parseEditReview({ text: 'nuevo', [field]: 1 }), badRequest);
  }
  for (const body of [undefined, null, [], 'text', 1, {}, { text: 'ok', rating: 5 }, { text: 'ok', releaseId: 1 }]) {
    assert.throws(() => parseEditReview(body), badRequest);
  }
  for (const releaseId of ['1', 0, -1, 1.5, 2147483648, NaN, null, true]) {
    assert.throws(() => parseCreateReview({ ...valid, releaseId }), badRequest);
  }
});

test('IDs y paginación rechazan valores ambiguos, repetidos o fuera de rango', () => {
  assert.equal(parseReviewId('2147483647'), 2147483647);
  for (const id of ['0', '-1', '01', '1.0', '1e2', '1x', ' 1', '2147483648', ['1', '2'], {}, undefined]) {
    assert.throws(() => parseReviewId(id), badRequest);
  }
  assert.deepEqual(parseReviewList({ releaseId: '1' }), { releaseId: 1, page: 1, pageSize: 20 });
  assert.deepEqual(parseReviewList({ authorId: '2', releaseId: '1', page: '2', pageSize: '100' }), {
    authorId: 2, releaseId: 1, page: 2, pageSize: 100,
  });
  for (const query of [{}, { releaseId: ['1', '2'] }, { authorId: '1', sort: 'likes' },
    { authorId: '1', pageSize: '101' }, { authorId: '1', page: '0' },
    { authorId: '1', page: '2147483647', pageSize: '100' }]) {
    assert.throws(() => parseReviewList(query), badRequest);
  }
});

test('el autor, sea USER o ADMIN, edita solo antes de 24 horas; el límite es exclusivo', () => {
  const review = { author: { id: 7 }, createdAt: new Date('2026-09-20T12:00:00Z'), deletedAt: null };
  const deadline = review.createdAt.getTime() + REVIEW_EDIT_WINDOW_MS;
  for (const actor of [{ id: 7, category: 'USER' }, { id: 7, category: 'ADMIN' }]) {
    assert.doesNotThrow(() => assertCanEditReview(review, actor, new Date(deadline - 1)));
    assert.throws(() => assertCanEditReview(review, actor, new Date(deadline)), forbidden);
    assert.throws(() => assertCanEditReview(review, actor, new Date(deadline + 1)), forbidden);
  }
  assert.throws(() => assertCanEditReview(review, { id: 8, category: 'USER' }, review.createdAt), forbidden);
});

test('ADMIN distinto del autor no puede editar una reseña reciente, pero sí borrarla', () => {
  const review = { author: { id: 7 }, createdAt: new Date('2026-09-20T12:00:00Z'), deletedAt: null };
  const administrator = { id: 99, category: 'ADMIN' };
  assert.throws(() => assertCanEditReview(review, administrator, review.createdAt), forbidden);
  assert.doesNotThrow(() => assertCanManageReview(review, administrator));
});

test('borrado permitido al autor o ADMIN sin plazo; borradas siempre son 404', () => {
  const review = { author: { id: 7 }, createdAt: new Date('2020-01-01'), deletedAt: null };
  for (const actor of [{ id: 7, category: 'USER' }, { id: 8, category: 'ADMIN' }]) {
    assert.doesNotThrow(() => assertCanManageReview(review, actor));
    const deleted = { ...review, deletedAt: new Date() };
    const notFound = (error: unknown) => error instanceof AppError && error.statusCode === 404;
    assert.throws(() => assertCanManageReview(deleted, actor), notFound);
    assert.throws(() => assertCanEditReview(deleted, actor, review.createdAt), notFound);
  }
  assert.throws(() => assertCanManageReview(review, { id: 8, category: 'USER' }), forbidden);
});
