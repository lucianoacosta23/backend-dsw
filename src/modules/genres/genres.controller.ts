import type { Request, Response, NextFunction } from 'express';
import { UniqueConstraintViolationException } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { GenreRepository } from './genres.repository.js';
import type { GenreInput } from './genres.repository.js';

const genreRepository = new GenreRepository();

function parseId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new AppError('El ID debe ser un entero positivo', 400);
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id > 2147483647) {
    throw new AppError('El ID está fuera del rango permitido', 400);
  }

  return id;
}

function validateBody(body: unknown): GenreInput {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  }

  const fields = body as Record<string, unknown>;

  if (Object.keys(fields).some(key => key !== 'name')) {
    throw new AppError('Solo se permite el campo name', 400);
  }

  if (typeof fields.name !== 'string') {
    throw new AppError('name es obligatorio y debe ser un texto', 400);
  }

  const name = fields.name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (name.length === 0 || name.length > 255) {
    throw new AppError(
      'name debe tener entre 1 y 255 caracteres',
      400,
    );
  }

  return { name };
}

function handleError(error: unknown, next: NextFunction): void {
  if (error instanceof UniqueConstraintViolationException) {
    next(new AppError('Ya existe un género con ese nombre', 409));
    return;
  }

  next(error);
}

export async function findAll(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const genres = await genreRepository.findAll();

    res.status(200).json({
      message: 'Listado de géneros',
      data: genres,
    });
  } catch (error) {
    next(error);
  }
}

export async function findById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const genre = await genreRepository.findById(id);

    if (!genre) {
      throw new AppError('Género no encontrado', 404);
    }

    res.status(200).json({
      message: 'Género encontrado',
      data: genre,
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
    const data = validateBody(req.body);
    const genre = await genreRepository.create(data);

    res.status(201).json({
      message: 'Género creado',
      data: genre,
    });
  } catch (error) {
    handleError(error, next);
  }
}

export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const data = validateBody(req.body);

    const genre = await genreRepository.update(id, data);

    if (!genre) {
      throw new AppError('Género no encontrado', 404);
    }

    res.status(200).json({
      message: 'Género actualizado',
      data: genre,
    });
  } catch (error) {
    handleError(error, next);
  }
}

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const deleted = await genreRepository.delete(id);

    if (!deleted) {
      throw new AppError('Género no encontrado', 404);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}