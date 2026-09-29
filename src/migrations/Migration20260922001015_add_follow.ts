import { Migration } from '@mikro-orm/migrations';

export class Migration20260922001015_add_follow extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      create table "follow" (
        "id" serial primary key,
        "follower_id" int not null,
        "followed_id" int not null,
        "created_at" timestamptz not null
      );
    `);

    this.addSql(`
      alter table "follow"
      add constraint "follow_follower_id_followed_id_unique"
      unique ("follower_id", "followed_id");
    `);

    this.addSql(`
      alter table "follow"
      add constraint "follow_follower_id_foreign"
      foreign key ("follower_id")
      references "user" ("id")
      on update cascade
      on delete cascade;
    `);

    this.addSql(`
      alter table "follow"
      add constraint "follow_followed_id_foreign"
      foreign key ("followed_id")
      references "user" ("id")
      on update cascade
      on delete cascade;
    `);

    this.addSql(`
      alter table "follow"
      add constraint "follow_no_self_follow"
      check ("follower_id" <> "followed_id");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop table if exists "follow" cascade;
    `);
  }

}
