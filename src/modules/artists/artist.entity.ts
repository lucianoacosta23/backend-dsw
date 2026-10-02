import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { ArtistRepository } from './artist.repository.js';

@Entity({ repository: () => ArtistRepository })


@Entity()
export class Artist {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @Property({ type: 'string' })
  name!: string;

 @Property({ type: 'text', nullable: true })
biography: string | null = null;

@Property({ type: 'text', nullable: true })
imageUrl: string | null = null; 

@Property({ type: 'string', nullable: true, unique: true })
spotifyId: string | null = null;
}