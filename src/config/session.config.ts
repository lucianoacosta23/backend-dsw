import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

const PgSessionStore = connectPgSimple(session);

export function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET debe tener al menos 32 caracteres',
    );
  }

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

  const store = new PgSessionStore({
    conObject: {
      host: process.env.DB_HOST ?? 'localhost',
      port,
      database,
      user,
      password,
    },
    tableName: 'session',
    createTableIfMissing: false,
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
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24,
      path: '/',
    },
  });
}