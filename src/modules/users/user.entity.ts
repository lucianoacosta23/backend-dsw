import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class User {
  @PrimaryKey()
  id?: number;

  @Property()
  username!: string;

  @Property()
  fullName!: string;

  @Property()
  email!: string;

  @Property()
  category!: string;

  @Property({ unique: true })
  spotifyId!: string;

  @Property({ onCreate: () => new Date() })
  createdAt!: Date;
}