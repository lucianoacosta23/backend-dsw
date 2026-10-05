import { Entity, PrimaryKey, Property, Collection, ManyToMany, ManyToOne } from '@mikro-orm/core';

import { Track } from '../tracks/track.entity.ts';
import { User } from '../users/user.entity.ts'


@Entity()
export class Playlist {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @Property({ type: 'string' })
  name!: string;

  // Relación con el Usuario (Un usuario puede tener muchas playlists, pero una playlist pertenece a un usuario)
  @ManyToOne(() => User, { nullable: false })
  user!: User;

  // Relación con las Canciones (Una playlist tiene muchas canciones, y una canción puede estar en varias playlists)
  @ManyToMany(() => Track, track => track.playlists, { owner: true })
  tracks = new Collection<Track>(this);
}