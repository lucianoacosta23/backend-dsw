import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

const PgSessionStore = connectPgSimple(session);

function createLocalSessionStore() {
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = Number(process.env.DB_PORT ?? 5432);

  if (!database || !user || password === undefined) {
    throw new Error(
      'Faltan DB_NAME, DB_USER o DB_PASSWORD en el .env',
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT no es válido');
  }

  return new PgSessionStore({
    conObject: {
      host: process.env.DB_HOST ?? 'localhost',
      port,
      database,
      user,
      password,
    },
    pruneSessionInterval: 60,
    tableName: 'session',
    createTableIfMissing: false,
  });
}

export function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET debe tener al menos 32 caracteres',
    );
  }

  const connectionString =
    process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;

  const store = connectionString
    ? new PgSessionStore({
        conString: connectionString,
        pruneSessionInterval: 60,
        tableName: 'session',
        createTableIfMissing: false,
      })
    : createLocalSessionStore();
console.log('[SESSION DEBUG]', {
  nodeEnv: process.env.NODE_ENV,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
});
  return session({
    name: 'jukeboxd.sid',
    secret,
    store,
    resave: false,
    saveUninitialized: false,
cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 1000 * 60 * 30,
  path: '/',
},
  });
}