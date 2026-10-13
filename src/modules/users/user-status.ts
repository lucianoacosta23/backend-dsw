export const USER_STATUSES = ['ENABLED', 'SUSPENDED', 'BANNED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface AccountState {
  status: UserStatus;
  suspendedUntil: Date | null;
}

// La expiración no necesita una tarea programada ni inventa un actor de auditoría.
export function effectiveUserStatus(user: AccountState, now = new Date()): UserStatus {
  if (user.status === 'SUSPENDED' && user.suspendedUntil !== null && user.suspendedUntil <= now) {
    return 'ENABLED';
  }
  return user.status;
}

// Una semana exacta (168 horas). El servidor determina el vencimiento.
export const SUSPENSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export function suspensionEnd(now: Date): Date {
  return new Date(now.getTime() + SUSPENSION_DURATION_MS);
}

export function enabledAccountFilter(now = new Date()) {
  return { $or: [
    { status: 'ENABLED' as const },
    { status: 'SUSPENDED' as const, suspendedUntil: { $lte: now } },
  ] };
}

// Solo recibe alias internos del código, nunca valores de una petición.
export function enabledAccountSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Alias de cuenta inválido');
  return `(${alias}.status = 'ENABLED' OR (${alias}.status = 'SUSPENDED' AND ${alias}.suspended_until <= CURRENT_TIMESTAMP))`;
}
