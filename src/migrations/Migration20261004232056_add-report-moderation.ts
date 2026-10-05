import { Migration } from '@mikro-orm/migrations';

export class Migration20261004232056_add_report_moderation extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "review_report" add column "status" text check ("status" in ('PENDING', 'DISMISSED', 'ACTIONED')) not null default 'PENDING', add column "moderated_by_id" int null, add column "moderated_at" timestamptz null;`);
    this.addSql(`alter table "review_report" add constraint "review_report_moderated_by_id_foreign" foreign key ("moderated_by_id") references "user" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "review_report" drop constraint "review_report_moderated_by_id_foreign";`);

    this.addSql(`alter table "review_report" drop column "status", drop column "moderated_by_id", drop column "moderated_at";`);
  }

}
