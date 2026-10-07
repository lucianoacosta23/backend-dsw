import { Migration } from '@mikro-orm/migrations';

export class Migration20261007155428_add_playlist_saves extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "playlist_save" ("id" serial primary key, "user_id" int not null, "playlist_id" int not null, "created_at" timestamptz not null default current_timestamp);`);
    this.addSql(`create index "playlist_save_user_id_index" on "playlist_save" ("user_id");`);
    this.addSql(`alter table "playlist_save" add constraint "playlist_save_playlist_id_user_id_unique" unique ("playlist_id", "user_id");`);

    this.addSql(`alter table "playlist_save" add constraint "playlist_save_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "playlist_save" add constraint "playlist_save_playlist_id_foreign" foreign key ("playlist_id") references "playlist" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "playlist_save" cascade;`);
  }

}
