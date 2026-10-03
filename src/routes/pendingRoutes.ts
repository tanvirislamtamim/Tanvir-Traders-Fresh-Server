import { Router } from 'express';
import {
  getPendingActions,
  getPendingActionById,
  approvePendingAction,
  rejectPendingAction,
} from '../controllers/pendingController.js';

const router = Router();

router.get('/', getPendingActions);
router.get('/:id', getPendingActionById);
router.post('/:id/approve', approvePendingAction);
router.post('/:id/reject', rejectPendingAction);

export default router;
