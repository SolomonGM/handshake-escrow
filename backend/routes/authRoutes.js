import express from 'express';
import rateLimit from 'express-rate-limit';
import { 
  register, 
  login, 
  verifyLoginTwoFactorCode,
  resendLoginTwoFactorCode,
  getMe, 
  updateProfile,
  getUserProfile,
  requestTwoFactorCode,
  verifyTwoFactorCode,
  disableTwoFactor,
  requestEmailChangeCurrentCode,
  resendEmailChangeCurrentCode,
  verifyEmailChangeCurrentCode,
  resendEmailChangeNewCode,
  verifyEmailChangeNewCode,
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPassword
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

const createLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message
  }
});

const registerLimiter = createLimiter(
  15 * 60 * 1000,
  20,
  'Too many account creation attempts. Please try again in 15 minutes.'
);

const loginLimiter = createLimiter(
  15 * 60 * 1000,
  15,
  'Too many login attempts. Please try again in 15 minutes.'
);

const loginTwoFactorVerifyLimiter = createLimiter(
  10 * 60 * 1000,
  20,
  'Too many two-factor login attempts. Please try again in 10 minutes.'
);

const loginTwoFactorResendLimiter = createLimiter(
  10 * 60 * 1000,
  10,
  'Too many two-factor resend attempts. Please try again in 10 minutes.'
);

const passwordResetRequestLimiter = createLimiter(
  15 * 60 * 1000,
  8,
  'Too many password reset requests. Please try again in 15 minutes.'
);

const passwordResetVerifyLimiter = createLimiter(
  10 * 60 * 1000,
  20,
  'Too many code verification attempts. Please try again in 10 minutes.'
);

const twoFactorRequestLimiter = createLimiter(
  10 * 60 * 1000,
  10,
  'Too many two-factor code requests. Please try again in 10 minutes.'
);

const twoFactorVerifyLimiter = createLimiter(
  10 * 60 * 1000,
  20,
  'Too many two-factor verification attempts. Please try again in 10 minutes.'
);

const emailChangeRequestLimiter = createLimiter(
  10 * 60 * 1000,
  12,
  'Too many email verification requests. Please try again in 10 minutes.'
);

const emailChangeVerifyLimiter = createLimiter(
  10 * 60 * 1000,
  25,
  'Too many email verification attempts. Please try again in 10 minutes.'
);

// Public routes
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/login/2fa/verify', loginTwoFactorVerifyLimiter, verifyLoginTwoFactorCode);
router.post('/login/2fa/resend', loginTwoFactorResendLimiter, resendLoginTwoFactorCode);
router.post('/forgot-password/request', passwordResetRequestLimiter, requestPasswordReset);
router.post('/forgot-password/verify', passwordResetVerifyLimiter, verifyPasswordResetCode);
router.post('/forgot-password/reset', passwordResetVerifyLimiter, resetPassword);

// Protected routes (require authentication)
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.get('/profile/:userId', protect, getUserProfile);
router.post('/2fa/request', twoFactorRequestLimiter, protect, requestTwoFactorCode);
router.post('/2fa/verify', twoFactorVerifyLimiter, protect, verifyTwoFactorCode);
router.post('/2fa/disable', twoFactorRequestLimiter, protect, disableTwoFactor);
router.post('/email-change/request-current', emailChangeRequestLimiter, protect, requestEmailChangeCurrentCode);
router.post('/email-change/resend-current', emailChangeRequestLimiter, protect, resendEmailChangeCurrentCode);
router.post('/email-change/verify-current', emailChangeVerifyLimiter, protect, verifyEmailChangeCurrentCode);
router.post('/email-change/resend-new', emailChangeRequestLimiter, protect, resendEmailChangeNewCode);
router.post('/email-change/verify-new', emailChangeVerifyLimiter, protect, verifyEmailChangeNewCode);

export default router;
