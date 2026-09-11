import { Router } from 'express';

import {
  findAll,
  findById,
  create,
  update,
  remove,
} from './artist.controller.js';

const artistRouter = Router();

artistRouter.get('/', findAll);
artistRouter.get('/:id', findById);
artistRouter.post('/', create);
artistRouter.patch('/:id', update);
artistRouter.delete('/:id', remove);

export default artistRouter;