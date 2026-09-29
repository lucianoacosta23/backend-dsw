import { Migration } from '@mikro-orm/migrations';

export class Migration20260922000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "review" (
      "id" serial primary key,
      "author_id" int not null,
      "release_id" int not null,
      "text" text not null,
      "rating" numeric not null,
      "created_at" timestamptz not null default current_timestamp,
      "edited_at" timestamptz null,
      "deleted_at" timestamptz null,
      constraint "review_rating_check" check (rating = any (array[0.5,1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])),
      constraint "review_text_length_check" check (char_length(text) >= 1 and char_length(text) <= 2000),
      constraint "review_author_id_foreign" foreign key ("author_id") references "user" ("id") on update cascade,
      constraint "review_release_id_foreign" foreign key ("release_id") references "release" ("id") on update cascade
    );`);

    this.addSql('create index review_release_visible_idx on review (release_id, created_at desc, id desc) where deleted_at is null;');
    this.addSql('create index review_author_visible_idx on review (author_id, created_at desc, id desc) where deleted_at is null;');
    // Incluye borradas deliberadamente; no hay UNIQUE entre autor y lanzamiento.
    this.addSql('create index review_author_release_latest_idx on review (author_id, release_id, created_at desc, id desc);');
  }

  override async down(): Promise<void> {
    this.addSql('drop table "review";');
  }
}
