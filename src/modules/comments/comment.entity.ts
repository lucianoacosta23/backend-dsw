import { Check, Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { User } from '../users/user.entity.js';
import { Review } from '../reviews/review.entity.js';

@Entity()
@Check({ name: 'comment_text_length_check', expression: 'char_length(text) >= 1 and char_length(text) <= 2000' })
@Check({ name: 'comment_parent_not_self_check', expression: 'parent_id <> id' })
@Index({
  name: 'comment_visible_children_idx',
  expression: 'create index comment_visible_children_idx on comment (review_id, parent_id, created_at, id) where deleted_at is null',
})
@Index({ name: 'comment_parent_idx', properties: ['parent'] })
export class Comment {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @ManyToOne(() => Review, { deleteRule: 'no action' })
  review!: Rel<Review>;

  @ManyToOne(() => User, { deleteRule: 'no action' })
  author!: Rel<User>;

  @ManyToOne(() => Comment, { nullable: true, deleteRule: 'no action' })
  parent: Rel<Comment> | null = null;

  @Property({ type: 'text' })
  text!: string;

  @Property({ type: 'Date', defaultRaw: 'current_timestamp', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'Date', nullable: true })
  editedAt: Date | null = null;

  @Property({ type: 'Date', nullable: true })
  deletedAt: Date | null = null;
}
