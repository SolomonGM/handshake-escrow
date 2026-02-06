import express from 'express';
import { 
  register, 
  login, 
  getMe, 
  updateProfile,
  getUserProfile,
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPassword
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password/request', requestPasswordReset);
router.post('/forgot-password/verify', verifyPasswordResetCode);
router.post('/forgot-password/reset', resetPassword);

// Protected routes (require authentication)
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.get('/profile/:userId', protect, getUserProfile);

export default router;
