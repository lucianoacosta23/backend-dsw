import { Router } from 'express';

import {
  findAll,
  findById,
  create,
  update,
  remove,
} from './track.controller.js';

const trackRouter = Router();

trackRouter.get('/', findAll);
trackRouter.get('/:id', findById);
trackRouter.post('/', create);
trackRouter.patch('/:id', update);
trackRouter.delete('/:id', remove);

export default trackRouter;