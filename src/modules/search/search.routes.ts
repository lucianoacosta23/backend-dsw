import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { searchAll } from './search.controller.js';
export const searchRouter = Router();
// Buscar requiere sesión, pero no modifica datos:
// por eso no necesita el header de mutaciones.
searchRouter.get('/', requireAuth, searchAll);
export default searchRouter;




