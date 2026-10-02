import { Check, Entity, Enum, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import type { Rel } from '@mikro-orm/core';

import { User } from '../users/user.entity.js';
import { Review } from '../reviews/review.entity.js';

export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'HATE_SPEECH',
  'INAPPROPRIATE_CONTENT',
  'SPOILER',
  'OTHER',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_DETAILS_MAX_LENGTH = 500;

// Entidad "report" del DER: un User (reporter) crea el reporte y el reporte
// "tiene" una Review. Un usuario solo puede reportar una vez la misma reseña.
@Entity({ tableName: 'review_report' })
@Unique({ name: 'review_report_review_id_reporter_id_unique', properties: ['review', 'reporter'] })
@Check({
  name: 'review_report_details_length_check',
  expression: `details is null or (char_length(details) >= 1 and char_length(details) <= ${REPORT_DETAILS_MAX_LENGTH})`,
})
export class ReviewReport {
  @PrimaryKey({ type: 'number' })
  id?: number;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  reporter!: Rel<User>;

  @ManyToOne(() => Review, { deleteRule: 'cascade' })
  review!: Rel<Review>;

  // Enum de MikroORM: genera text + CHECK "review_report_reason_check" con los valores permitidos.
  @Enum({ items: () => REPORT_REASONS, type: 'string', columnType: 'text' })
  reason!: ReportReason;

  @Property({ type: 'text', nullable: true })
  details: string | null = null;

  @Property({ type: 'Date', defaultRaw: 'current_timestamp', onCreate: () => new Date() })
  createdAt!: Date;
}
