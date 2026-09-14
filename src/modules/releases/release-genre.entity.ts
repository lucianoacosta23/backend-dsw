import { Entity, ManyToOne } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { Release } from './release.entity.js';
import { Genre } from '../genres/genres.entity.js';

@Entity({ tableName: 'release_genres' })
export class ReleaseGenre {
  @ManyToOne(() => Release, {
    primary: true,
    deleteRule: 'cascade',
  })
  release!: Rel<Release>;

  @ManyToOne(() => Genre, {
    primary: true,
    deleteRule: 'restrict',
  })
  genre!: Rel<Genre>;
}