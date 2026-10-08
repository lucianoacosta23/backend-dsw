import type { RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { PlaylistLibraryRepository } from '../playlist/playlist-library.repository.js';
import { readPagination } from '../playlist/playlist-library.controller.js';
import { profileEntityManager, ProfileRepository } from './profile.repository.js';
import { parseProfilePatch, routeId } from './profile.validation.js';
import { UserRepository } from '../users/user.repository.js';

const users = new UserRepository();

const profiles = new ProfileRepository();
export const readProfile: RequestHandler = async (req, res, next) => {
  try {
    let selector: { id: number } | { username: string };
    if (req.path === '/search') {
      const value = req.query.username;
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 255 || value.includes('\0')) {
        throw new AppError('username debe ser un texto válido de hasta 255 caracteres', 400);
      }
      const user = await users.findByUsername(value.trim());

if (!user || user.id === undefined) {
  throw new AppError('Usuario no encontrado', 404);
}

selector = { id: user.id };
    } else selector = { id: req.path === '/me' ? res.locals.authUser.id : routeId(req.params.id) };
    res.json({ message: 'Perfil del usuario', data: await profiles.read(selector, res.locals.authUser?.id ?? null) });
  } catch (error) { next(error); }
};
export const updateProfile: RequestHandler = async (req, res, next) => {
  try {
    const input = parseProfilePatch(req.body);
    res.json({ message: 'Perfil del usuario', data: await profiles.update(res.locals.authUser.id, input) });
  } catch (error) { next(error); }
};
export const listAuthorPlaylists: RequestHandler = async (req, res, next) => {
  try {
    const id = routeId(req.params.id);
    const input = readPagination(req);
    if (!await profileEntityManager().findOne(User, id)) throw new AppError('Usuario no encontrado', 404);
    const result = await new PlaylistLibraryRepository().list('author', res.locals.authUser?.id ?? null, input, id);
    res.json({ message: 'Listado de playlists', data: result.items,
      pagination: { ...input, total: result.total, totalPages: Math.ceil(result.total / input.pageSize) } });
  } catch (error) { next(error); }
};
