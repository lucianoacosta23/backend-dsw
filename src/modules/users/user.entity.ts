import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class User {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @Property({ type: 'string' })
  username!: string;

  @Property({ type: 'string' })
  fullName!: string;

  @Property({ type: 'string' })
  email!: string;

  @Property({ type: 'string' })
  category!: string;

  @Property({ type: 'string', unique: true })
  spotifyId!: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt!: Date;
}