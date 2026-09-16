import { Migration } from '@mikro-orm/migrations';

export class Migration20260916164746 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "user" alter column "email" type varchar(255) using ("email"::varchar(255));`);
    this.addSql(`alter table "user" alter column "email" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" alter column "email" type varchar(255) using ("email"::varchar(255));`);
    this.addSql(`alter table "user" alter column "email" set not null;`);
  }

}
