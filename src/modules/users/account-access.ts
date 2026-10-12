import type { Request } from 'express';
import { LockMode, type EntityManager } from '@mikro-orm/core';
import { AppError } from '../../shared/errors/app-error.js';
import { User } from './user.entity.js';
import { effectiveUserStatus } from './user-status.js';

export class AccountRestrictionError extends AppError {
  constructor(public readonly code: 'ACCOUNT_SUSPENDED' | 'ACCOUNT_BANNED', public readonly suspendedUntil: string | null) {
    super(code === 'ACCOUNT_BANNED' ? 'Tu cuenta está baneada por tiempo indefinido.' : `Tu cuenta está suspendida hasta ${suspendedUntil}.`, 403);
    Object.setPrototypeOf(this, AccountRestrictionError.prototype);
  }
}

export function assertAccountEnabled(user: User, now = new Date()): void {
  const status = effectiveUserStatus(user, now);
  if (status === 'BANNED') throw new AccountRestrictionError('ACCOUNT_BANNED', null);
  if (status === 'SUSPENDED') throw new AccountRestrictionError('ACCOUNT_SUSPENDED', user.suspendedUntil!.toISOString());
}

export function assertAccountSession(user: User, req: Request): void {
  assertAccountEnabled(user);
  if ((req.session.userVersion ?? 0) !== user.sessionVersion) {
    throw new AppError('La sesión ya no es válida. Volvé a iniciar sesión.', 401);
  }
}

// Se llama dentro de la transacción, antes de bloquear reseñas/playlists.
// Coordina creaciones concurrentes con la eliminación masiva de una sanción.
export async function lockEnabledUser(em: EntityManager, userId: number): Promise<User> {
  const user = await em.findOne(User, { id: userId }, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
  if (!user) throw new AppError('Usuario no encontrado', 404);
  assertAccountEnabled(user);
  return user;
}
