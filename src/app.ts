import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import express from 'express';
import cors from 'cors';

import router from './routes/index.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use(router);
app.use(notFoundMiddleware);

app.use(errorMiddleware);
export default app;