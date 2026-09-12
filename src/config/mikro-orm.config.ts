import 'dotenv/config';
import { defineConfig } from '@mikro-orm/postgresql';
import { User } from '../modules/users/user.entity.js';
import { Artist } from '../modules/artists/artist.entity.js';
import { Genre } from '../modules/genres/genres.entity.js';
import { Release } from '../modules/releases/release.entity.js';
import { Track } from '../modules/tracks/track.entity.js';
import { Migrator } from '@mikro-orm/migrations';

const dbConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  dbName: process.env.DB_NAME ?? 'postgres',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
};

export default defineConfig({
  entities: [User, Artist, Genre, Release, Track],
  extensions: [Migrator],
  ...dbConfig,

  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
  },
});