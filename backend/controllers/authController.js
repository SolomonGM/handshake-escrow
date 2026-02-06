import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { sendPasswordResetCode } from '../utils/email.js';

const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_RESET_ATTEMPTS = 5;

const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ 
        success: false,
        message: `${field} already exists` 
      });
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password
    });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        rank: user.rank,
        xp: user.xp,
        passes: user.passes,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide email and password' 
      });
    }

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid username or email. Please check your credentials and try again.' 
      });
    }

    // Check password
    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid password. Please check your credentials and try again.' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        rank: user.rank,
        xp: user.xp,
        passes: user.passes,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        rank: user.rank,
        xp: user.xp,
        passes: user.passes,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const { username, email, avatar } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if username or email is taken by another user
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ 
          success: false,
          message: 'Username already taken' 
        });
      }
      user.username = username;
    }

    // Prevent email changes for developer rank
    if (email && email !== user.email) {
      if (user.rank === 'developer') {
        return res.status(403).json({ 
          success: false,
          message: 'Email cannot be changed for developer accounts. Contact system administrator.' 
        });
      }
      
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          success: false,
          message: 'Email already taken' 
        });
      }
      user.email = email;
    }

    if (avatar) {
      user.avatar = avatar;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        rank: user.rank,
        xp: user.xp,
        passes: user.passes
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    next(error);
  }
};

// @desc    Get user profile by userId
// @route   GET /api/auth/profile/:userId
// @access  Private
export const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Find user by userId field
    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        userId: user.userId,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        rank: user.rank,
        badge: user.badge,
        xp: user.xp,
        passes: user.passes,
        totalUSDValue: user.totalUSDValue,
        totalDeals: user.totalDeals,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    next(error);
  }
};

// @desc    Request password reset code
// @route   POST /api/auth/forgot-password/request
// @access  Public
export const requestPasswordReset = async (req, res, next) => {
  try {
    const email = req.body.email?.toLowerCase().trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with that email'
      });
    }

    const now = Date.now();
    const lastSentAt = user.passwordReset?.lastSentAt
      ? new Date(user.passwordReset.lastSentAt).getTime()
      : null;

    if (lastSentAt && now - lastSentAt < RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds}s before requesting another code.`,
        cooldownSeconds: remainingSeconds
      });
    }

    const code = String(Math.floor(10000 + Math.random() * 90000));
    const codeHash = hashValue(code);

    user.passwordReset = {
      codeHash,
      expiresAt: new Date(now + RESET_CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(now),
      resetTokenHash: undefined,
      resetTokenExpiresAt: undefined
    };

    await user.save();

    try {
      const emailResult = await sendPasswordResetCode({ to: user.email, code });
      if (!emailResult?.sent) {
        console.warn('SMTP not configured. Password reset code was only logged for testing.');
      }
    } catch (emailError) {
      console.error('Password reset email failed:', emailError);
    }

    // Temporary: log code for local testing (remove in production)
    console.log(`[password reset] Code for ${user.email}: ${code}`);

    return res.status(200).json({
      success: true,
      message: 'Reset code sent',
      cooldownSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000)
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    next(error);
  }
};

// @desc    Verify password reset code
// @route   POST /api/auth/forgot-password/verify
// @access  Public
export const verifyPasswordResetCode = async (req, res, next) => {
  try {
    const email = req.body.email?.toLowerCase().trim();
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and code are required'
      });
    }

    const user = await User.findOne({ email });
    if (!user || !user.passwordReset?.codeHash) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired code'
      });
    }

    const now = Date.now();
    const expiresAt = user.passwordReset.expiresAt
      ? new Date(user.passwordReset.expiresAt).getTime()
      : null;

    if (expiresAt && expiresAt < now) {
      user.passwordReset.codeHash = undefined;
      user.passwordReset.expiresAt = undefined;
      user.passwordReset.attempts = 0;
      await user.save();

      return res.status(410).json({
        success: false,
        message: 'Code expired. Please request a new one.'
      });
    }

    if (user.passwordReset.attempts >= MAX_RESET_ATTEMPTS) {
      user.passwordReset.codeHash = undefined;
      user.passwordReset.expiresAt = undefined;
      user.passwordReset.attempts = 0;
      await user.save();

      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please request a new code.'
      });
    }

    const incomingHash = hashValue(code);
    if (incomingHash !== user.passwordReset.codeHash) {
      user.passwordReset.attempts = (user.passwordReset.attempts || 0) + 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid code. Please try again.',
        remainingAttempts: Math.max(MAX_RESET_ATTEMPTS - user.passwordReset.attempts, 0)
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordReset.resetTokenHash = hashValue(resetToken);
    user.passwordReset.resetTokenExpiresAt = new Date(now + RESET_TOKEN_TTL_MS);
    user.passwordReset.codeHash = undefined;
    user.passwordReset.expiresAt = undefined;
    user.passwordReset.attempts = 0;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Code verified',
      resetToken
    });
  } catch (error) {
    console.error('Verify password reset error:', error);
    next(error);
  }
};

// @desc    Reset password
// @route   POST /api/auth/forgot-password/reset
// @access  Public
export const resetPassword = async (req, res, next) => {
  try {
    const email = req.body.email?.toLowerCase().trim();
    const resetToken = String(req.body.resetToken || '').trim();
    const password = String(req.body.password || '');

    if (!email || !resetToken || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, reset token, and new password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.passwordReset?.resetTokenHash) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset session'
      });
    }

    const now = Date.now();
    const tokenExpiresAt = user.passwordReset.resetTokenExpiresAt
      ? new Date(user.passwordReset.resetTokenExpiresAt).getTime()
      : null;

    if (tokenExpiresAt && tokenExpiresAt < now) {
      user.passwordReset.resetTokenHash = undefined;
      user.passwordReset.resetTokenExpiresAt = undefined;
      await user.save();

      return res.status(410).json({
        success: false,
        message: 'Reset session expired. Please request a new code.'
      });
    }

    const incomingHash = hashValue(resetToken);
    if (incomingHash !== user.passwordReset.resetTokenHash) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset session'
      });
    }

    user.password = password;
    user.passwordReset = {
      codeHash: undefined,
      expiresAt: undefined,
      attempts: 0,
      lastSentAt: undefined,
      resetTokenHash: undefined,
      resetTokenExpiresAt: undefined
    };

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    next(error);
  }
};
