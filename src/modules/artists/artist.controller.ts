import type { Request, Response, NextFunction } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import { ArtistRepository } from './artist.repository.js';
import type { UpdateArtistInput } from './artist.repository.js';
import {
  DriverException,
  ForeignKeyConstraintViolationException,
} from '@mikro-orm/core';

const artistRepository = new ArtistRepository();

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

function validateBody(body: unknown): UpdateArtistInput {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  }

  const fields = body as Record<string, unknown>;
  const allowedFields = ['name', 'biography', 'imageUrl'];

  if (Object.keys(fields).length === 0) {
    throw new AppError('Enviá al menos un campo', 400);
  }

  if (Object.keys(fields).some(key => !allowedFields.includes(key))) {
    throw new AppError(
      'Solo se permiten name, biography e imageUrl',
      400,
    );
  }

  const data: UpdateArtistInput = {};

  if (Object.hasOwn(fields, 'name')) {
    if (typeof fields.name !== 'string') {
      throw new AppError('name debe ser un texto', 400);
    }

    const name = fields.name.trim();

    if (name.length === 0 || name.length > 255) {
      throw new AppError(
        'name debe tener entre 1 y 255 caracteres',
        400,
      );
    }

    data.name = name;
  }

  if (Object.hasOwn(fields, 'biography')) {
    const biography = fields.biography;

    if (biography !== null && typeof biography !== 'string') {
      throw new AppError('biography debe ser un texto o null', 400);
    }

    data.biography =
      biography === null ? null : biography.trim() || null;
  }

  if (Object.hasOwn(fields, 'imageUrl')) {
    const imageUrl = fields.imageUrl;

    if (imageUrl !== null && typeof imageUrl !== 'string') {
      throw new AppError('imageUrl debe ser un texto o null', 400);
    }

    const normalizedUrl =
      imageUrl === null ? null : imageUrl.trim() || null;

    if (normalizedUrl !== null) {
      let url: URL;

      try {
        url = new URL(normalizedUrl);
      } catch {
        throw new AppError('imageUrl debe ser una URL válida', 400);
      }

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new AppError('imageUrl debe usar HTTP o HTTPS', 400);
      }
    }

    data.imageUrl = normalizedUrl;
  }

  return data;
}

export async function findAll(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const artists = await artistRepository.findAll();

    res.status(200).json({
      message: 'Listado de artistas',
      data: artists,
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
    const artist = await artistRepository.findById(id);

    if (!artist) {
      throw new AppError('Artista no encontrado', 404);
    }

    res.status(200).json({
      message: 'Artista encontrado',
      data: artist,
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

    if (data.name === undefined) {
      throw new AppError('name es obligatorio', 400);
    }

    const artist = await artistRepository.create({
      ...data,
      name: data.name,
    });

    res.status(201).json({
      message: 'Artista creado',
      data: artist,
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
    const id = parseId(req.params.id);
    const data = validateBody(req.body);

    const artist = await artistRepository.update(id, data);

    if (!artist) {
      throw new AppError('Artista no encontrado', 404);
    }

    res.status(200).json({
      message: 'Artista actualizado',
      data: artist,
    });
  } catch (error) {
    next(error);
  }
}

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const deleted = await artistRepository.delete(id);

    if (!deleted) {
      throw new AppError('Artista no encontrado', 404);
    }

    res.status(204).send();
  } catch (error) {
    const isRestrictedDelete =
      error instanceof DriverException &&
      error.code === '23001';

    if (
      error instanceof ForeignKeyConstraintViolationException ||
      isRestrictedDelete
    ) {
      next(new AppError(
        'No se puede eliminar el artista porque tiene registros asociados',
        409,
      ));
      return;
    }

    next(error);
  }
}
