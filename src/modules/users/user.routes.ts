import { Router } from 'express';
import {
  findAll,
  findById,
  create,
  update,
  remove,
} from './user.controller.js';

const userRouter = Router();

userRouter.get('/', findAll);
userRouter.get('/:id', findById);
userRouter.post('/', create);
userRouter.patch('/:id', update);
userRouter.delete('/:id', remove);

export default userRouter;