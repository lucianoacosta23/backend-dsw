import { Migration } from '@mikro-orm/migrations';

export class Migration20260912135511 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "genre" ("id" serial primary key, "name" varchar(255) not null);`);
    this.addSql(`alter table "genre" add constraint "genre_name_unique" unique ("name");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "genre" cascade;`);
  }

}
