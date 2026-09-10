import { Migration } from '@mikro-orm/migrations';

export class Migration20260909232255 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "user" ("id" serial primary key, "username" varchar(255) not null, "full_name" varchar(255) not null, "email" varchar(255) not null, "category" varchar(255) not null, "spotify_id" varchar(255) not null, "created_at" timestamptz not null);`);
    this.addSql(`alter table "user" add constraint "user_spotify_id_unique" unique ("spotify_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "user" cascade;`);
  }

}
