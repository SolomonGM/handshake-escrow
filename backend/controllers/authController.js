import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { sendPasswordResetCode, sendTwoFactorCode } from '../utils/email.js';
import {
  USERNAME_RULES,
  buildUsernameExistsQuery,
  getDuplicateKeyField,
  isMongoDuplicateKeyError,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  normalizeUsername
} from '../utils/authValidation.js';

const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_RESET_ATTEMPTS = 5;
const TWO_FACTOR_CODE_TTL_MS = 10 * 60 * 1000;
const TWO_FACTOR_RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_TWO_FACTOR_ATTEMPTS = 5;
const LOGIN_TWO_FACTOR_SESSION_TTL_MS = 10 * 60 * 1000;

const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isProduction = process.env.NODE_ENV === 'production';
const buildSecurityCode = () => String(Math.floor(10000 + Math.random() * 90000));
const buildSessionToken = () => crypto.randomBytes(32).toString('hex');

const buildAuthUserPayload = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  avatar: user.avatar,
  role: user.role,
  rank: user.rank,
  xp: user.xp,
  passes: user.passes,
  twoFactorEnabled: Boolean(user.twoFactor?.enabled),
  createdAt: user.createdAt,
  lastLogin: user.lastLogin
});

const handleCodeDeliveryResult = async ({
  emailResult,
  code,
  emailAddress,
  contextLabel,
  cleanup
}) => {
  if (emailResult?.sent) {
    return { ok: true };
  }

  const reason = emailResult?.reason || 'unknown';
  console.warn(`[${contextLabel}] email delivery failed: ${reason}`);

  if (isProduction) {
    if (typeof cleanup === 'function') {
      await cleanup();
    }

    return {
      ok: false,
      statusCode: 503,
      message: `Unable to send ${contextLabel} code right now. Please try again later.`
    };
  }

  console.log(`[${contextLabel}][dev] Code for ${emailAddress}: ${code}`);
  return { ok: true };
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message: USERNAME_RULES.invalidMessage
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const [existingEmail, existingUsername] = await Promise.all([
      User.findOne({ email }).select('_id'),
      User.findOne(buildUsernameExistsQuery(username)).select('_id')
    ]);

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    if (existingUsername) {
      return res.status(409).json({
        success: false,
        message: 'Username already exists'
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
      user: buildAuthUserPayload(user)
    });
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      const field = getDuplicateKeyField(error);
      const duplicateMessage = field === 'email'
        ? 'Email already exists'
        : 'Username already exists';

      return res.status(409).json({
        success: false,
        message: duplicateMessage
      });
    }

    console.error('Register error:', error);
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

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

    if (user.twoFactor?.enabled) {
      const now = Date.now();
      const code = buildSecurityCode();
      const loginSessionToken = buildSessionToken();
      user.twoFactor.codeHash = hashValue(code);
      user.twoFactor.expiresAt = new Date(now + TWO_FACTOR_CODE_TTL_MS);
      user.twoFactor.attempts = 0;
      user.twoFactor.lastSentAt = new Date(now);
      user.twoFactor.loginSessionTokenHash = hashValue(loginSessionToken);
      user.twoFactor.loginSessionTokenExpiresAt = new Date(now + LOGIN_TWO_FACTOR_SESSION_TTL_MS);
      await user.save();

      let emailResult = null;
      try {
        emailResult = await sendTwoFactorCode({ to: user.email, code });
      } catch (emailError) {
        console.error('Login 2FA email failed:', emailError);
        emailResult = {
          sent: false,
          reason: 'login_two_factor_send_exception',
          error: emailError
        };
      }

      const deliveryStatus = await handleCodeDeliveryResult({
        emailResult,
        code,
        emailAddress: user.email,
        contextLabel: 'login-two-factor',
        cleanup: async () => {
          user.twoFactor.codeHash = undefined;
          user.twoFactor.expiresAt = undefined;
          user.twoFactor.attempts = 0;
          user.twoFactor.lastSentAt = undefined;
          user.twoFactor.loginSessionTokenHash = undefined;
          user.twoFactor.loginSessionTokenExpiresAt = undefined;
          await user.save();
        }
      });

      if (!deliveryStatus.ok) {
        return res.status(deliveryStatus.statusCode).json({
          success: false,
          message: deliveryStatus.message
        });
      }

      return res.status(200).json({
        success: true,
        requiresTwoFactor: true,
        message: 'Two-factor code sent',
        email: user.email,
        loginSessionToken,
        cooldownSeconds: Math.ceil(TWO_FACTOR_RESEND_COOLDOWN_MS / 1000),
        expiresInSeconds: Math.ceil(TWO_FACTOR_CODE_TTL_MS / 1000)
      });
    }

    // Update last login for non-2FA flow
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: buildAuthUserPayload(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

// @desc    Verify login 2FA code and issue auth token
// @route   POST /api/auth/login/2fa/verify
// @access  Public
export const verifyLoginTwoFactorCode = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const loginSessionToken = String(req.body.loginSessionToken || '').trim();

    if (!email || !code || !loginSessionToken) {
      return res.status(400).json({
        success: false,
        message: 'Email, login session token, and code are required'
      });
    }

    if (!/^\d{5}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the 5-digit code'
      });
    }

    const user = await User.findOne({ email });
    if (
      !user ||
      !user.twoFactor?.enabled ||
      !user.twoFactor?.codeHash ||
      !user.twoFactor?.loginSessionTokenHash
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification session'
      });
    }

    const now = Date.now();
    const sessionExpiresAt = user.twoFactor.loginSessionTokenExpiresAt
      ? new Date(user.twoFactor.loginSessionTokenExpiresAt).getTime()
      : null;
    const codeExpiresAt = user.twoFactor.expiresAt
      ? new Date(user.twoFactor.expiresAt).getTime()
      : null;

    if ((sessionExpiresAt && sessionExpiresAt < now) || (codeExpiresAt && codeExpiresAt < now)) {
      user.twoFactor.codeHash = undefined;
      user.twoFactor.expiresAt = undefined;
      user.twoFactor.attempts = 0;
      user.twoFactor.lastSentAt = undefined;
      user.twoFactor.loginSessionTokenHash = undefined;
      user.twoFactor.loginSessionTokenExpiresAt = undefined;
      await user.save();

      return res.status(410).json({
        success: false,
        message: 'Verification session expired. Please sign in again.'
      });
    }

    const incomingSessionHash = hashValue(loginSessionToken);
    if (incomingSessionHash !== user.twoFactor.loginSessionTokenHash) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification session'
      });
    }

    if ((user.twoFactor.attempts || 0) >= MAX_TWO_FACTOR_ATTEMPTS) {
      user.twoFactor.codeHash = undefined;
      user.twoFactor.expiresAt = undefined;
      user.twoFactor.attempts = 0;
      user.twoFactor.lastSentAt = undefined;
      user.twoFactor.loginSessionTokenHash = undefined;
      user.twoFactor.loginSessionTokenExpiresAt = undefined;
      await user.save();

      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please sign in again.'
      });
    }

    const incomingCodeHash = hashValue(code);
    if (incomingCodeHash !== user.twoFactor.codeHash) {
      user.twoFactor.attempts = (user.twoFactor.attempts || 0) + 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid code. Please try again.',
        remainingAttempts: Math.max(MAX_TWO_FACTOR_ATTEMPTS - user.twoFactor.attempts, 0)
      });
    }

    user.lastLogin = new Date(now);
    user.twoFactor.codeHash = undefined;
    user.twoFactor.expiresAt = undefined;
    user.twoFactor.attempts = 0;
    user.twoFactor.lastSentAt = undefined;
    user.twoFactor.loginSessionTokenHash = undefined;
    user.twoFactor.loginSessionTokenExpiresAt = undefined;
    await user.save();

    const token = generateToken(user._id);
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: buildAuthUserPayload(user)
    });
  } catch (error) {
    console.error('Verify login two-factor code error:', error);
    next(error);
  }
};

// @desc    Resend login 2FA code
// @route   POST /api/auth/login/2fa/resend
// @access  Public
export const resendLoginTwoFactorCode = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const loginSessionToken = String(req.body.loginSessionToken || '').trim();

    if (!email || !loginSessionToken) {
      return res.status(400).json({
        success: false,
        message: 'Email and login session token are required'
      });
    }

    const user = await User.findOne({ email });
    if (
      !user ||
      !user.twoFactor?.enabled ||
      !user.twoFactor?.loginSessionTokenHash ||
      !user.twoFactor?.loginSessionTokenExpiresAt
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification session'
      });
    }

    const now = Date.now();
    const sessionExpiresAt = new Date(user.twoFactor.loginSessionTokenExpiresAt).getTime();
    if (sessionExpiresAt < now || hashValue(loginSessionToken) !== user.twoFactor.loginSessionTokenHash) {
      user.twoFactor.codeHash = undefined;
      user.twoFactor.expiresAt = undefined;
      user.twoFactor.attempts = 0;
      user.twoFactor.lastSentAt = undefined;
      user.twoFactor.loginSessionTokenHash = undefined;
      user.twoFactor.loginSessionTokenExpiresAt = undefined;
      await user.save();

      return res.status(410).json({
        success: false,
        message: 'Verification session expired. Please sign in again.'
      });
    }

    const lastSentAt = user.twoFactor?.lastSentAt
      ? new Date(user.twoFactor.lastSentAt).getTime()
      : null;

    if (lastSentAt && now - lastSentAt < TWO_FACTOR_RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((TWO_FACTOR_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds}s before requesting another code.`,
        cooldownSeconds: remainingSeconds
      });
    }

    const code = buildSecurityCode();
    user.twoFactor.codeHash = hashValue(code);
    user.twoFactor.expiresAt = new Date(now + TWO_FACTOR_CODE_TTL_MS);
    user.twoFactor.attempts = 0;
    user.twoFactor.lastSentAt = new Date(now);
    await user.save();

    let emailResult = null;
    try {
      emailResult = await sendTwoFactorCode({ to: user.email, code });
    } catch (emailError) {
      console.error('Resend login 2FA email failed:', emailError);
      emailResult = {
        sent: false,
        reason: 'resend_login_two_factor_send_exception',
        error: emailError
      };
    }

    const deliveryStatus = await handleCodeDeliveryResult({
      emailResult,
      code,
      emailAddress: user.email,
      contextLabel: 'login-two-factor-resend',
      cleanup: async () => {
        user.twoFactor.codeHash = undefined;
        user.twoFactor.expiresAt = undefined;
        user.twoFactor.attempts = 0;
        user.twoFactor.lastSentAt = undefined;
        user.twoFactor.loginSessionTokenHash = undefined;
        user.twoFactor.loginSessionTokenExpiresAt = undefined;
        await user.save();
      }
    });

    if (!deliveryStatus.ok) {
      return res.status(deliveryStatus.statusCode).json({
        success: false,
        message: deliveryStatus.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification code sent',
      cooldownSeconds: Math.ceil(TWO_FACTOR_RESEND_COOLDOWN_MS / 1000),
      expiresInSeconds: Math.ceil(TWO_FACTOR_CODE_TTL_MS / 1000)
    });
  } catch (error) {
    console.error('Resend login two-factor code error:', error);
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
        twoFactorEnabled: Boolean(user.twoFactor?.enabled),
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
    const { avatar } = req.body;
    const incomingUsername = req.body.username;
    const incomingEmail = req.body.email;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if username or email is taken by another user
    if (typeof incomingUsername === 'string' && incomingUsername.trim()) {
      const normalizedUsername = normalizeUsername(incomingUsername);

      if (!isValidUsername(normalizedUsername)) {
        return res.status(400).json({ 
          success: false,
          message: USERNAME_RULES.invalidMessage
        });
      }

      if (normalizedUsername !== user.username) {
        const existingUser = await User.findOne({
          _id: { $ne: user._id },
          ...buildUsernameExistsQuery(normalizedUsername)
        }).select('_id');

        if (existingUser) {
          return res.status(409).json({ 
            success: false,
            message: 'Username already exists' 
          });
        }

        user.username = normalizedUsername;
      }
    }

    // Prevent email changes for developer rank
    if (typeof incomingEmail === 'string' && incomingEmail.trim()) {
      const normalizedEmail = normalizeEmail(incomingEmail);

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid email address'
        });
      }

      if (normalizedEmail !== user.email) {
        if (user.rank === 'developer') {
          return res.status(403).json({ 
            success: false,
            message: 'Email cannot be changed for developer accounts. Contact system administrator.' 
          });
        }
        
        const existingUser = await User.findOne({
          _id: { $ne: user._id },
          email: normalizedEmail
        }).select('_id');

        if (existingUser) {
          return res.status(409).json({ 
            success: false,
            message: 'Email already exists' 
          });
        }
        user.email = normalizedEmail;
      }
    }

    if (avatar) {
      user.avatar = avatar;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: buildAuthUserPayload(user)
    });
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      const field = getDuplicateKeyField(error);
      const duplicateMessage = field === 'email'
        ? 'Email already exists'
        : 'Username already exists';

      return res.status(409).json({
        success: false,
        message: duplicateMessage
      });
    }

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

// @desc    Request email 2FA code
// @route   POST /api/auth/2fa/request
// @access  Private
export const requestTwoFactorCode = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const now = Date.now();
    const lastSentAt = user.twoFactor?.lastSentAt
      ? new Date(user.twoFactor.lastSentAt).getTime()
      : null;

    if (lastSentAt && now - lastSentAt < TWO_FACTOR_RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((TWO_FACTOR_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds}s before requesting another code.`,
        cooldownSeconds: remainingSeconds
      });
    }

    const wasEnabled = Boolean(user.twoFactor?.enabled);
    const code = buildSecurityCode();

    user.twoFactor = {
      enabled: wasEnabled,
      codeHash: hashValue(code),
      expiresAt: new Date(now + TWO_FACTOR_CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(now),
      verifiedAt: user.twoFactor?.verifiedAt
    };
    await user.save();

    let emailResult = null;
    try {
      emailResult = await sendTwoFactorCode({ to: user.email, code });
    } catch (emailError) {
      console.error('2FA email failed:', emailError);
      emailResult = {
        sent: false,
        reason: 'two_factor_send_exception',
        error: emailError
      };
    }

    const deliveryStatus = await handleCodeDeliveryResult({
      emailResult,
      code,
      emailAddress: user.email,
      contextLabel: 'two-factor',
      cleanup: async () => {
        user.twoFactor.codeHash = undefined;
        user.twoFactor.expiresAt = undefined;
        user.twoFactor.attempts = 0;
        user.twoFactor.lastSentAt = undefined;
        await user.save();
      }
    });

    if (!deliveryStatus.ok) {
      return res.status(deliveryStatus.statusCode).json({
        success: false,
        message: deliveryStatus.message
      });
    }

    return res.status(200).json({
      success: true,
      message: wasEnabled
        ? 'Verification code sent'
        : 'Two-factor setup code sent',
      cooldownSeconds: Math.ceil(TWO_FACTOR_RESEND_COOLDOWN_MS / 1000),
      expiresInSeconds: Math.ceil(TWO_FACTOR_CODE_TTL_MS / 1000)
    });
  } catch (error) {
    console.error('Request two-factor code error:', error);
    next(error);
  }
};

// @desc    Verify email 2FA code (enables 2FA if not enabled)
// @route   POST /api/auth/2fa/verify
// @access  Private
export const verifyTwoFactorCode = async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim();
    if (!code || !/^\d{5}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the 5-digit code'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.twoFactor?.codeHash) {
      return res.status(400).json({
        success: false,
        message: 'No active verification code. Please request a new code.'
      });
    }

    const now = Date.now();
    const expiresAt = user.twoFactor.expiresAt
      ? new Date(user.twoFactor.expiresAt).getTime()
      : null;

    if (expiresAt && expiresAt < now) {
      user.twoFactor.codeHash = undefined;
      user.twoFactor.expiresAt = undefined;
      user.twoFactor.attempts = 0;
      user.twoFactor.loginSessionTokenHash = undefined;
      user.twoFactor.loginSessionTokenExpiresAt = undefined;
      await user.save();

      return res.status(410).json({
        success: false,
        message: 'Code expired. Please request a new one.'
      });
    }

    if ((user.twoFactor.attempts || 0) >= MAX_TWO_FACTOR_ATTEMPTS) {
      user.twoFactor.codeHash = undefined;
      user.twoFactor.expiresAt = undefined;
      user.twoFactor.attempts = 0;
      user.twoFactor.loginSessionTokenHash = undefined;
      user.twoFactor.loginSessionTokenExpiresAt = undefined;
      await user.save();

      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Please request a new code.'
      });
    }

    const incomingHash = hashValue(code);
    if (incomingHash !== user.twoFactor.codeHash) {
      user.twoFactor.attempts = (user.twoFactor.attempts || 0) + 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid code. Please try again.',
        remainingAttempts: Math.max(MAX_TWO_FACTOR_ATTEMPTS - user.twoFactor.attempts, 0)
      });
    }

    const wasEnabled = Boolean(user.twoFactor.enabled);
    user.twoFactor.enabled = true;
    user.twoFactor.codeHash = undefined;
    user.twoFactor.expiresAt = undefined;
    user.twoFactor.attempts = 0;
    user.twoFactor.loginSessionTokenHash = undefined;
    user.twoFactor.loginSessionTokenExpiresAt = undefined;
    user.twoFactor.verifiedAt = new Date(now);
    await user.save();

    return res.status(200).json({
      success: true,
      message: wasEnabled
        ? 'Two-factor code verified'
        : 'Two-factor authentication enabled',
      twoFactorEnabled: true
    });
  } catch (error) {
    console.error('Verify two-factor code error:', error);
    next(error);
  }
};

// @desc    Disable email 2FA
// @route   POST /api/auth/2fa/disable
// @access  Private
export const disableTwoFactor = async (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.twoFactor?.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Two-factor authentication is already disabled'
      });
    }

    const passwordMatches = await user.comparePassword(password);
    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    user.twoFactor = {
      enabled: false,
      codeHash: undefined,
      expiresAt: undefined,
      attempts: 0,
      lastSentAt: undefined,
      verifiedAt: undefined,
      loginSessionTokenHash: undefined,
      loginSessionTokenExpiresAt: undefined
    };

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Two-factor authentication disabled',
      twoFactorEnabled: false
    });
  } catch (error) {
    console.error('Disable two-factor error:', error);
    next(error);
  }
};

// @desc    Request password reset code
// @route   POST /api/auth/forgot-password/request
// @access  Public
export const requestPasswordReset = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
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

    const code = buildSecurityCode();
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

    let emailResult = null;
    try {
      emailResult = await sendPasswordResetCode({ to: user.email, code });
    } catch (emailError) {
      console.error('Password reset email failed:', emailError);
      emailResult = {
        sent: false,
        reason: 'password_reset_send_exception',
        error: emailError
      };
    }

    const deliveryStatus = await handleCodeDeliveryResult({
      emailResult,
      code,
      emailAddress: user.email,
      contextLabel: 'password-reset',
      cleanup: async () => {
        user.passwordReset = {
          codeHash: undefined,
          expiresAt: undefined,
          attempts: 0,
          lastSentAt: undefined,
          resetTokenHash: undefined,
          resetTokenExpiresAt: undefined
        };
        await user.save();
      }
    });

    if (!deliveryStatus.ok) {
      return res.status(deliveryStatus.statusCode).json({
        success: false,
        message: deliveryStatus.message
      });
    }

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
    const email = normalizeEmail(req.body.email);
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
    const email = normalizeEmail(req.body.email);
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
