import {
  Collection,
  Entity,
  Enum,
  ManyToMany,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';

import { Artist } from '../artists/artist.entity.js';
import { Genre } from '../genres/genres.entity.js';
import { Track } from '../tracks/track.entity.js';
import { ReleaseArtist } from './release-artist.entity.js';
import { ReleaseGenre } from './release-genre.entity.js';

export enum ReleaseType {
  ALBUM = 'ALBUM',
  EP = 'EP',
  SINGLE = 'SINGLE',
  MIXTAPE = 'MIXTAPE',
  COMPILATION = 'COMPILATION',
}

export enum ReleaseDatePrecision {
  YEAR = 'YEAR',
  MONTH = 'MONTH',
  DAY = 'DAY',
}

@Entity()
export class Release {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @Property({ type: 'string', nullable: true, unique: true })
  spotifyId: string | null = null;

  @Property({ type: 'string' })
  name!: string;

  @Enum(() => ReleaseType)
  type!: ReleaseType;

  @Property({ type: 'text', nullable: true })
  description: string | null = null;

  @Property({ type: 'text', nullable: true })
  imageUrl: string | null = null;

  @Property({ type: 'string', length: 10 })
  releaseDate!: string;

  @Enum(() => ReleaseDatePrecision)
  releaseDatePrecision!: ReleaseDatePrecision;

 @ManyToMany({
  entity: () => Artist,
  pivotEntity: () => ReleaseArtist,
})
artists = new Collection<Artist>(this);

@ManyToMany({
  entity: () => Genre,
  pivotEntity: () => ReleaseGenre,
})
genres = new Collection<Genre>(this);

  @OneToMany(() => Track, track => track.release)
  tracks = new Collection<Track>(this);
}