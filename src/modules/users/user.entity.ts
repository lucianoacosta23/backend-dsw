import { Check, Entity, Enum, ManyToOne, PrimaryKey, Property, type Rel } from '@mikro-orm/core';
import { ProfileImage } from '../profiles/profile-image.entity.js';
import { USER_STATUSES, type UserStatus } from './user-status.js';

@Entity()
@Check({ name: 'user_suspension_expiry_check', expression: "(status = 'SUSPENDED' AND suspended_until IS NOT NULL) OR (status <> 'SUSPENDED' AND suspended_until IS NULL)" })
export class User {
  @Property({ type: 'number', default: 0 })
  sessionVersion = 0;

  @Enum({ items: () => USER_STATUSES, type: 'string', columnType: 'text', default: 'ENABLED' })
  status: UserStatus = 'ENABLED';

  @Property({ type: 'Date', nullable: true })
  suspendedUntil: Date | null = null;

  @ManyToOne(() => ProfileImage, { nullable: true, deleteRule: 'set null' })
  avatarImage: Rel<ProfileImage> | null = null;

  @ManyToOne(() => ProfileImage, { nullable: true, deleteRule: 'set null' })
  coverImage: Rel<ProfileImage> | null = null;

  @PrimaryKey({ type: 'number' })
  id?: number;

  @Property({ type: 'string', unique: true })
username!: string;

  @Property({ type: 'string' })
  fullName!: string;

  @Property({ type: 'string', nullable: true, unique: true })
email: string | null = null;

  @Property({ type: 'string' })
  category!: string;

 

@Property({ type: 'string', nullable: true, hidden: true })
passwordHash: string | null = null;

@Property({ type: 'string', nullable: true, unique: true })
spotifyId: string | null = null;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}
