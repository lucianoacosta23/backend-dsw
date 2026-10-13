import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveUserStatus, SUSPENSION_DURATION_MS } from '../src/modules/users/user-status.js';
import { parseSanction } from '../src/modules/users/user-sanction.validation.js';

const now = new Date('2026-10-12T15:00:00.000Z');

test('la suspensión vence en la fecha exacta, el baneo no vence', () => {
  assert.equal(effectiveUserStatus({ status: 'SUSPENDED', suspendedUntil: now }, now), 'ENABLED');
  assert.equal(effectiveUserStatus({ status: 'SUSPENDED', suspendedUntil: new Date(now.getTime() + 1) }, now), 'SUSPENDED');
  assert.equal(effectiveUserStatus({ status: 'BANNED', suspendedUntil: null }, now), 'BANNED');
});

test('suspensión dura siete días calculados en el servidor; fecha heredada validada y baneo indefinido', () => {
  const input = { action: 'SUSPEND', reason: 'Acoso', suspendedUntil: '2026-10-20T18:00:00.000Z' };
  assert.equal(parseSanction(input, now).suspendedUntil?.getTime(), now.getTime() + SUSPENSION_DURATION_MS);
  assert.equal(parseSanction({ action: 'SUSPEND', reason: 'Acoso' }, now).suspendedUntil?.getTime(), now.getTime() + SUSPENSION_DURATION_MS);
  for (const date of ['2026-02-30T18:00:00.000Z', now.toISOString(), 'incorrecta', '2026-10-20']) {
    assert.throws(() => parseSanction({ ...input, suspendedUntil: date }, now));
  }
  assert.equal(parseSanction({ action: 'BAN', reason: 'Acoso' }, now).suspendedUntil, null);
  assert.throws(() => parseSanction({ action: 'BAN', reason: 'Acoso', suspendedUntil: null }, now));
});

test('no acepta actor del cliente, motivos vacíos, NUL ni motivos largos', () => {
  for (const reason of ['', '  ', 'a\0b', 'a'.repeat(501)]) {
    assert.throws(() => parseSanction({ action: 'BAN', reason }, now));
  }
  assert.throws(() => parseSanction({ action: 'BAN', reason: 'Motivo', administratorId: 1 }, now));
  assert.equal(parseSanction({ action: 'BAN', reason: '😀'.repeat(500) }, now).reason.length, 1000);
});
