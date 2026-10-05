//importamos las funciones de expres para vincular la ruta
import { Router } from 'express';
//importamos las validaciones de seguridad
import {
  requireAuth,
  requireAdmin,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';

//traemos las funciones del controlador

import {searchAll } from './search.controller.js';

//constante de vinculacion
export const searchRouter = Router();

// Define la ruta GET para el buscador
searchRouter.get('/', requireAuth, requireMutationHeader, searchAll);


export default searchRouter;