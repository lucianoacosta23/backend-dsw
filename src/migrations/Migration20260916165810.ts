import { Migration } from '@mikro-orm/migrations';

export class Migration20260916165810 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "user" add column "password_hash" varchar(255) null;`);
    this.addSql(`alter table "user" alter column "spotify_id" type varchar(255) using ("spotify_id"::varchar(255));`);
    this.addSql(`alter table "user" alter column "spotify_id" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column "password_hash";`);

    this.addSql(`alter table "user" alter column "spotify_id" type varchar(255) using ("spotify_id"::varchar(255));`);
    this.addSql(`alter table "user" alter column "spotify_id" set not null;`);
  }

}
