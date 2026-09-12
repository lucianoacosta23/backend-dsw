import { Router } from 'express';

import {
  findAll,
  findById,
  create,
  update,
  remove,
} from './genres.controller.js';

const genreRouter = Router();

genreRouter.get('/', findAll);
genreRouter.get('/:id', findById);
genreRouter.post('/', create);
genreRouter.patch('/:id', update);
genreRouter.delete('/:id', remove);

export default genreRouter;