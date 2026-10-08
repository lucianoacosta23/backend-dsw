import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { parseProfilePatch, routeId } from '../src/modules/profiles/profile.validation.js';
import { processImage, MAX_IMAGE_BYTES } from '../src/modules/profiles/image.service.js';
import { ImagePurpose } from '../src/modules/profiles/profile-image.entity.js';
import { AppError } from '../src/shared/errors/app-error.js';
import { LocalImageStorage } from '../src/modules/profiles/image.storage.js';

test('perfil: campos permitidos, IDs, cinco favoritos y semántica de null/omitido', () => {
  const valid = { avatarImageId: null, favoriteReleaseIds: [5, 4, 3, 2, 1], favoriteTrackIds: [] };
  assert.deepEqual(parseProfilePatch(valid), valid);
  assert.equal(parseProfilePatch({ coverImageId: 1 }).avatarImageId, undefined);
  for (const body of [null, [], {}, 'x', { userId: 1 }, { category: 'ADMIN' },
    { avatarImageId: 0 }, { coverImageId: '1' }, { avatarImageId: 2147483648 },
    { favoriteReleaseIds: [1, 1] }, { favoriteTrackIds: [1, 2, 3, 4, 5, 6] },
    { favoriteTrackIds: [1.5] }, { favoriteTrackIds: [NaN] }, { favoriteReleaseIds: null }]) {
    assert.throws(() => parseProfilePatch(body), AppError);
  }
  for (const value of ['0', '-1', '01', '1.2', '2147483648', ['1']]) assert.throws(() => routeId(value), AppError);
});

test('imagen: decodifica, orienta, reduce, quita EXIF y no amplía', async () => {
  const jpeg = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#ff0000' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await processImage(jpeg, ImagePurpose.AVATAR);
  assert.equal(result.info.format, 'webp');
  assert.equal(result.info.width, 256);
  assert.equal(result.info.height, 512);
  const metadata = await sharp(result.data).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  const small = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'blue' } }).png().toBuffer();
  const cover = await processImage(small, ImagePurpose.COVER);
  assert.equal(cover.info.width, 20);
  assert.equal(cover.info.height, 10);
  const largeCover = await processImage(jpeg, ImagePurpose.COVER);
  assert.ok(largeCover.info.width <= 1920 && largeCover.info.height <= 1080);
});

test('imagen: límites, contenido inválido, SVG, GIF y WebP animado', async () => {
  const errorStatus = (status: number) => (error: unknown) => error instanceof AppError && error.statusCode === status;
  for (const input of [Buffer.from('no es una imagen'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'),
    Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')]) {
    await assert.rejects(processImage(input, ImagePurpose.AVATAR), errorStatus(415));
  }
  await assert.rejects(processImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), ImagePurpose.AVATAR), errorStatus(413));
  const tooManyPixels = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: 'white' } }).png().toBuffer();
  await assert.rejects(processImage(tooManyPixels, ImagePurpose.AVATAR), errorStatus(413));
  const frames = Buffer.alloc(4 * 4 * 3);
  frames.fill(255, 24);
  const animated = await sharp(frames, { raw: { width: 4, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(processImage(animated, ImagePurpose.AVATAR), errorStatus(415));
  // Añadir acTL válido a un PNG: algunos decodificadores ignoran esta extensión.
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const animationChunk = Buffer.alloc(20);
  animationChunk.writeUInt32BE(8, 0);
  animationChunk.write('acTL', 4, 'ascii');
  animationChunk.writeUInt32BE(2, 8);
  let crc = 0xffffffff;
  for (const byte of animationChunk.subarray(4, 16)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  animationChunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 16);
  const apng = Buffer.concat([png.subarray(0, 33), animationChunk, png.subarray(33)]);
  await assert.rejects(processImage(apng, ImagePurpose.AVATAR), errorStatus(415));
});

test('storage: URL configurada, claves generadas y rechazo de rutas arbitrarias', () => {
  const previous = process.env.PUBLIC_BASE_URL;
  const key = '12345678-abcd-abcd-abcd-123456789abc.webp';
  try {
    delete process.env.PUBLIC_BASE_URL;
    assert.equal(new LocalImageStorage().url(key), `/media/${key}`);
    process.env.PUBLIC_BASE_URL = 'https://backend.example.test/';
    assert.equal(new LocalImageStorage().url(key), `https://backend.example.test/media/${key}`);
    assert.throws(() => new LocalImageStorage().url('../.env'));
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous;
  }
});
