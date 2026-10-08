import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ImageStorage {
  save(data: Buffer): Promise<string>;
  delete(key: string): Promise<void>;
  url(key: string): string;
}
export const IMAGE_KEY = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/;
export function uploadDirectory(): string {
  return resolve(process.env.UPLOAD_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../uploads'));
}
export class LocalImageStorage implements ImageStorage {
  constructor(private readonly directory = uploadDirectory()) {}
  private path(key: string): string {
    if (!IMAGE_KEY.test(key)) throw new Error('Clave de imagen no válida');
    return resolve(this.directory, key);
  }
  async save(data: Buffer): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const key = `${randomUUID()}.webp`;
    try { await writeFile(this.path(key), data, { flag: 'wx' }); }
    catch (error) {
      await this.delete(key).catch(() => undefined);
      throw error;
    }
    return key;
  }
  async delete(key: string): Promise<void> {
    try { await unlink(this.path(key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  url(key: string): string {
    this.path(key);
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '') ?? '';
    return `${base}/media/${key}`;
  }
}
