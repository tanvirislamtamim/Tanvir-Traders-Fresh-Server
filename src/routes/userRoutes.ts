import { Router } from 'express';
import {
  syncOrGetUserRole,
  getAllUsers,
  updateUserRole,
  deleteUser,
} from '../controllers/userController.js';

const router = Router();

// Called after Firebase login to sync role from MongoDB
router.post('/sync', syncOrGetUserRole);

// Developer-only endpoints
router.get('/', getAllUsers);
router.patch('/:id/role', updateUserRole);
router.delete('/:id', deleteUser);

export default router;
