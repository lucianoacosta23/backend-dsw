import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { Artist } from '../artists/artist.entity.js';
import { Release } from '../releases/release.entity.js';

@Entity()
export class Track {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @Property({ type: 'string', nullable: true, unique: true })
  spotifyId: string | null = null;

  @Property({ type: 'string' })
  name!: string;

  @Property({ type: 'integer' })
  durationMs!: number;

  @Property({ type: 'integer' })
  discNumber!: number;

  @Property({ type: 'integer' })
  trackNumber!: number;

  @Property({ type: 'boolean' })
  explicit = false;

  @ManyToOne(() => Release, { deleteRule: 'restrict' })
  release!: Rel<Release>;

  @ManyToMany(() => Artist)
  artists = new Collection<Artist>(this);
}