import { Entity, ManyToOne } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { Track } from './track.entity.js';
import { Artist } from '../artists/artist.entity.js';

@Entity({ tableName: 'track_artists' })
export class TrackArtist {
  @ManyToOne(() => Track, {
    primary: true,
    deleteRule: 'cascade',
  })
  track!: Rel<Track>;

  @ManyToOne(() => Artist, {
    primary: true,
    deleteRule: 'restrict',
  })
  artist!: Rel<Artist>;
}