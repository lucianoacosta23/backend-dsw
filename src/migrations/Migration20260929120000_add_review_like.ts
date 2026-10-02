import { Migration } from '@mikro-orm/migrations';

export class Migration20260929120000_add_review_like extends Migration {
  override async up(): Promise<void> {
    // No se regeneran snapshots, igual que en las migraciones anteriores.
    this.addSql(`create table "review_like" (
      "id" serial primary key,
      "user_id" int not null,
      "review_id" int not null,
      "created_at" timestamptz not null default current_timestamp,
      constraint "review_like_review_id_user_id_unique" unique ("review_id", "user_id"),
      constraint "review_like_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade,
      constraint "review_like_review_id_foreign" foreign key ("review_id") references "review" ("id") on update cascade on delete cascade
    );`);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "review_like";');
  }
}
