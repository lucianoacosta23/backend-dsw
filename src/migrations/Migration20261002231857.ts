import { Migration } from '@mikro-orm/migrations';

export class Migration20261002231857 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "review" drop constraint review_rating_check;`);

    this.addSql(`alter table "review" add column "track_id" int null;`);
    this.addSql(`alter table "review" alter column "release_id" type int using ("release_id"::int);`);
    this.addSql(`alter table "review" alter column "release_id" drop not null;`);
    this.addSql(`alter table "review" add constraint "review_track_id_foreign" foreign key ("track_id") references "track" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "review" add constraint review_exactly_one_target_check check((release_id IS NOT NULL) <> (track_id IS NOT NULL));`);
    this.addSql(`alter table "review" add constraint review_rating_check check(rating = any (array[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]));`);

    this.addSql(`alter table "follow" drop constraint follow_no_self_follow;`);
  }

override async down(): Promise<void> {
  this.addSql(
    `alter table "review" drop constraint "review_track_id_foreign";`,
  );
  this.addSql(
    `alter table "review" drop constraint "review_exactly_one_target_check";`,
  );
  this.addSql(
    `alter table "review" drop constraint "review_rating_check";`,
  );
  this.addSql(`alter table "review" drop column "track_id";`);
  this.addSql(
    `alter table "review" alter column "release_id" set not null;`,
  );
  this.addSql(
    `alter table "review" add constraint "review_rating_check" check (rating in (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5));`,
  );
  this.addSql(
    `alter table "follow" add constraint "follow_no_self_follow" check (follower_id <> followed_id);`,
  );
}

}
