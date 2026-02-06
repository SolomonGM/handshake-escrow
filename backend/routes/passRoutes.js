import express from 'express';
import {
  createPassOrder,
  getUserPassOrders,
  getPassOrder,
  cancelPassOrder,
  getPassTransactionHistory
} from '../controllers/passController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Create pass order
router.post('/create-order', createPassOrder);

// Cancel pass order
router.post('/cancel-order', cancelPassOrder);

// Get user's pass orders
router.get('/my-orders', getUserPassOrders);

// Get user's pass transaction history
router.get('/transactions', getPassTransactionHistory);

// Get single pass order by ID
router.get('/order/:orderId', getPassOrder);

export default router;
