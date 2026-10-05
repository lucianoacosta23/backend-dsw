import { AppError } from '../../shared/errors/app-error.js';
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  REPORT_STATUSES,
} from './report.entity.js';
import type { ReportReason, ReportStatus } from './report.entity.js';

export interface CreateReportInput {
  reason: ReportReason;
  details: string | null;
}

export interface ReportListInput {
  status: ReportStatus;
  page: number;
  pageSize: number;
}

export type ReportDecision = 'DISMISS' | 'REMOVE_REVIEW';

const MAX_ID = 2147483647;

function objectWithFields(
  value: unknown,
  allowed: string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  }

  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new AppError(
      `Solo se permiten los campos: ${allowed.join(', ')}`,
      400,
    );
  }

  return value as Record<string, unknown>;
}

function parseReason(value: unknown): ReportReason {
  if (
    typeof value !== 'string' ||
    !(REPORT_REASONS as readonly string[]).includes(value)
  ) {
    throw new AppError(
      `reason es obligatorio y debe ser uno de: ${REPORT_REASONS.join(', ')}`,
      400,
    );
  }

  return value as ReportReason;
}

function parseDetails(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('details debe ser un texto', 400);
  }

  const details = value.trim();
  const length = Array.from(details).length;

  if (
    length < 1 ||
    length > REPORT_DETAILS_MAX_LENGTH ||
    details.includes('\0')
  ) {
    throw new AppError(
      `details debe tener entre 1 y ${REPORT_DETAILS_MAX_LENGTH} caracteres y no contener NUL`,
      400,
    );
  }

  return details;
}

function parsePositiveInteger(value: unknown, field: string, max = MAX_ID): number {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw new AppError(`${field} debe ser un entero positivo`, 400);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new AppError(`${field} está fuera del rango permitido`, 400);
  }

  return parsed;
}

export function parseCreateReport(body: unknown): CreateReportInput {
  const data = objectWithFields(body, ['reason', 'details']);
  const reason = parseReason(data.reason);
  const details = Object.hasOwn(data, 'details')
    ? parseDetails(data.details)
    : null;

  if (reason === 'OTHER' && details === null) {
    throw new AppError('details es obligatorio cuando reason es OTHER', 400);
  }

  return { reason, details };
}

export function parseReportList(
  query: Record<string, unknown>,
): ReportListInput {
  const allowed = ['status', 'page', 'pageSize'];

  if (Object.keys(query).some(key => !allowed.includes(key))) {
    throw new AppError(
      'Solo se permiten los filtros status, page y pageSize',
      400,
    );
  }

  let status: ReportStatus = 'PENDING';

  if (query.status !== undefined) {
    if (
      typeof query.status !== 'string' ||
      !(REPORT_STATUSES as readonly string[]).includes(query.status)
    ) {
      throw new AppError(
        `status debe ser uno de: ${REPORT_STATUSES.join(', ')}`,
        400,
      );
    }

    status = query.status as ReportStatus;
  }

  const page =
    query.page === undefined ? 1 : parsePositiveInteger(query.page, 'page');

  const pageSize =
    query.pageSize === undefined
      ? 20
      : parsePositiveInteger(query.pageSize, 'pageSize', 100);

  if ((page - 1) * pageSize > MAX_ID) {
    throw new AppError('La página está fuera del rango permitido', 400);
  }

  return { status, page, pageSize };
}

export function parseModerateReport(
  body: unknown,
): { decision: ReportDecision } {
  const data = objectWithFields(body, ['decision']);

  if (data.decision !== 'DISMISS' && data.decision !== 'REMOVE_REVIEW') {
    throw new AppError(
      'decision debe ser DISMISS o REMOVE_REVIEW',
      400,
    );
  }

  return { decision: data.decision };
}