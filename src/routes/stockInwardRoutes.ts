import { Router } from 'express';
import {
  recordStockInward,
  getAllStockInwards,
  getStockInwardById,
  deleteStockInward,
} from '../controllers/stockInwardController.js';

const router = Router();

router.post('/', recordStockInward);
router.get('/', getAllStockInwards);
router.get('/:id', getStockInwardById);
router.delete('/:id', deleteStockInward);

export default router;
