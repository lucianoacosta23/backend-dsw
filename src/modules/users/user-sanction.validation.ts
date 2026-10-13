import { suspensionEnd } from './user-status.js';
import { AppError } from '../../shared/errors/app-error.js';
import { SANCTION_ACTIONS, type SanctionAction } from './user-sanction.entity.js';

export interface SanctionInput {
  action: SanctionAction;
  reason: string;
  suspendedUntil: Date | null;
}

export function parseSanction(body: unknown, now = new Date()): SanctionInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('El cuerpo debe ser un objeto JSON', 400);
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['action', 'reason', 'suspendedUntil'].includes(key))) {
    throw new AppError('Solo se permiten action, reason y suspendedUntil', 400);
  }
  if (!SANCTION_ACTIONS.includes(input.action as SanctionAction)) {
    throw new AppError('action debe ser SUSPEND, BAN o REACTIVATE', 400);
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason || Array.from(reason).length > 500 || reason.includes('\0')) {
    throw new AppError('El motivo debe tener entre 1 y 500 caracteres y no contener NUL', 400);
  }
  let suspendedUntil: Date | null = null;
  if (input.action === 'SUSPEND') {
    // Compatibilidad con el formulario anterior: validar la fecha recibida,
    // pero no permitir que el cliente cambie la duración fija.
    if (Object.hasOwn(input, 'suspendedUntil')) {
      const value = input.suspendedUntil;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
        throw new AppError('suspendedUntil debe ser una fecha ISO 8601 en UTC', 400);
      }
      suspendedUntil = new Date(value);
      const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
      if (!Number.isFinite(suspendedUntil.getTime()) || suspendedUntil.toISOString() !== normalized || suspendedUntil <= now) {
        throw new AppError('La suspensión debe terminar en una fecha válida futura', 400);
      }
    }
    suspendedUntil = suspensionEnd(now);
  } else if (Object.hasOwn(input, 'suspendedUntil')) {
    throw new AppError('Baneo y reactivación no admiten suspendedUntil', 400);
  }
  return { action: input.action as SanctionAction, reason, suspendedUntil };
}
