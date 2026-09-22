import { Migration } from '@mikro-orm/migrations';

export class Migration20260922030000 extends Migration {
  override async up(): Promise<void> {
    // Review ya existe en Migration20260922000000. No se regeneran snapshots.
    this.addSql(`create table "comment" (
      "id" serial primary key,
      "review_id" int not null,
      "author_id" int not null,
      "parent_id" int null,
      "text" text not null,
      "created_at" timestamptz not null default current_timestamp,
      "edited_at" timestamptz null,
      "deleted_at" timestamptz null,
      constraint "comment_text_length_check" check (char_length(text) >= 1 and char_length(text) <= 2000),
      constraint "comment_parent_not_self_check" check (parent_id <> id),
      constraint "comment_review_id_foreign" foreign key ("review_id") references "review" ("id") on update cascade,
      constraint "comment_author_id_foreign" foreign key ("author_id") references "user" ("id") on update cascade,
      constraint "comment_parent_id_foreign" foreign key ("parent_id") references "comment" ("id") on update cascade
    );`);
    this.addSql('create index comment_visible_children_idx on comment (review_id, parent_id, created_at, id) where deleted_at is null;');
    this.addSql('create index comment_parent_idx on comment (parent_id);');
  }

  override async down(): Promise<void> {
    this.addSql('drop table "comment";');
  }
}
