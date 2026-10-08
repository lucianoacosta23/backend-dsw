import { Check, Entity, ManyToOne, PrimaryKey, Property, Unique, type Rel } from '@mikro-orm/core';
import { User } from '../users/user.entity.js';
import { Release } from '../releases/release.entity.js';

@Entity()
@Unique({ properties: ['user', 'release'] })
@Unique({ properties: ['user', 'position'] })
@Check({ name: 'favorite_release_position_check', expression: 'position >= 1 and position <= 5' })
export class UserFavoriteRelease {
  @PrimaryKey({ type: 'number' }) id?: number;
  @ManyToOne(() => User, { deleteRule: 'cascade' }) user!: Rel<User>;
  @ManyToOne(() => Release, { deleteRule: 'cascade', index: true }) release!: Rel<Release>;
  @Property({ type: 'integer' }) position!: number;
}
