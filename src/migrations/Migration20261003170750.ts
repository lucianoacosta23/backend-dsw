import { Migration } from '@mikro-orm/migrations';

export class Migration20261003170750 extends Migration {

override async up(): Promise<void> {
  this.addSql(`alter table "review" drop constraint review_rating_check;`);

  // Esta restricción pertenece a follow, no a review.
  this.addSql(
    `alter table "follow" add constraint follow_no_self_follow check (follower_id <> followed_id);`,
  );

  // Conserva 0.5 como rating válido.
  this.addSql(
    `alter table "review" add constraint review_rating_check check (rating in (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5));`,
  );
}

override async down(): Promise<void> {
  this.addSql(`alter table "follow" drop constraint follow_no_self_follow;`);
  this.addSql(`alter table "review" drop constraint review_rating_check;`);

  // Revierte al estado anterior a esta migración.
  this.addSql(
    `alter table "review" add constraint review_rating_check check (rating in (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5));`,
  );
}

}
