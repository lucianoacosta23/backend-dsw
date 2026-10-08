import { Migration } from '@mikro-orm/migrations';

export class Migration20261007200000_profiles extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "profile_image" (
      "id" serial primary key, "owner_id" int null,
      "purpose" text not null check ("purpose" in ('avatar', 'cover')),
      "key" varchar(255) not null, "format" varchar(255) not null default 'webp',
      "width" int not null, "height" int not null, "created_at" timestamptz not null,
      constraint "profile_image_key_unique" unique ("key"),
      constraint "profile_image_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade on delete set null
    );`);
    this.addSql('create index "profile_image_owner_id_index" on "profile_image" ("owner_id");');
    this.addSql('create index "profile_image_created_at_index" on "profile_image" ("created_at");');
    this.addSql('alter table "user" add column "avatar_image_id" int null, add column "cover_image_id" int null;');
    this.addSql('alter table "user" add constraint "user_avatar_image_id_foreign" foreign key ("avatar_image_id") references "profile_image" ("id") on update cascade on delete set null;');
    this.addSql('alter table "user" add constraint "user_cover_image_id_foreign" foreign key ("cover_image_id") references "profile_image" ("id") on update cascade on delete set null;');
    for (const item of ['release', 'track']) {
      this.addSql(`create table "user_favorite_${item}" (
        "id" serial primary key, "user_id" int not null, "${item}_id" int not null, "position" int not null,
        constraint "favorite_${item}_position_check" check (position between 1 and 5),
        constraint "user_favorite_${item}_user_id_${item}_id_unique" unique ("user_id", "${item}_id"),
        constraint "user_favorite_${item}_user_id_position_unique" unique ("user_id", "position"),
        constraint "user_favorite_${item}_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade,
        constraint "user_favorite_${item}_${item}_id_foreign" foreign key ("${item}_id") references "${item}" ("id") on update cascade on delete cascade
      );`);
      this.addSql(`create index "user_favorite_${item}_${item}_id_index" on "user_favorite_${item}" ("${item}_id");`);
    }
    // Abarca tanto la edición manual como la importación Spotify, dentro de la
    // transacción que cambia el catálogo. La API toma FOR SHARE al asignar.
    this.addSql(`create function remove_single_favorites() returns trigger language plpgsql as $$
      begin
        if NEW.type = 'SINGLE' then
          delete from user_favorite_release where release_id = NEW.id;
        end if;
        return NEW;
      end;
    $$;`);
    this.addSql(`create trigger release_single_favorites after update of type on "release"
      for each row execute function remove_single_favorites();`);
  }
  override async down(): Promise<void> {
    this.addSql('drop trigger if exists release_single_favorites on "release";');
    this.addSql('drop function if exists remove_single_favorites();');
    this.addSql('drop table "user_favorite_track";');
    this.addSql('drop table "user_favorite_release";');
    this.addSql('alter table "user" drop column "avatar_image_id", drop column "cover_image_id";');
    this.addSql('drop table "profile_image";');
  }
}
