import { Router } from 'express';
import { getMonthlyReport, getDashboardSummary } from '../controllers/reportController.js';

const router = Router();

router.get('/monthly', getMonthlyReport);
router.get('/dashboard', getDashboardSummary);

export default router;
