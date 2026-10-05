import { Migration } from '@mikro-orm/migrations';

export class Migration20261004045335 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "playlist" ("id" serial primary key, "name" varchar(255) not null, "user_id" int not null);`);

    this.addSql(`create table "playlist_tracks" ("playlist_id" int not null, "track_id" int not null, constraint "playlist_tracks_pkey" primary key ("playlist_id", "track_id"));`);

    this.addSql(`alter table "playlist" add constraint "playlist_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;`);

    this.addSql(`alter table "playlist_tracks" add constraint "playlist_tracks_playlist_id_foreign" foreign key ("playlist_id") references "playlist" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "playlist_tracks" add constraint "playlist_tracks_track_id_foreign" foreign key ("track_id") references "track" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "playlist_tracks" drop constraint "playlist_tracks_playlist_id_foreign";`);

    this.addSql(`drop table if exists "playlist" cascade;`);

    this.addSql(`drop table if exists "playlist_tracks" cascade;`);
  }

}