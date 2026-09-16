import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class User {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @Property({ type: 'string' })
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