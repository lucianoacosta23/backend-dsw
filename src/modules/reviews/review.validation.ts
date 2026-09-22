import { AppError } from '../../shared/errors/app-error.js';

const MAX_ID = 2147483647;

export interface CreateReviewInput {
  releaseId: number;
  text: string;
  rating: number;
}

export interface ReviewListInput {
  authorId?: number;
  releaseId?: number;
  page: number;
  pageSize: number;
}

export function parseReviewId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new AppError('El ID debe ser un entero positivo', 400);
  }

  return positiveInteger(Number(value), 'ID');
}

function positiveInteger(value: unknown, field: string, max = MAX_ID): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new AppError(`${field} debe ser un entero entre 1 y ${max}`, 400);
  }

  return value;
}

function objectWithFields(value: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  }

  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new AppError(`Solo se permiten los campos: ${allowed.join(', ')}`, 400);
  }

  return value as Record<string, unknown>;
}

export function parseReviewText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('text es obligatorio y debe ser un texto', 400);
  }

  const text = value.trim();
  const length = Array.from(text).length;

  if (length < 1 || length > 2000 || text.includes('\0')) {
    throw new AppError('text debe tener entre 1 y 2000 caracteres y no contener NUL', 400);
  }

  return text;
}

export function parseReviewRating(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < 1 || value > 5 || !Number.isInteger(value * 2)) {
    throw new AppError('rating debe ser un número de 1 a 5 en pasos de 0.5', 400);
  }

  return value;
}

export function parseCreateReview(body: unknown): CreateReviewInput {
  const data = objectWithFields(body, ['releaseId', 'text', 'rating']);

  return {
    releaseId: positiveInteger(data.releaseId, 'releaseId'),
    text: parseReviewText(data.text),
    rating: parseReviewRating(data.rating),
  };
}

export function parseEditReview(body: unknown): string {
  const data = objectWithFields(body, ['text']);
  return parseReviewText(data.text);
}

export function validateDeleteReviewBody(body: unknown): void {
  if (body !== undefined) {
    objectWithFields(body, []);
  }
}

export function parseReviewList(query: Record<string, unknown>): ReviewListInput {
  if (Object.keys(query).some(key => !['authorId', 'releaseId', 'page', 'pageSize'].includes(key))) {
    throw new AppError('Solo se permiten los filtros authorId, releaseId, page y pageSize', 400);
  }

  const result: ReviewListInput = {
    page: query.page === undefined ? 1 : parseReviewId(query.page),
    pageSize: query.pageSize === undefined ? 20 : positiveInteger(parseReviewId(query.pageSize), 'pageSize', 100),
  };

  if (query.authorId !== undefined) result.authorId = parseReviewId(query.authorId);
  if (query.releaseId !== undefined) result.releaseId = parseReviewId(query.releaseId);

  if (result.authorId === undefined && result.releaseId === undefined) {
    throw new AppError('Debe filtrar por authorId o releaseId', 400);
  }

  if ((result.page - 1) * result.pageSize > MAX_ID) {
    throw new AppError('La página está fuera del rango permitido', 400);
  }

  return result;
}
