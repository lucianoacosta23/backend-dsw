import type { Request, Response, NextFunction } from 'express';
import { UserRepository } from './user.repository.js';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { AppError } from '../../shared/errors/app-error.js';
import type { UpdateUserInput } from './user.repository.js';
import type { User } from './user.entity.js';
const userRepository = new UserRepository();

export async function findAll(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const users = await userRepository.findAll();

    res.status(200).json({
      message: 'Listado de usuarios',
      data: users.map(userResponse),
    });
  } catch (error) {
    next(error);
  }
}
export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body: unknown = req.body;

    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body)
    ) {
      throw new AppError('El cuerpo debe ser un objeto JSON', 400);
    }

    const { username, fullName, email, spotifyId } =
      body as Record<string, unknown>;

    if (
      typeof username !== 'string' ||
      typeof fullName !== 'string' ||
      typeof email !== 'string' ||
      typeof spotifyId !== 'string'
    ) {
      throw new AppError(
        'username, fullName, email y spotifyId deben ser textos',
        400,
      );
    }

    const data = {
      username: username.trim(),
      fullName: fullName.trim(),
      email: email.trim(),
      spotifyId: spotifyId.trim(),
    };

    if (Object.values(data).some(value => value.length === 0)) {
      throw new AppError('Los campos no pueden estar vacíos', 400);
    }

    if (Object.values(data).some(value => value.length > 255)) {
      throw new AppError(
        'Los campos no pueden superar los 255 caracteres',
        400,
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new AppError('El email no tiene un formato válido', 400);
    }

    const user = await userRepository.create(data);

    res.status(201).json({
      message: 'Usuario creado',
      data: user,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintViolationException) {
      next(new AppError('Ya existe un usuario con ese Spotify ID', 409));
      return;
    }

    next(error);
  }
}
export async function findById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;

    if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
      throw new AppError('El ID debe ser un entero positivo', 400);
    }

    const id = Number(rawId);

    if (!Number.isSafeInteger(id) || id > 2147483647) {
      throw new AppError('El ID está fuera del rango permitido', 400);
    }

    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    res.status(200).json({
      message: 'Usuario encontrado',
      data: userResponse(user),
    });
  } catch (error) {
    next(error);
  }
}
export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;

    if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
      throw new AppError('El ID debe ser un entero positivo', 400);
    }

    const id = Number(rawId);

    if (!Number.isSafeInteger(id) || id > 2147483647) {
      throw new AppError('El ID está fuera del rango permitido', 400);
    }

    const body: unknown = req.body;

    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body)
    ) {
      throw new AppError('El cuerpo debe ser un objeto JSON', 400);
    }

    const fields = body as Record<string, unknown>;
    const allowedFields = ['username', 'fullName', 'email'];

    if (Object.keys(fields).length === 0) {
      throw new AppError('Enviá al menos un campo para actualizar', 400);
    }

    if (Object.keys(fields).some(key => !allowedFields.includes(key))) {
      throw new AppError(
        'Solo se pueden modificar username, fullName y email',
        400,
      );
    }

    const data: UpdateUserInput = {};

    for (const field of ['username', 'fullName', 'email'] as const) {
      if (!Object.hasOwn(fields, field)) {
        continue;
      }

      const value = fields[field];

      if (typeof value !== 'string') {
        throw new AppError(`${field} debe ser un texto`, 400);
      }

      const trimmedValue = value.trim();

      if (trimmedValue.length === 0 || trimmedValue.length > 255) {
        throw new AppError(
          `${field} debe tener entre 1 y 255 caracteres`,
          400,
        );
      }

      data[field] =
  field === 'email' ? trimmedValue.toLowerCase() : trimmedValue;
    }

    if (
      data.email !== undefined &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    ) {
      throw new AppError('El email no tiene un formato válido', 400);
    }

    const user = await userRepository.update(id, data);

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    res.status(200).json({
      message: 'Usuario actualizado',
      data: userResponse(user),
    });
    } catch (error) {
    if (error instanceof UniqueConstraintViolationException) {
      next(new AppError('Ya existe un usuario con esos datos', 409));
      return;
    }

    next(error);
  }
}
export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;

    if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
      throw new AppError('El ID debe ser un entero positivo', 400);
    }

    const id = Number(rawId);

    if (!Number.isSafeInteger(id) || id > 2147483647) {
      throw new AppError('El ID está fuera del rango permitido', 400);
    }

    const deleted = await userRepository.delete(id);

    if (!deleted) {
      throw new AppError('Usuario no encontrado', 404);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}function userResponse(user: User) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    category: user.category,
    createdAt: user.createdAt,
  };
}