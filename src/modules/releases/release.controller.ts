import type { Request, Response, NextFunction } from 'express';
import {DriverException, ForeignKeyConstraintViolationException } from '@mikro-orm/core';

import { AppError } from '../../shared/errors/app-error.js';
import {
  ReleaseType,
  ReleaseDatePrecision,
} from './release.entity.js';

import { ReleaseRepository } from './release.repository.js';
import type {
  CreateReleaseInput,
  UpdateReleaseInput,
} from './release.repository.js';

const releaseRepository = new ReleaseRepository();

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

function validateIds(
  value: unknown,
  field: string,
  required: boolean,
): number[] {
  if (!Array.isArray(value)) {
    throw new AppError(`${field} debe ser una lista de IDs`, 400);
  }

  const ids: number[] = [];

  for (const id of value) {
    if (
      typeof id !== 'number' ||
      !Number.isInteger(id) ||
      id < 1 ||
      id > 2147483647
    ) {
      throw new AppError(
        `${field} debe contener IDs enteros positivos válidos`,
        400,
      );
    }

    ids.push(id);
  }

  if (required && ids.length === 0) {
    throw new AppError('Debe indicar al menos un artista', 400);
  }

  if (new Set(ids).size !== ids.length) {
    throw new AppError(`${field} no puede contener IDs repetidos`, 400);
  }

  return ids;
}

function validateReleaseDate(
  value: string,
  precision: ReleaseDatePrecision,
): void {
  const patterns = {
    YEAR: /^\d{4}$/,
    MONTH: /^\d{4}-\d{2}$/,
    DAY: /^\d{4}-\d{2}-\d{2}$/,
  };

  if (!patterns[precision].test(value)) {
    throw new AppError(
      'releaseDate no coincide con releaseDatePrecision',
      400,
    );
  }

  const year = Number(value.slice(0, 4));

  if (year < 1) {
    throw new AppError('El año debe ser mayor que cero', 400);
  }

  if (precision === ReleaseDatePrecision.YEAR) {
    return;
  }

  const month = Number(value.slice(5, 7));

  if (month < 1 || month > 12) {
    throw new AppError('El mes no es válido', 400);
  }

  if (precision === ReleaseDatePrecision.MONTH) {
    return;
  }

  const day = Number(value.slice(8, 10));
  const leapYear =
    year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);

  const daysPerMonth = [
    31, leapYear ? 29 : 28, 31, 30, 31, 30,
    31, 31, 30, 31, 30, 31,
  ];

  const maxDays = daysPerMonth[month - 1]!;

  if (day < 1 || day > maxDays) {
    throw new AppError('El día no es válido para ese mes', 400);
  }
}

function validateBody(body: unknown): UpdateReleaseInput {
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
    'type',
    'description',
    'imageUrl',
    'releaseDate',
    'releaseDatePrecision',
    'artistIds',
    'genreIds',
  ];

  if (Object.keys(fields).length === 0) {
    throw new AppError('Enviá al menos un campo', 400);
  }

  if (Object.keys(fields).some(key => !allowedFields.includes(key))) {
    throw new AppError('El cuerpo contiene campos no permitidos', 400);
  }

  const data: UpdateReleaseInput = {};

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

  if (Object.hasOwn(fields, 'type')) {
    if (
      typeof fields.type !== 'string' ||
      !Object.values(ReleaseType).includes(fields.type as ReleaseType)
    ) {
      throw new AppError(
        'type debe ser ALBUM, EP, SINGLE, MIXTAPE o COMPILATION',
        400,
      );
    }

    data.type = fields.type as ReleaseType;
  }

  for (const field of ['description', 'imageUrl'] as const) {
    if (!Object.hasOwn(fields, field)) {
      continue;
    }

    const value = fields[field];

    if (value !== null && typeof value !== 'string') {
      throw new AppError(`${field} debe ser un texto o null`, 400);
    }

    data[field] = value === null ? null : value.trim() || null;
  }

  if (data.imageUrl !== undefined && data.imageUrl !== null) {
    let url: URL;

    try {
      url = new URL(data.imageUrl);
    } catch {
      throw new AppError('imageUrl debe ser una URL válida', 400);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new AppError('imageUrl debe usar HTTP o HTTPS', 400);
    }
  }

  const hasDate = Object.hasOwn(fields, 'releaseDate');
  const hasPrecision = Object.hasOwn(fields, 'releaseDatePrecision');

  if (hasDate !== hasPrecision) {
    throw new AppError(
      'Enviá releaseDate y releaseDatePrecision juntos',
      400,
    );
  }

  if (hasDate && hasPrecision) {
    if (typeof fields.releaseDate !== 'string') {
      throw new AppError('releaseDate debe ser un texto', 400);
    }

    if (
      typeof fields.releaseDatePrecision !== 'string' ||
      !Object.values(ReleaseDatePrecision).includes(
        fields.releaseDatePrecision as ReleaseDatePrecision,
      )
    ) {
      throw new AppError(
        'releaseDatePrecision debe ser YEAR, MONTH o DAY',
        400,
      );
    }

    data.releaseDate = fields.releaseDate.trim();
    data.releaseDatePrecision =
      fields.releaseDatePrecision as ReleaseDatePrecision;

    validateReleaseDate(
      data.releaseDate,
      data.releaseDatePrecision,
    );
  }

  if (Object.hasOwn(fields, 'artistIds')) {
    data.artistIds = validateIds(fields.artistIds, 'artistIds', true);
  }

  if (Object.hasOwn(fields, 'genreIds')) {
    data.genreIds = validateIds(fields.genreIds, 'genreIds', false);
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
    const releases = await releaseRepository.findAll();

    res.status(200).json({
      message: 'Listado de lanzamientos',
      data: releases,
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
    const release = await releaseRepository.findById(id);

    if (!release) {
      throw new AppError('Lanzamiento no encontrado', 404);
    }

    res.status(200).json({
      message: 'Lanzamiento encontrado',
      data: release,
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
      data.type === undefined ||
      data.releaseDate === undefined ||
      data.releaseDatePrecision === undefined ||
      data.artistIds === undefined
    ) {
      throw new AppError(
        'Son obligatorios name, type, releaseDate, ' +
        'releaseDatePrecision y artistIds',
        400,
      );
    }

    const input: CreateReleaseInput = {
      ...data,
      name: data.name,
      type: data.type,
      releaseDate: data.releaseDate,
      releaseDatePrecision: data.releaseDatePrecision,
      artistIds: data.artistIds,
    };

    const release = await releaseRepository.create(input);

    res.status(201).json({
      message: 'Lanzamiento creado',
      data: release,
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

    const release = await releaseRepository.update(id, data);

    if (!release) {
      throw new AppError('Lanzamiento no encontrado', 404);
    }

    res.status(200).json({
      message: 'Lanzamiento actualizado',
      data: release,
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
    const deleted = await releaseRepository.delete(id);

    if (!deleted) {
      throw new AppError('Lanzamiento no encontrado', 404);
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
        'No se puede eliminar el lanzamiento porque tiene registros asociados',
        409,
      ));
      return;
    }

    next(error);
  }
}
