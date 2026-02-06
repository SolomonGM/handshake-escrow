import express from 'express';
import { 
  getAllUsers, 
  updateUserRank, 
  updateUserRole, 
  updateUserXP,
  updateUserPasses, 
  updateUserTotalUSDValue,
  updateUserTotalDeals,
  deleteUser,
  getSiteStats,
  getTradeRequests,
  updateTradeRequest,
  deleteTradeRequest
} from '../controllers/adminController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected and require developer rank
router.get('/users', protect, getAllUsers);
router.get('/stats', protect, getSiteStats);
router.put('/users/rank', protect, updateUserRank);
router.put('/users/role', protect, updateUserRole);
router.put('/users/xp', protect, updateUserXP);
router.put('/users/passes', protect, updateUserPasses);
router.put('/users/total-usd', protect, updateUserTotalUSDValue);
router.put('/users/total-deals', protect, updateUserTotalDeals);
router.delete('/users/:userId', protect, deleteUser);
router.get('/trade-requests', protect, getTradeRequests);
router.put('/trade-requests/:requestId', protect, updateTradeRequest);
router.delete('/trade-requests/:requestId', protect, deleteTradeRequest);

export default router;
