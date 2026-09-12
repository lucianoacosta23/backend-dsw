import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class Genre {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @Property({ type: 'string', unique: true })
  name!: string;
}