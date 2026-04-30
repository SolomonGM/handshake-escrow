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

// This creates new trade request.
router.post('/', createTradeRequest);

// This gets all active trade requests.
router.get('/', getTradeRequests);

// This gets single trade request.
router.get('/:requestId', getTradeRequest);

// This updates trade request.
router.put('/:requestId', updateTradeRequest);

// This deletes trade request.
router.delete('/:requestId', deleteTradeRequest);

// This toggles (pause/resume) trade request.
router.patch('/:requestId/toggle', toggleTradeRequest);

// This marks trade request as sold.
router.patch('/:requestId/mark-sold', markAsSold);

export default router;
