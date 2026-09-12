import { Migration } from '@mikro-orm/migrations';

export class Migration20260912182006 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "artist" add column "spotify_id" varchar(255) null;`);
    this.addSql(`alter table "artist" add constraint "artist_spotify_id_unique" unique ("spotify_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "artist" drop constraint "artist_spotify_id_unique";`);
    this.addSql(`alter table "artist" drop column "spotify_id";`);
  }

}
