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
