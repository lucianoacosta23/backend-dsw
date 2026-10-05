import { Router } from 'express';

import {
  requireAdmin,
  requireAuth,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';
import { listReports, moderateReport } from './report.controller.js';

const adminReportRouter = Router();

adminReportRouter.use(requireAuth, requireAdmin);

adminReportRouter.get('/', listReports);
adminReportRouter.patch('/:id', requireMutationHeader, moderateReport);

export default adminReportRouter;