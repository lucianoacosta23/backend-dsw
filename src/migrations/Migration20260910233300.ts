import { Migration } from '@mikro-orm/migrations';

export class Migration20260910233300 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "artist" ("id" serial primary key, "name" varchar(255) not null, "biography" text null, "image_url" text null);`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "artist" cascade;`);
  }

}
