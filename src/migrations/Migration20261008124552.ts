import { Migration } from '@mikro-orm/migrations';

export class Migration20261008124552 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "review_revision" ("id" serial primary key, "review_id" int not null, "text" text null, "effective_at" timestamptz not null, "replaced_at" timestamptz not null, constraint review_revision_text_length_check check (text IS NULL OR (char_length(text) >= 1 AND char_length(text) <= 2000)));`);
    this.addSql(`create index "review_revision_review_id_replaced_at_index" on "review_revision" ("review_id", "replaced_at");`);

    this.addSql(`alter table "review_revision" add constraint "review_revision_review_id_foreign" foreign key ("review_id") references "review" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "review_revision" cascade;`);
  }

}
