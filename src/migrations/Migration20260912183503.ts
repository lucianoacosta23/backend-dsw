import { Migration } from '@mikro-orm/migrations';

export class Migration20260912183503 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "release" ("id" serial primary key, "spotify_id" varchar(255) null, "name" varchar(255) not null, "type" text check ("type" in ('ALBUM', 'EP', 'SINGLE', 'MIXTAPE', 'COMPILATION')) not null, "description" text null, "image_url" text null, "release_date" varchar(10) not null, "release_date_precision" text check ("release_date_precision" in ('YEAR', 'MONTH', 'DAY')) not null);`);
    this.addSql(`alter table "release" add constraint "release_spotify_id_unique" unique ("spotify_id");`);

    this.addSql(`create table "release_artists" ("release_id" int not null, "artist_id" int not null, constraint "release_artists_pkey" primary key ("release_id", "artist_id"));`);

    this.addSql(`create table "release_genres" ("release_id" int not null, "genre_id" int not null, constraint "release_genres_pkey" primary key ("release_id", "genre_id"));`);

    this.addSql(`create table "track" ("id" serial primary key, "spotify_id" varchar(255) null, "name" varchar(255) not null, "duration_ms" int not null, "disc_number" int not null, "track_number" int not null, "explicit" boolean not null default false, "release_id" int not null);`);
    this.addSql(`alter table "track" add constraint "track_spotify_id_unique" unique ("spotify_id");`);

    this.addSql(`create table "track_artists" ("track_id" int not null, "artist_id" int not null, constraint "track_artists_pkey" primary key ("track_id", "artist_id"));`);

    this.addSql(`alter table "release_artists" add constraint "release_artists_release_id_foreign" foreign key ("release_id") references "release" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "release_artists" add constraint "release_artists_artist_id_foreign" foreign key ("artist_id") references "artist" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "release_genres" add constraint "release_genres_release_id_foreign" foreign key ("release_id") references "release" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "release_genres" add constraint "release_genres_genre_id_foreign" foreign key ("genre_id") references "genre" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "track" add constraint "track_release_id_foreign" foreign key ("release_id") references "release" ("id") on update cascade on delete restrict;`);

    this.addSql(`alter table "track_artists" add constraint "track_artists_track_id_foreign" foreign key ("track_id") references "track" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "track_artists" add constraint "track_artists_artist_id_foreign" foreign key ("artist_id") references "artist" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "release_artists" drop constraint "release_artists_release_id_foreign";`);

    this.addSql(`alter table "release_genres" drop constraint "release_genres_release_id_foreign";`);

    this.addSql(`alter table "track" drop constraint "track_release_id_foreign";`);

    this.addSql(`alter table "track_artists" drop constraint "track_artists_track_id_foreign";`);

    this.addSql(`drop table if exists "release" cascade;`);

    this.addSql(`drop table if exists "release_artists" cascade;`);

    this.addSql(`drop table if exists "release_genres" cascade;`);

    this.addSql(`drop table if exists "track" cascade;`);

    this.addSql(`drop table if exists "track_artists" cascade;`);
  }

}
