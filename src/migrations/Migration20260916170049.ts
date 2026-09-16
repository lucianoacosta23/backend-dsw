import { Migration } from '@mikro-orm/migrations';

export class Migration20260916170049 extends Migration {

  override async up(): Promise<void> {this.addSql(
  `update "user" set "email" = lower(trim("email")) where "email" is not null;`,
);
    this.addSql(`alter table "user" add constraint "user_email_unique" unique ("email");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop constraint "user_email_unique";`);
  }

}
