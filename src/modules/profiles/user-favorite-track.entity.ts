import { Check, Entity, ManyToOne, PrimaryKey, Property, Unique, type Rel } from '@mikro-orm/core';
import { User } from '../users/user.entity.js';
import { Track } from '../tracks/track.entity.js';

@Entity()
@Unique({ properties: ['user', 'track'] })
@Unique({ properties: ['user', 'position'] })
@Check({ name: 'favorite_track_position_check', expression: 'position >= 1 and position <= 5' })
export class UserFavoriteTrack {
  @PrimaryKey({ type: 'number' }) id?: number;
  @ManyToOne(() => User, { deleteRule: 'cascade' }) user!: Rel<User>;
  @ManyToOne(() => Track, { deleteRule: 'cascade', index: true }) track!: Rel<Track>;
  @Property({ type: 'integer' }) position!: number;
}
