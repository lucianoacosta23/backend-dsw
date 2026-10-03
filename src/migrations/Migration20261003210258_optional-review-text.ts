import { Migration } from '@mikro-orm/migrations';

export class Migration20261003210258_optional_review_text extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "review" drop constraint review_text_length_check;`);

    this.addSql(`alter table "review" alter column "text" type text using ("text"::text);`);
    this.addSql(`alter table "review" alter column "text" drop not null;`);
    this.addSql(`alter table "review" add constraint review_text_length_check check(text IS NULL OR (char_length(text) >= 1 AND char_length(text) <= 2000));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "review" drop constraint review_text_length_check;`);

    this.addSql(`alter table "review" alter column "text" type text using ("text"::text);`);
    this.addSql(`alter table "review" alter column "text" set not null;`);
    this.addSql(`alter table "review" add constraint review_text_length_check check((char_length(text) >= 1) AND (char_length(text) <= 2000));`);
  }

}
