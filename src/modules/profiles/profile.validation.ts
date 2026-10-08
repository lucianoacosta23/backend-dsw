import { AppError } from '../../shared/errors/app-error.js';

export interface ProfilePatch {
  avatarImageId?: number | null;
  coverImageId?: number | null;
  favoriteReleaseIds?: number[];
  favoriteTrackIds?: number[];
}
export function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}
export function routeId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !isId(Number(value))) {
    throw new AppError('El ID debe ser un entero positivo válido', 400);
  }
  return Number(value);
}
export function parseProfilePatch(body: unknown): ProfilePatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  const entries = Object.entries(body);
  if (!entries.length) throw new AppError('Debe enviar al menos un campo', 400);
  for (const [key, value] of entries) {
    if (key === 'avatarImageId' || key === 'coverImageId') {
      if (value !== null && !isId(value)) throw new AppError(`${key} debe ser un ID válido o null`, 400);
    } else if (key === 'favoriteReleaseIds' || key === 'favoriteTrackIds') {
      if (!Array.isArray(value) || value.length > 5 || !value.every(isId) || new Set(value).size !== value.length) {
        throw new AppError(`${key} debe contener hasta cinco IDs válidos sin duplicados`, 400);
      }
    } else throw new AppError('El cuerpo contiene campos no permitidos', 400);
  }
  return body as ProfilePatch;
}
