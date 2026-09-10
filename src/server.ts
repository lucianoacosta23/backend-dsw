import 'dotenv/config';
import { MikroORM } from '@mikro-orm/postgresql';

import createApp from './app.js';
import config from './config/mikro-orm.config.js';

const PORT = process.env.PORT ?? 3000;

async function startServer() {
  const orm = await MikroORM.init(config);

  console.log('Conexión a PostgreSQL inicializada');

  const app = createApp(orm);

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error: unknown) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});