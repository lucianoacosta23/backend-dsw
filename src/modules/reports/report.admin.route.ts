import { Router } from 'express';

import {
  requireAdmin,
  requireAuth,
  requireMutationHeader,
} from '../../middlewares/auth.middleware.js';
import { listReports, moderateReport, getCriticalReviews, getMinorReviews, getReviewReports, moderateReviewReports } from './report.controller.js';

const adminReportRouter = Router();

adminReportRouter.use(requireAuth, requireAdmin);

adminReportRouter.get('/', listReports);
adminReportRouter.patch('/:id', requireMutationHeader, moderateReport);
adminReportRouter.get('/critical', getCriticalReviews);
adminReportRouter.get('/minor', getMinorReviews);
adminReportRouter.get('/:reviewId/reviewreport', getReviewReports);
adminReportRouter.patch('/:reviewId/reviewreport',requireMutationHeader, moderateReviewReports )

export default adminReportRouter;
