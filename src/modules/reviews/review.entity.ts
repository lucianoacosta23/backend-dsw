import {
  Check,
  DecimalType,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { User } from '../users/user.entity.js';
import { Release } from '../releases/release.entity.js';
import { Track } from '../tracks/track.entity.js';

@Entity()
// Evita que un usuario pueda seguirse a sí mismo.
@Check({
  name: 'follow_no_self_follow',
  expression: 'follower_id <> followed_id',
})
// Una reseña debe apuntar a un lanzamiento o a una pista, pero no a ambos.
@Check({
  name: 'review_exactly_one_target_check',
  expression: '(release_id IS NOT NULL) <> (track_id IS NOT NULL)',
})
@Check({ name: 'review_rating_check', expression: 'rating = any (array[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])' })
@Check({ name: 'review_text_length_check', expression: 'char_length(text) >= 1 and char_length(text) <= 2000' })
@Index({
  name: 'review_release_visible_idx',
  expression: 'create index review_release_visible_idx on review (release_id, created_at desc, id desc) where deleted_at is null',
})
@Index({
  name: 'review_author_visible_idx',
  expression: 'create index review_author_visible_idx on review (author_id, created_at desc, id desc) where deleted_at is null',
})
@Index({
  name: 'review_author_release_latest_idx',
  expression: 'create index review_author_release_latest_idx on review (author_id, release_id, created_at desc, id desc)',
})
export class Review {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @ManyToOne(() => User, { deleteRule: 'no action' })
  author!: Rel<User>;
  
  @ManyToOne(() => Release, {
    nullable: true,
    deleteRule: 'no action',
  })
  release: Rel<Release> | null = null;

  @ManyToOne(() => Track, {
    nullable: true,
    deleteRule: 'no action',
  })
  track: Rel<Track> | null = null;

  @Property({ type: 'text' })
  text!: string;

  // Sin escala fija: PostgreSQL debe rechazar 1.49, no redondearlo a 1.5.
  @Property({ type: new DecimalType('number'), columnType: 'numeric' })
  rating!: number;

  @Property({ type: 'Date', defaultRaw: 'current_timestamp', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', nullable: true })
  editedAt: Date | null = null;

  @Property({ type: 'Date', nullable: true })
  deletedAt: Date | null = null;
}
