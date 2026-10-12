import { Migration } from '@mikro-orm/migrations';

export class Migration20261012000000_user_sanctions extends Migration {
  async up(): Promise<void> {
    this.addSql(`alter table "user" add column "status" text not null default 'ENABLED', add column "suspended_until" timestamptz null, add column "session_version" integer not null default 0;`);
    this.addSql(`alter table "user" add constraint "user_status_check" check ("status" in ('ENABLED', 'SUSPENDED', 'BANNED'));`);
    this.addSql(`alter table "user" add constraint "user_suspension_expiry_check" check ((status = 'SUSPENDED' AND suspended_until IS NOT NULL) OR (status <> 'SUSPENDED' AND suspended_until IS NULL));`);
    this.addSql(`create table "user_sanction" (
      "id" serial primary key,
      "user_id" integer not null,
      "administrator_id" integer not null,
      "action" text not null check ("action" in ('SUSPEND', 'BAN', 'REACTIVATE')),
      "reason" text not null,
      "created_at" timestamptz not null default current_timestamp,
      "suspended_until" timestamptz null,
      "removed_reviews" jsonb not null default '[]'::jsonb,
      constraint "user_sanction_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete restrict,
      constraint "user_sanction_administrator_id_foreign" foreign key ("administrator_id") references "user" ("id") on update cascade on delete restrict,
      constraint "user_sanction_reason_check" check (char_length(reason) >= 1 and char_length(reason) <= 500),
      constraint "user_sanction_expiry_check" check ((action = 'SUSPEND' AND suspended_until IS NOT NULL AND suspended_until > created_at) OR (action <> 'SUSPEND' AND suspended_until IS NULL))
    );`);
    this.addSql('create index "user_sanction_user_created_index" on "user_sanction" ("user_id", "created_at", "id");');
  }

  async down(): Promise<void> {
    this.addSql('drop table "user_sanction";');
    this.addSql('alter table "user" drop constraint "user_suspension_expiry_check", drop constraint "user_status_check", drop column "status", drop column "suspended_until", drop column "session_version";');
  }
}
