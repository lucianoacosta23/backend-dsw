import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { User } from '../users/user.entity.js';
import { Playlist } from './playlist.entity.js';

// Representa una playlist que un usuario agregó a su biblioteca.
@Entity({ tableName: 'playlist_save' })
@Unique({
  name: 'playlist_save_playlist_id_user_id_unique',
  properties: ['playlist', 'user'],
})
@Index({
  name: 'playlist_save_user_id_index',
  properties: ['user'],
})
export class PlaylistSave {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: Rel<User>;

  @ManyToOne(() => Playlist, { deleteRule: 'cascade' })
  playlist!: Rel<Playlist>;

  @Property({
    type: 'Date',
    defaultRaw: 'current_timestamp',
    onCreate: () => new Date(),
  })
  createdAt!: Date;
}