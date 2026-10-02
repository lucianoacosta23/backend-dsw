import { Router } from 'express';
import { requireAuth, requireMutationHeader } from '../../middlewares/auth.middleware.js';
import { addLike, removeLike } from './like.controller.js';

// Se monta en /reviews/:reviewId/like. No lleva cuerpo: el usuario sale de la sesión.
const reviewLikeRouter = Router({ mergeParams: true });

reviewLikeRouter.put('/', requireAuth, requireMutationHeader, addLike);
reviewLikeRouter.delete('/', requireAuth, requireMutationHeader, removeLike);

export default reviewLikeRouter;
