import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { routeId } from '../profiles/profile.validation.js';
import { AdminUserRepository, type AdminPagination } from './admin-user.repository.js';
import { parseSanction } from './user-sanction.validation.js';

const repository = new AdminUserRepository();

function pageNumber(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new AppError('La paginación debe contener enteros positivos dentro del rango permitido', 400);
  }
  return Number(value);
}

function pagination(req: Request, extra: string[] = []): AdminPagination {
  if (Object.keys(req.query).some(key => !['page', 'pageSize', ...extra].includes(key))) {
    throw new AppError('Filtros no permitidos', 400);
  }
  const page = pageNumber(req.query.page, 1, 2147483647);
  const pageSize = pageNumber(req.query.pageSize, 10, 100);
  if ((page - 1) * pageSize > 2147483647) throw new AppError('Página fuera de rango', 400);
  return { page, pageSize };
}

function listResponse(res: Response, message: string, result: { items: unknown[]; total: number }, input: AdminPagination) {
  res.json({ message, data: result.items, pagination: { ...input, total: result.total, totalPages: Math.ceil(result.total / input.pageSize) } });
}

export const listAdminUsers: RequestHandler = async (req, res, next) => {
  try {
    const input = pagination(req, ['q', 'sort']);
    if (req.query.sort !== undefined && req.query.sort !== 'priority') throw new AppError('sort debe ser priority', 400);
    if (req.query.q !== undefined && (typeof req.query.q !== 'string' || req.query.q.length > 255 || req.query.q.includes('\0'))) {
      throw new AppError('q debe ser un texto de hasta 255 caracteres sin NUL', 400);
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    listResponse(res, 'Listado de usuarios', await repository.list({ ...input, q }), input);
  } catch (error) { next(error); }
};
export const getAdminUser: RequestHandler = async (req, res, next) => {
  try { res.json({ message: 'Detalle del usuario', data: await repository.detail(routeId(req.params.id)) }); }
  catch (error) { next(error); }
};
export const listUserSanctions: RequestHandler = async (req, res, next) => {
  try {
    const input = pagination(req);
    listResponse(res, 'Historial de sanciones', await repository.sanctions(routeId(req.params.id), input), input);
  } catch (error) { next(error); }
};
export const listUserReviewReports: RequestHandler = async (req, res, next) => {
  try {
    const input = pagination(req);
    listResponse(res, 'Reportes de reseñas del usuario', await repository.reviewReports(routeId(req.params.id), input), input);
  } catch (error) { next(error); }
};

// Funciones independientes de suspensión y baneo; un único endpoint compatible con el frontend.
export async function suspendUser(req: Request, res: Response) {
  const input = parseSanction(req.body);
  if (input.action !== 'SUSPEND') throw new AppError('La acción debe ser SUSPEND', 400);
  const data = await repository.applySanction(routeId(req.params.id), res.locals.authUser.id, input);
  res.status(201).json({ message: 'Usuario suspendido y contenido eliminado', data });
}
export async function banUser(req: Request, res: Response) {
  const input = parseSanction(req.body);
  if (input.action !== 'BAN') throw new AppError('La acción debe ser BAN', 400);
  const data = await repository.applySanction(routeId(req.params.id), res.locals.authUser.id, input);
  res.status(201).json({ message: 'Usuario baneado y contenido eliminado', data });
}
export const createUserSanction: RequestHandler = async (req, res, next) => {
  try {
    const input = parseSanction(req.body);
    if (input.action === 'SUSPEND') { await suspendUser(req, res); return; }
    if (input.action === 'BAN') { await banUser(req, res); return; }
    const data = await repository.applySanction(routeId(req.params.id), res.locals.authUser.id, input);
    res.status(201).json({ message: 'Usuario reactivado. El contenido eliminado no se restaura.', data });
  } catch (error) { next(error); }
};
