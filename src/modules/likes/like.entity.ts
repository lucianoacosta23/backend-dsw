import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { User } from '../users/user.entity.js';
import { Review } from '../reviews/review.entity.js';

// Relación N:M entre User y Review (el "like" del DER). El nombre de tabla es
// review_like porque "like" es una palabra reservada de SQL.
// La UNIQUE (review, user) impide likes duplicados y, al empezar por review_id,
// también sirve para contar los likes de una reseña sin otro índice.
@Entity({ tableName: 'review_like' })
@Unique({ name: 'review_like_review_id_user_id_unique', properties: ['review', 'user'] })
export class ReviewLike {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: Rel<User>;

  @ManyToOne(() => Review, { deleteRule: 'cascade' })
  review!: Rel<Review>;

  @Property({ type: 'Date', defaultRaw: 'current_timestamp', onCreate: () => new Date() })
  createdAt!: Date;
}
