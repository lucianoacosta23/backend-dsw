import { Entity, ManyToOne } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { Release } from './release.entity.js';
import { Artist } from '../artists/artist.entity.js';

@Entity({ tableName: 'release_artists' })
export class ReleaseArtist {
  @ManyToOne(() => Release, {
    primary: true,
    deleteRule: 'cascade',
  })
  release!: Rel<Release>;

  @ManyToOne(() => Artist, {
    primary: true,
    deleteRule: 'restrict',
  })
  artist!: Rel<Artist>;
}