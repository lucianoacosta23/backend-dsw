import { Router } from 'express';
import { requireAuth, requireAdmin, requireMutationHeader } from '../../middlewares/auth.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import { listAdminUsers, getAdminUser, listUserSanctions, listUserReviewReports, createUserSanction } from './admin-user.controller.js';

const router = Router();
router.use(requireAuth, requireAdmin);
router.get('/', listAdminUsers);
router.get('/:id', getAdminUser);
router.get('/:id/sanctions', listUserSanctions);
router.get('/:id/review-reports', listUserReviewReports);
router.post('/:id/sanctions', requireMutationHeader, (req, _res, next) => {
  if (!req.is('application/json')) { next(new AppError('El cuerpo debe enviarse como application/json', 400)); return; }
  next();
}, createUserSanction);
export default router;
