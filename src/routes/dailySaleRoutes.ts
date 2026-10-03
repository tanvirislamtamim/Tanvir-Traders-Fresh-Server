import { Router } from 'express';
import {
  getDailySaleSheetByDate,
  saveDailySale,
  getAllDailySales,
  getDailySaleById,
  deleteDailySale,
} from '../controllers/dailySaleController.js';

const router = Router();

router.get('/sheet/:date', getDailySaleSheetByDate);
router.post('/save', saveDailySale);
router.get('/', getAllDailySales);
router.get('/:id', getDailySaleById);
router.delete('/:id', deleteDailySale);

export default router;
