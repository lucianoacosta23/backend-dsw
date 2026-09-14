import { Migration } from '@mikro-orm/migrations';

export class Migration20260914151327 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "release_artists" drop constraint "release_artists_artist_id_foreign";`);

    this.addSql(`alter table "release_genres" drop constraint "release_genres_genre_id_foreign";`);

    this.addSql(`alter table "track_artists" drop constraint "track_artists_artist_id_foreign";`);

    this.addSql(`alter table "release_artists" add constraint "release_artists_artist_id_foreign" foreign key ("artist_id") references "artist" ("id") on update cascade on delete restrict;`);

    this.addSql(`alter table "release_genres" add constraint "release_genres_genre_id_foreign" foreign key ("genre_id") references "genre" ("id") on update cascade on delete restrict;`);

    this.addSql(`alter table "track_artists" add constraint "track_artists_artist_id_foreign" foreign key ("artist_id") references "artist" ("id") on update cascade on delete restrict;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "release_artists" drop constraint "release_artists_artist_id_foreign";`);

    this.addSql(`alter table "release_genres" drop constraint "release_genres_genre_id_foreign";`);

    this.addSql(`alter table "track_artists" drop constraint "track_artists_artist_id_foreign";`);

    this.addSql(`alter table "release_artists" add constraint "release_artists_artist_id_foreign" foreign key ("artist_id") references "artist" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "release_genres" add constraint "release_genres_genre_id_foreign" foreign key ("genre_id") references "genre" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "track_artists" add constraint "track_artists_artist_id_foreign" foreign key ("artist_id") references "artist" ("id") on update cascade on delete cascade;`);
  }

}
