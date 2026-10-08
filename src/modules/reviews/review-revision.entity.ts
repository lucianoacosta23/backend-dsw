import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { Review } from './review.entity.js';

@Entity()
@Index({ properties: ['review', 'replacedAt'] })
@Check({
  name: 'review_revision_text_length_check',
  expression:
    'text IS NULL OR (char_length(text) >= 1 AND char_length(text) <= 2000)',
})
export class ReviewRevision {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @ManyToOne(() => Review, { deleteRule: 'cascade' })
  review!: Rel<Review>;

  @Property({ type: 'text', nullable: true })
  text: string | null = null;

  // Momento desde el que esta versión estuvo vigente.
  @Property({ type: 'Date' })
  effectiveAt!: Date;

  // Momento en que fue reemplazada por una edición.
  @Property({ type: 'Date' })
  replacedAt!: Date;
}