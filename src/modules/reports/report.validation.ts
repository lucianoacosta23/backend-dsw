import { AppError } from '../../shared/errors/app-error.js';
import { REPORT_DETAILS_MAX_LENGTH, REPORT_REASONS } from './report.entity.js';
import type { ReportReason } from './report.entity.js';

export interface CreateReportInput {
  reason: ReportReason;
  details: string | null;
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

function parseReason(value: unknown): ReportReason {
  if (typeof value !== 'string' || !(REPORT_REASONS as readonly string[]).includes(value)) {
    throw new AppError(`reason es obligatorio y debe ser uno de: ${REPORT_REASONS.join(', ')}`, 400);
  }

  return value as ReportReason;
}

function parseDetails(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('details debe ser un texto', 400);
  }

  const details = value.trim();
  const length = Array.from(details).length;

  if (length < 1 || length > REPORT_DETAILS_MAX_LENGTH || details.includes('\0')) {
    throw new AppError(
      `details debe tener entre 1 y ${REPORT_DETAILS_MAX_LENGTH} caracteres y no contener NUL`,
      400,
    );
  }

  return details;
}

export function parseCreateReport(body: unknown): CreateReportInput {
  const data = objectWithFields(body, ['reason', 'details']);
  const reason = parseReason(data.reason);
  const details = Object.hasOwn(data, 'details') ? parseDetails(data.details) : null;

  // Un reporte "OTHER" sin explicación no le sirve a quien modere.
  if (reason === 'OTHER' && details === null) {
    throw new AppError('details es obligatorio cuando reason es OTHER', 400);
  }

  return { reason, details };
}
