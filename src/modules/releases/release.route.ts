import { Router } from 'express';

import {
  findAll,
  findById,
  create,
  update,
  remove,
} from './release.controller.js';

const releaseRouter = Router();

releaseRouter.get('/', findAll);
releaseRouter.get('/:id', findById);
releaseRouter.post('/', create);
releaseRouter.patch('/:id', update);
releaseRouter.delete('/:id', remove);

export default releaseRouter;