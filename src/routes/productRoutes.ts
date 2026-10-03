import { Router } from 'express';
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductPrice,
  batchUpdatePrices,
  resetAllStockToZero,
} from '../controllers/productController.js';

const router = Router();

router.get('/', getAllProducts);
router.post('/reset-all-stock', resetAllStockToZero);
router.get('/:id', getProductById);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.patch('/:id/price', updateProductPrice);
router.post('/batch-price-update', batchUpdatePrices);

export default router;

