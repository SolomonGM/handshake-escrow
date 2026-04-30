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

// This creates pass order.
router.post('/create-order', createPassOrder);

// This cancels pass order.
router.post('/cancel-order', cancelPassOrder);

// This gets user's pass orders.
router.get('/my-orders', getUserPassOrders);

// This gets user's pass transaction history.
router.get('/transactions', getPassTransactionHistory);

// This gets single pass order by ID.
router.get('/order/:orderId', getPassOrder);

export default router;
