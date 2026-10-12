import { Check, Entity, Enum, Index, ManyToOne, PrimaryKey, Property, type Rel } from '@mikro-orm/core';
import { User } from './user.entity.js';

export const SANCTION_ACTIONS = ['SUSPEND', 'BAN', 'REACTIVATE'] as const;
export type SanctionAction = (typeof SANCTION_ACTIONS)[number];

export interface ReviewEvidence {
  review: {
    id: number; author: { id: number; username: string }; text: string | null;
    rating: number; reportCount: number; deletedAt: string | null;
  };
  reports: Array<{
    id: number; reason: string; details: string | null; status: string;
    createdAt: string; reporter: { id: number; username: string };
  }>;
}

@Entity({ tableName: 'user_sanction' })
@Index({ name: 'user_sanction_user_created_index', properties: ['user', 'createdAt', 'id'] })
@Check({ name: 'user_sanction_reason_check', expression: 'char_length(reason) >= 1 and char_length(reason) <= 500' })
@Check({ name: 'user_sanction_expiry_check', expression: "(action = 'SUSPEND' AND suspended_until IS NOT NULL AND suspended_until > created_at) OR (action <> 'SUSPEND' AND suspended_until IS NULL)" })
export class UserSanction {
  // Copia histórica; nunca se usa para restaurar contenido eliminado.
  @Property({ type: 'json', columnType: 'jsonb', defaultRaw: "'[]'::jsonb" })
  removedReviews: ReviewEvidence[] = [];

  @PrimaryKey({ type: 'number' })
  id?: number;

  @ManyToOne(() => User, { deleteRule: 'restrict' })
  user!: Rel<User>;

  @ManyToOne(() => User, { deleteRule: 'restrict' })
  administrator!: Rel<User>;

  @Enum({ items: () => SANCTION_ACTIONS, type: 'string', columnType: 'text' })
  action!: SanctionAction;

  @Property({ type: 'text' })
  reason!: string;

  @Property({ type: 'Date', defaultRaw: 'current_timestamp', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', nullable: true })
  suspendedUntil: Date | null = null;
}
