import express from 'express';
import cors from 'cors';
import { RequestContext } from '@mikro-orm/core';
import type { MikroORM } from '@mikro-orm/postgresql';

import router from './routes/index.js';
import { createSessionMiddleware } from './config/session.config.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';

export default function createApp(orm: MikroORM) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use(createSessionMiddleware());

  app.use((_req, _res, next) => {
    RequestContext.create(orm.em, next);
  });

  app.use(router);
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}