import type { Request, Response, NextFunction } from 'express';
import { ForeignKeyConstraintViolationException } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import { TrackRepository } from './track.repository.js';
import type {
  CreateTrackInput,
  UpdateTrackInput,
} from './track.repository.js';

const trackRepository = new TrackRepository();

function validateInteger(
  value: unknown,
  field: string,
  minimum = 1,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > 2147483647
  ) {
    throw new AppError(
      `${field} debe ser un entero entre ${minimum} y 2147483647`,
      400,
    );
  }

  return value;
}

function parseId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new AppError('El ID debe ser un entero positivo', 400);
  }

  return validateInteger(Number(value), 'id');
}

function validateBody(body: unknown): UpdateTrackInput {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  }

  const fields = body as Record<string, unknown>;

  const allowedFields = [
    'name',
    'durationMs',
    'discNumber',
    'trackNumber',
    'explicit',
    'releaseId',
    'artistIds',
  ];

  if (Object.keys(fields).length === 0) {
    throw new AppError('Enviá al menos un campo', 400);
  }

  if (Object.keys(fields).some(key => !allowedFields.includes(key))) {
    throw new AppError('El cuerpo contiene campos no permitidos', 400);
  }

  const data: UpdateTrackInput = {};

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

  for (
    const field of [
      'durationMs',
      'discNumber',
      'trackNumber',
      'releaseId',
    ] as const
  ) {
    if (Object.hasOwn(fields, field)) {
      data[field] = validateInteger(fields[field], field);
    }
  }

  if (Object.hasOwn(fields, 'explicit')) {
    if (typeof fields.explicit !== 'boolean') {
      throw new AppError('explicit debe ser true o false', 400);
    }

    data.explicit = fields.explicit;
  }

  if (Object.hasOwn(fields, 'artistIds')) {
    if (!Array.isArray(fields.artistIds)) {
      throw new AppError('artistIds debe ser una lista de IDs', 400);
    }

    const artistIds = fields.artistIds.map(
      value => validateInteger(value, 'artistIds'),
    );

    if (artistIds.length === 0) {
      throw new AppError('Debe indicar al menos un artista', 400);
    }

    if (new Set(artistIds).size !== artistIds.length) {
      throw new AppError('artistIds no puede contener repetidos', 400);
    }

    data.artistIds = artistIds;
  }

  return data;
}

function handleWriteError(
  error: unknown,
  next: NextFunction,
): void {
  if (error instanceof ForeignKeyConstraintViolationException) {
    next(new AppError(
      'Una relación cambió durante la operación; verificá los IDs',
      409,
    ));
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
    const tracks = await trackRepository.findAll();

    res.status(200).json({
      message: 'Listado de pistas',
      data: tracks,
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
    const track = await trackRepository.findById(id);

    if (!track) {
      throw new AppError('Pista no encontrada', 404);
    }

    res.status(200).json({
      message: 'Pista encontrada',
      data: track,
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

    if (
      data.name === undefined ||
      data.durationMs === undefined ||
      data.discNumber === undefined ||
      data.trackNumber === undefined ||
      data.releaseId === undefined ||
      data.artistIds === undefined
    ) {
      throw new AppError(
        'Son obligatorios name, durationMs, discNumber, ' +
        'trackNumber, releaseId y artistIds',
        400,
      );
    }

    const input: CreateTrackInput = {
      ...data,
      name: data.name,
      durationMs: data.durationMs,
      discNumber: data.discNumber,
      trackNumber: data.trackNumber,
      releaseId: data.releaseId,
      artistIds: data.artistIds,
    };

    const track = await trackRepository.create(input);

    res.status(201).json({
      message: 'Pista creada',
      data: track,
    });
  } catch (error) {
    handleWriteError(error, next);
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

    const track = await trackRepository.update(id, data);

    if (!track) {
      throw new AppError('Pista no encontrada', 404);
    }

    res.status(200).json({
      message: 'Pista actualizada',
      data: track,
    });
  } catch (error) {
    handleWriteError(error, next);
  }
}

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const deleted = await trackRepository.delete(id);

    if (!deleted) {
      throw new AppError('Pista no encontrada', 404);
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof ForeignKeyConstraintViolationException) {
      next(new AppError(
        'No se puede eliminar la pista porque tiene registros asociados',
        409,
      ));
      return;
    }

    next(error);
  }
}