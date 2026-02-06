import express from 'express';
import {
  createTradeRequest,
  getTradeRequests,
  getTradeRequest,
  deleteTradeRequest,
  toggleTradeRequest,
  updateTradeRequest,
  markAsSold
} from '../controllers/tradeRequestController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Create new trade request
router.post('/', createTradeRequest);

// Get all active trade requests
router.get('/', getTradeRequests);

// Get single trade request
router.get('/:requestId', getTradeRequest);

// Update trade request
router.put('/:requestId', updateTradeRequest);

// Delete trade request
router.delete('/:requestId', deleteTradeRequest);

// Toggle (pause/resume) trade request
router.patch('/:requestId/toggle', toggleTradeRequest);

// Mark trade request as sold
router.patch('/:requestId/mark-sold', markAsSold);

export default router;
