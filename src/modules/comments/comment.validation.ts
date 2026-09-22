import { AppError } from '../../shared/errors/app-error.js';

const MAX_ID = 2147483647;

export interface CommentPage {
  page: number;
  pageSize: number;
}

export interface CreateCommentInput {
  text: string;
  parentId?: number;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_ID) {
    throw new AppError(`El ID debe ser un entero entre 1 y ${MAX_ID}`, 400);
  }
  return value;
}

export function parseCommentId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new AppError('El ID debe ser un entero positivo', 400);
  }
  return positiveInteger(Number(value));
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

export function parseCommentText(value: unknown): string {
  if (typeof value !== 'string') throw new AppError('text es obligatorio y debe ser un texto', 400);
  const text = value.trim();
  const length = Array.from(text).length;
  if (length < 1 || length > 2000 || text.includes('\0')) {
    throw new AppError('text debe tener entre 1 y 2000 caracteres y no contener NUL', 400);
  }
  return text;
}

export function parseCreateComment(body: unknown): CreateCommentInput {
  const data = objectWithFields(body, ['text', 'parentId']);
  const result: CreateCommentInput = { text: parseCommentText(data.text) };
  if (Object.hasOwn(data, 'parentId')) result.parentId = positiveInteger(data.parentId);
  return result;
}

export function parseEditComment(body: unknown): string {
  return parseCommentText(objectWithFields(body, ['text']).text);
}

export function validateDeleteCommentBody(body: unknown): void {
  if (body !== undefined) objectWithFields(body, []);
}

export function parseCommentPage(query: Record<string, unknown>): CommentPage {
  if (Object.keys(query).some(key => !['page', 'pageSize'].includes(key))) {
    throw new AppError('Solo se permiten los parámetros page y pageSize', 400);
  }
  const page = query.page === undefined ? 1 : parseCommentId(query.page);
  const pageSize = query.pageSize === undefined ? 20 : parseCommentId(query.pageSize);
  if (pageSize > 100 || (page - 1) * pageSize > MAX_ID) {
    throw new AppError('Paginación fuera de rango: pageSize no puede superar 100', 400);
  }
  return { page, pageSize };
}
