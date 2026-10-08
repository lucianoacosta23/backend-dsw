import { LockMode, type EntityManager } from '@mikro-orm/core';
import sharp from 'sharp';
import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { ImagePurpose, ProfileImage } from './profile-image.entity.js';
import { LocalImageStorage, type ImageStorage } from './image.storage.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;

function isAnimatedPng(input: Buffer): boolean {
  if (!input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  // libvips puede leer solo el primer frame de APNG: comprobar acTL explícitamente.
  for (let offset = 8; offset + 12 <= input.length;) {
    const length = input.readUInt32BE(offset);
    if (length > input.length - offset - 12) break;
    const type = input.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    if (type === 'IEND') break;
    offset += length + 12;
  }
  return false;
}

export async function processImage(input: Buffer, purpose: ImagePurpose) {
  if (input.length > MAX_IMAGE_BYTES) throw new AppError('La imagen supera los 5 MiB', 413);
  try {
    // metadata no decodifica los píxeles; el segundo lector impone el límite al decodificar.
    const metadata = await sharp(input, { limitInputPixels: false }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1 || isAnimatedPng(input)) {
      throw new AppError('Solo se permiten JPEG, PNG y WebP estáticos', 415);
    }
    if ((metadata.width ?? 0) * (metadata.height ?? 0) > MAX_IMAGE_PIXELS) {
      throw new AppError('La imagen supera los 20 millones de píxeles', 413);
    }
    const [width, height] = purpose === ImagePurpose.AVATAR ? [512, 512] : [1920, 1080];
    return await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' })
      .rotate().resize({ width: width!, height: height!, fit: 'inside', withoutEnlargement: true })
      .webp().toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('La imagen no contiene un formato válido', 415);
  }
}

export class ImageService {
  constructor(private readonly em: EntityManager, private readonly storage: ImageStorage = new LocalImageStorage()) {}

  async upload(ownerId: number, purpose: ImagePurpose, input: Buffer) {
    const processed = await processImage(input, purpose);
    const key = await this.storage.save(processed.data);
    try {
      const image = await this.em.transactional(async tx => {
        const owner = await tx.findOne(User, ownerId, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
        if (!owner) throw new AppError('La sesión ya no es válida', 401);
        const image = new ProfileImage();
        Object.assign(image, { owner, purpose, key, width: processed.info.width, height: processed.info.height });
        await tx.persistAndFlush(image);
        return image;
      });
      return { imageId: image.id, url: this.storage.url(key), purpose };
    } catch (error) {
      await this.storage.delete(key).catch(cleanupError => console.error('No se pudo limpiar la subida fallida', cleanupError));
      throw error;
    }
  }

  async cleanup(id: number, olderThan?: Date): Promise<boolean> {
    // Usar otro identity map: la transacción que reemplazó la imagen ya terminó.
    return this.em.fork().transactional(async tx => {
      const candidate = await tx.findOne(ProfileImage, id);
      if (!candidate) return false;
      if (candidate.owner?.id) {
        await tx.findOne(User, candidate.owner.id, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      }
      const image = await tx.findOne(ProfileImage, id, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      if (!image || (olderThan && image.createdAt >= olderThan)) return false;
      if (await tx.count(User, { $or: [{ avatarImage: id }, { coverImage: id }] })) return false;
      // Mientras se elimina el archivo se mantiene el mismo bloqueo que usa la asignación.
      await this.storage.delete(image.key);
      await tx.removeAndFlush(image);
      return true;
    });
  }

  async cleanupSafely(ids: number[]): Promise<void> {
    for (const id of new Set(ids)) {
      try { await this.cleanup(id); }
      catch (error) { console.error('Limpieza de imagen pendiente; ejecutar images:prune para reintentar', { id, error }); }
    }
  }

  async prune(now = new Date()): Promise<number> {
    const olderThan = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let cursor = 0;
    let removed = 0;
    for (;;) {
      const batch = await this.em.fork().find(ProfileImage, { id: { $gt: cursor }, createdAt: { $lt: olderThan } }, { orderBy: { id: 'ASC' }, limit: 100 });
      if (!batch.length) return removed;
      for (const image of batch) {
        cursor = image.id!;
        if (await this.cleanup(cursor, olderThan)) removed++;
      }
    }
  }
}
