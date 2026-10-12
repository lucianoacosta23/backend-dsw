import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReviewList } from '../src/modules/reviews/review.validation.js';
import { AppError } from '../src/shared/errors/app-error.js';

test('acepta los tres órdenes manteniendo el destino y la paginación', () => {
  for (const sort of ['popular', 'newest', 'oldest']) {
    assert.deepEqual(parseReviewList({ trackId: '93', sort, page: '2', pageSize: '10' }), {
      trackId: 93, sort, page: 2, pageSize: 10,
    });
  }
});

test('conserva newest como orden por defecto para clientes existentes', () => {
  assert.equal(parseReviewList({ releaseId: '1' }).sort, 'newest');
  assert.equal(parseReviewList({ authorId: '6', sort: 'oldest' }).authorId, 6);
});

test('rechaza órdenes desconocidos, múltiples valores y fragmentos SQL', () => {
  for (const sort of ['invalid', 'oldest; DROP TABLE review', ['newest', 'oldest'], {}, '']) {
    assert.throws(() => parseReviewList({ releaseId: '1', sort }), AppError);
  }
});
