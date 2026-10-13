import { AppError } from '../../shared/errors/app-error.js';

// Public restriction metadata only; never expose account identity or moderation evidence.
export class ProfileRestrictionError extends AppError {
  readonly code: 'PROFILE_SUSPENDED' | 'PROFILE_BANNED';
  constructor(status: 'SUSPENDED' | 'BANNED', public readonly suspendedUntil: string | null) {
    super('Este perfil no está disponible.', 404);
    this.code = status === 'SUSPENDED' ? 'PROFILE_SUSPENDED' : 'PROFILE_BANNED';
    Object.setPrototypeOf(this, ProfileRestrictionError.prototype);
  }
}
