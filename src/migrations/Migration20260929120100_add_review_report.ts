import { Migration } from '@mikro-orm/migrations';

export class Migration20260929120100_add_review_report extends Migration {
  override async up(): Promise<void> {
    // No se regeneran snapshots, igual que en las migraciones anteriores.
    this.addSql(`create table "review_report" (
      "id" serial primary key,
      "reporter_id" int not null,
      "review_id" int not null,
      "reason" text not null,
      "details" text null,
      "created_at" timestamptz not null default current_timestamp,
      constraint "review_report_reason_check" check ("reason" in ('SPAM', 'HARASSMENT', 'HATE_SPEECH', 'INAPPROPRIATE_CONTENT', 'SPOILER', 'OTHER')),
      constraint "review_report_details_length_check" check (details is null or (char_length(details) >= 1 and char_length(details) <= 500)),
      constraint "review_report_review_id_reporter_id_unique" unique ("review_id", "reporter_id"),
      constraint "review_report_reporter_id_foreign" foreign key ("reporter_id") references "user" ("id") on update cascade on delete cascade,
      constraint "review_report_review_id_foreign" foreign key ("review_id") references "review" ("id") on update cascade on delete cascade
    );`);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "review_report";');
  }
}
