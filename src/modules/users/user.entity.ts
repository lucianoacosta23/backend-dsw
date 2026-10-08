import { Entity, ManyToOne, PrimaryKey, Property, type Rel } from '@mikro-orm/core';
import { ProfileImage } from '../profiles/profile-image.entity.js';

@Entity()
export class User {
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
