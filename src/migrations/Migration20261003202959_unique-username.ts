import { Migration } from '@mikro-orm/migrations';

export class Migration20261003202959_unique_username extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "user" add constraint "user_username_unique" unique ("username");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "user" drop constraint "user_username_unique";`,
    );
  }
}