import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware.js';
import { findActivity } from './activity.controller.js';

const activityRouter = Router();

// Es una consulta: requiere sesión, pero no header de mutaciones.
activityRouter.get('/', requireAuth, findActivity);

export default activityRouter;