import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { sendEmailChangeCode, sendPasswordResetCode, sendTwoFactorCode } from '../utils/email.js';
import { getTurnstileClientConfig, verifyTurnstileToken } from '../utils/turnstile.js';
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
const EMAIL_CHANGE_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHANGE_RESEND_COOLDOWN_MS = 30 * 1000;
const EMAIL_CHANGE_SESSION_TTL_MS = 20 * 60 * 1000;
const MAX_EMAIL_CHANGE_ATTEMPTS = 5;

const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isProduction = process.env.NODE_ENV === 'production';
const buildSecurityCode = () => String(Math.floor(10000 + Math.random() * 90000));
const buildSessionToken = () => crypto.randomBytes(32).toString('hex');

const clearEmailChangeState = (user) => {
  user.emailChange = {
    pendingEmail: undefined,
    currentCodeHash: undefined,
    currentCodeExpiresAt: undefined,
    currentCodeAttempts: 0,
    currentCodeLastSentAt: undefined,
    currentVerifiedAt: undefined,
    newCodeHash: undefined,
    newCodeExpiresAt: undefined,
    newCodeAttempts: 0,
    newCodeLastSentAt: undefined,
    sessionTokenHash: undefined,
    sessionTokenExpiresAt: undefined
  };
};

const hasValidEmailChangeSession = (emailChange, sessionToken) => {
  if (!emailChange?.sessionTokenHash || !emailChange?.sessionTokenExpiresAt) {
    return false;
  }

  const sessionExpiresAt = new Date(emailChange.sessionTokenExpiresAt).getTime();
  if (sessionExpiresAt < Date.now()) {
    return false;
  }

  return hashValue(sessionToken) === emailChange.sessionTokenHash;
};

const getMaskedEmail = (email) => {
  const value = String(email || '').trim();
  const atIndex = value.indexOf('@');
  if (atIndex <= 1) {
    return value;
  }

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (!domain) {
    return value;
  }

  const maskedLocal = `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

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

// @desc    Get public auth security configuration
// @route   GET /api/auth/security-config
// @access  Public
export const getSecurityConfig = async (req, res) => {
  const captcha = getTurnstileClientConfig();

  res.json({
    success: true,
    captcha
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const captchaToken = String(req.body.captchaToken || '');

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    const captchaVerification = await verifyTurnstileToken({
      token: captchaToken,
      remoteIp: req.ip
    });

    if (captchaVerification.enabled && !captchaVerification.success) {
      const errorCodes = Array.isArray(captchaVerification.errorCodes)
        ? captchaVerification.errorCodes
        : [];
      const isExpiredOrDuplicate = errorCodes.includes('timeout-or-duplicate');
      const isServerSideIssue = (
        captchaVerification.reason === 'turnstile_secret_missing' ||
        captchaVerification.reason === 'turnstile_verify_request_failed'
      );

      if (isServerSideIssue) {
        if (captchaVerification.error) {
          console.error('Register captcha verification error:', captchaVerification.error);
        }

        return res.status(503).json({
          success: false,
          message: 'Security verification service is temporarily unavailable. Please try again.'
        });
      }

      if (errorCodes.length > 0) {
        console.warn('Register captcha verification rejected:', errorCodes.join(', '));
      }

      return res.status(400).json({
        success: false,
        message: isExpiredOrDuplicate
          ? 'Security check expired. Please complete it again.'
          : 'Please complete the security check before creating an account.'
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

      if (normalizedUsername !== user.username) {
        if (!isValidUsername(normalizedUsername)) {
          return res.status(400).json({ 
            success: false,
            message: USERNAME_RULES.invalidMessage
          });
        }

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

    // Email changes are handled via dedicated two-step verification endpoints.
    if (typeof incomingEmail === 'string' && incomingEmail.trim()) {
      const normalizedEmail = normalizeEmail(incomingEmail);

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid email address'
        });
      }

      if (normalizedEmail !== user.email) {
        return res.status(400).json({
          success: false,
          message: 'Email changes require verification in Settings. Use Change Email to continue.'
        });
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

// @desc    Request code to verify current email before changing account email
// @route   POST /api/auth/email-change/request-current
// @access  Private
export const requestEmailChangeCurrentCode = async (req, res, next) => {
  try {
    const newEmail = normalizeEmail(req.body.newEmail);
    if (!newEmail) {
      return res.status(400).json({
        success: false,
        message: 'New email is required'
      });
    }

    if (!isValidEmail(newEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.rank === 'developer') {
      return res.status(403).json({
        success: false,
        message: 'Email cannot be changed for developer accounts. Contact system administrator.'
      });
    }

    if (newEmail === user.email) {
      return res.status(400).json({
        success: false,
        message: 'New email must be different from your current email'
      });
    }

    const existingUser = await User.findOne({
      _id: { $ne: user._id },
      email: newEmail
    }).select('_id');

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    const now = Date.now();
    const currentCodeLastSentAt = user.emailChange?.currentCodeLastSentAt
      ? new Date(user.emailChange.currentCodeLastSentAt).getTime()
      : null;
    const isSamePendingEmail = user.emailChange?.pendingEmail === newEmail;
    const hasPendingCurrentStep = Boolean(
      user.emailChange?.currentCodeHash &&
      !user.emailChange?.currentVerifiedAt &&
      user.emailChange?.sessionTokenHash &&
      user.emailChange?.sessionTokenExpiresAt
    );

    if (
      isSamePendingEmail &&
      hasPendingCurrentStep &&
      currentCodeLastSentAt &&
      now - currentCodeLastSentAt < EMAIL_CHANGE_RESEND_COOLDOWN_MS
    ) {
      const remainingSeconds = Math.ceil(
        (EMAIL_CHANGE_RESEND_COOLDOWN_MS - (now - currentCodeLastSentAt)) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds}s before requesting another code.`,
        cooldownSeconds: remainingSeconds
      });
    }

    const code = buildSecurityCode();
    const verificationSessionToken = buildSessionToken();
    user.emailChange = {
      pendingEmail: newEmail,
      currentCodeHash: hashValue(code),
      currentCodeExpiresAt: new Date(now + EMAIL_CHANGE_CODE_TTL_MS),
      currentCodeAttempts: 0,
      currentCodeLastSentAt: new Date(now),
      currentVerifiedAt: undefined,
      newCodeHash: undefined,
      newCodeExpiresAt: undefined,
      newCodeAttempts: 0,
      newCodeLastSentAt: undefined,
      sessionTokenHash: hashValue(verificationSessionToken),
      sessionTokenExpiresAt: new Date(now + EMAIL_CHANGE_SESSION_TTL_MS)
    };
    await user.save();

    let emailResult = null;
    try {
      emailResult = await sendEmailChangeCode({
        to: user.email,
        code,
        stage: 'current'
      });
    } catch (emailError) {
      console.error('Email change current verification email failed:', emailError);
      emailResult = {
        sent: false,
        reason: 'email_change_current_send_exception',
        error: emailError
      };
    }

    const deliveryStatus = await handleCodeDeliveryResult({
      emailResult,
      code,
      emailAddress: user.email,
      contextLabel: 'email-change-current',
      cleanup: async () => {
        clearEmailChangeState(user);
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
      message: `We sent a verification code to ${getMaskedEmail(user.email)}.`,
      stage: 'verify-current',
      verificationSessionToken,
      cooldownSeconds: Math.ceil(EMAIL_CHANGE_RESEND_COOLDOWN_MS / 1000),
      expiresInSeconds: Math.ceil(EMAIL_CHANGE_CODE_TTL_MS / 1000)
    });
  } catch (error) {
    console.error('Request email change current code error:', error);
    next(error);
  }
};

// @desc    Resend current-email verification code for email change
// @route   POST /api/auth/email-change/resend-current
// @access  Private
export const resendEmailChangeCurrentCode = async (req, res, next) => {
  try {
    const verificationSessionToken = String(req.body.verificationSessionToken || '').trim();
    if (!verificationSessionToken) {
      return res.status(400).json({
        success: false,
        message: 'Verification session token is required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.emailChange?.pendingEmail) {
      return res.status(400).json({
        success: false,
        message: 'No active email change request. Start again.'
      });
    }

    const sessionExpiresAt = user.emailChange.sessionTokenExpiresAt
      ? new Date(user.emailChange.sessionTokenExpiresAt).getTime()
      : null;
    if (!sessionExpiresAt || sessionExpiresAt < Date.now()) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(410).json({
        success: false,
        message: 'Email verification session expired. Start again.'
      });
    }

    if (!hasValidEmailChangeSession(user.emailChange, verificationSessionToken)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email verification session'
      });
    }

    if (user.emailChange.currentVerifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'Current email already verified. Verify the code sent to your new email.'
      });
    }

    const now = Date.now();
    const lastSentAt = user.emailChange.currentCodeLastSentAt
      ? new Date(user.emailChange.currentCodeLastSentAt).getTime()
      : null;
    if (lastSentAt && now - lastSentAt < EMAIL_CHANGE_RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil(
        (EMAIL_CHANGE_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds}s before requesting another code.`,
        cooldownSeconds: remainingSeconds
      });
    }

    const code = buildSecurityCode();
    user.emailChange.currentCodeHash = hashValue(code);
    user.emailChange.currentCodeExpiresAt = new Date(now + EMAIL_CHANGE_CODE_TTL_MS);
    user.emailChange.currentCodeAttempts = 0;
    user.emailChange.currentCodeLastSentAt = new Date(now);
    await user.save();

    let emailResult = null;
    try {
      emailResult = await sendEmailChangeCode({
        to: user.email,
        code,
        stage: 'current'
      });
    } catch (emailError) {
      console.error('Resend email change current code failed:', emailError);
      emailResult = {
        sent: false,
        reason: 'email_change_resend_current_send_exception',
        error: emailError
      };
    }

    const deliveryStatus = await handleCodeDeliveryResult({
      emailResult,
      code,
      emailAddress: user.email,
      contextLabel: 'email-change-resend-current',
      cleanup: async () => {
        clearEmailChangeState(user);
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
      message: `A new code was sent to ${getMaskedEmail(user.email)}.`,
      cooldownSeconds: Math.ceil(EMAIL_CHANGE_RESEND_COOLDOWN_MS / 1000),
      expiresInSeconds: Math.ceil(EMAIL_CHANGE_CODE_TTL_MS / 1000)
    });
  } catch (error) {
    console.error('Resend email change current code error:', error);
    next(error);
  }
};

// @desc    Verify current-email code and send new-email verification code
// @route   POST /api/auth/email-change/verify-current
// @access  Private
export const verifyEmailChangeCurrentCode = async (req, res, next) => {
  try {
    const verificationSessionToken = String(req.body.verificationSessionToken || '').trim();
    const code = String(req.body.code || '').trim();

    if (!verificationSessionToken || !code) {
      return res.status(400).json({
        success: false,
        message: 'Verification session token and code are required'
      });
    }

    if (!/^\d{5}$/.test(code)) {
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

    if (!user.emailChange?.pendingEmail) {
      return res.status(400).json({
        success: false,
        message: 'No active email change request. Start again.'
      });
    }

    const sessionExpiresAt = user.emailChange.sessionTokenExpiresAt
      ? new Date(user.emailChange.sessionTokenExpiresAt).getTime()
      : null;
    if (!sessionExpiresAt || sessionExpiresAt < Date.now()) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(410).json({
        success: false,
        message: 'Email verification session expired. Start again.'
      });
    }

    if (!hasValidEmailChangeSession(user.emailChange, verificationSessionToken)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email verification session'
      });
    }

    if (user.emailChange.currentVerifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'Current email already verified. Verify your new email code.',
        stage: 'verify-new'
      });
    }

    if (!user.emailChange.currentCodeHash) {
      return res.status(400).json({
        success: false,
        message: 'No active current-email code. Request a new code.'
      });
    }

    const now = Date.now();
    const currentCodeExpiresAt = user.emailChange.currentCodeExpiresAt
      ? new Date(user.emailChange.currentCodeExpiresAt).getTime()
      : null;
    if (currentCodeExpiresAt && currentCodeExpiresAt < now) {
      user.emailChange.currentCodeHash = undefined;
      user.emailChange.currentCodeExpiresAt = undefined;
      user.emailChange.currentCodeAttempts = 0;
      await user.save();

      return res.status(410).json({
        success: false,
        message: 'Current email code expired. Request a new code.'
      });
    }

    if ((user.emailChange.currentCodeAttempts || 0) >= MAX_EMAIL_CHANGE_ATTEMPTS) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Start the email change process again.'
      });
    }

    const incomingHash = hashValue(code);
    if (incomingHash !== user.emailChange.currentCodeHash) {
      user.emailChange.currentCodeAttempts = (user.emailChange.currentCodeAttempts || 0) + 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid code. Please try again.',
        remainingAttempts: Math.max(MAX_EMAIL_CHANGE_ATTEMPTS - user.emailChange.currentCodeAttempts, 0)
      });
    }

    const pendingEmail = normalizeEmail(user.emailChange.pendingEmail);
    if (!pendingEmail || !isValidEmail(pendingEmail)) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(400).json({
        success: false,
        message: 'Invalid pending email. Start again.'
      });
    }

    const existingUser = await User.findOne({
      _id: { $ne: user._id },
      email: pendingEmail
    }).select('_id');
    if (existingUser) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    const newCode = buildSecurityCode();
    user.emailChange.currentVerifiedAt = new Date(now);
    user.emailChange.currentCodeHash = undefined;
    user.emailChange.currentCodeExpiresAt = undefined;
    user.emailChange.currentCodeAttempts = 0;
    user.emailChange.currentCodeLastSentAt = undefined;
    user.emailChange.newCodeHash = hashValue(newCode);
    user.emailChange.newCodeExpiresAt = new Date(now + EMAIL_CHANGE_CODE_TTL_MS);
    user.emailChange.newCodeAttempts = 0;
    user.emailChange.newCodeLastSentAt = new Date(now);
    await user.save();

    let emailResult = null;
    try {
      emailResult = await sendEmailChangeCode({
        to: pendingEmail,
        code: newCode,
        stage: 'new'
      });
    } catch (emailError) {
      console.error('Email change new-email verification send failed:', emailError);
      emailResult = {
        sent: false,
        reason: 'email_change_new_send_exception',
        error: emailError
      };
    }

    const deliveryStatus = await handleCodeDeliveryResult({
      emailResult,
      code: newCode,
      emailAddress: pendingEmail,
      contextLabel: 'email-change-new',
      cleanup: async () => {
        clearEmailChangeState(user);
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
      message: `Current email verified. We sent a code to ${getMaskedEmail(pendingEmail)}.`,
      stage: 'verify-new',
      cooldownSeconds: Math.ceil(EMAIL_CHANGE_RESEND_COOLDOWN_MS / 1000),
      expiresInSeconds: Math.ceil(EMAIL_CHANGE_CODE_TTL_MS / 1000)
    });
  } catch (error) {
    console.error('Verify email change current code error:', error);
    next(error);
  }
};

// @desc    Resend new-email verification code
// @route   POST /api/auth/email-change/resend-new
// @access  Private
export const resendEmailChangeNewCode = async (req, res, next) => {
  try {
    const verificationSessionToken = String(req.body.verificationSessionToken || '').trim();
    if (!verificationSessionToken) {
      return res.status(400).json({
        success: false,
        message: 'Verification session token is required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.emailChange?.pendingEmail || !user.emailChange?.currentVerifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'Current email is not verified. Start the email change process again.'
      });
    }

    const sessionExpiresAt = user.emailChange.sessionTokenExpiresAt
      ? new Date(user.emailChange.sessionTokenExpiresAt).getTime()
      : null;
    if (!sessionExpiresAt || sessionExpiresAt < Date.now()) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(410).json({
        success: false,
        message: 'Email verification session expired. Start again.'
      });
    }

    if (!hasValidEmailChangeSession(user.emailChange, verificationSessionToken)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email verification session'
      });
    }

    const now = Date.now();
    const lastSentAt = user.emailChange.newCodeLastSentAt
      ? new Date(user.emailChange.newCodeLastSentAt).getTime()
      : null;
    if (lastSentAt && now - lastSentAt < EMAIL_CHANGE_RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil(
        (EMAIL_CHANGE_RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds}s before requesting another code.`,
        cooldownSeconds: remainingSeconds
      });
    }

    const pendingEmail = normalizeEmail(user.emailChange.pendingEmail);
    if (!pendingEmail || !isValidEmail(pendingEmail)) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(400).json({
        success: false,
        message: 'Invalid pending email. Start again.'
      });
    }

    const existingUser = await User.findOne({
      _id: { $ne: user._id },
      email: pendingEmail
    }).select('_id');
    if (existingUser) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    const newCode = buildSecurityCode();
    user.emailChange.newCodeHash = hashValue(newCode);
    user.emailChange.newCodeExpiresAt = new Date(now + EMAIL_CHANGE_CODE_TTL_MS);
    user.emailChange.newCodeAttempts = 0;
    user.emailChange.newCodeLastSentAt = new Date(now);
    await user.save();

    let emailResult = null;
    try {
      emailResult = await sendEmailChangeCode({
        to: pendingEmail,
        code: newCode,
        stage: 'new'
      });
    } catch (emailError) {
      console.error('Resend email change new code failed:', emailError);
      emailResult = {
        sent: false,
        reason: 'email_change_resend_new_send_exception',
        error: emailError
      };
    }

    const deliveryStatus = await handleCodeDeliveryResult({
      emailResult,
      code: newCode,
      emailAddress: pendingEmail,
      contextLabel: 'email-change-resend-new',
      cleanup: async () => {
        clearEmailChangeState(user);
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
      message: `A new code was sent to ${getMaskedEmail(pendingEmail)}.`,
      cooldownSeconds: Math.ceil(EMAIL_CHANGE_RESEND_COOLDOWN_MS / 1000),
      expiresInSeconds: Math.ceil(EMAIL_CHANGE_CODE_TTL_MS / 1000)
    });
  } catch (error) {
    console.error('Resend email change new code error:', error);
    next(error);
  }
};

// @desc    Verify new-email code and finalize email change
// @route   POST /api/auth/email-change/verify-new
// @access  Private
export const verifyEmailChangeNewCode = async (req, res, next) => {
  try {
    const verificationSessionToken = String(req.body.verificationSessionToken || '').trim();
    const code = String(req.body.code || '').trim();

    if (!verificationSessionToken || !code) {
      return res.status(400).json({
        success: false,
        message: 'Verification session token and code are required'
      });
    }

    if (!/^\d{5}$/.test(code)) {
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

    if (!user.emailChange?.pendingEmail || !user.emailChange?.currentVerifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'Current email is not verified. Start the email change process again.'
      });
    }

    const sessionExpiresAt = user.emailChange.sessionTokenExpiresAt
      ? new Date(user.emailChange.sessionTokenExpiresAt).getTime()
      : null;
    if (!sessionExpiresAt || sessionExpiresAt < Date.now()) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(410).json({
        success: false,
        message: 'Email verification session expired. Start again.'
      });
    }

    if (!hasValidEmailChangeSession(user.emailChange, verificationSessionToken)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email verification session'
      });
    }

    if (!user.emailChange.newCodeHash) {
      return res.status(400).json({
        success: false,
        message: 'No active new-email code. Request a new code.'
      });
    }

    const now = Date.now();
    const newCodeExpiresAt = user.emailChange.newCodeExpiresAt
      ? new Date(user.emailChange.newCodeExpiresAt).getTime()
      : null;
    if (newCodeExpiresAt && newCodeExpiresAt < now) {
      user.emailChange.newCodeHash = undefined;
      user.emailChange.newCodeExpiresAt = undefined;
      user.emailChange.newCodeAttempts = 0;
      await user.save();

      return res.status(410).json({
        success: false,
        message: 'New email code expired. Request a new code.'
      });
    }

    if ((user.emailChange.newCodeAttempts || 0) >= MAX_EMAIL_CHANGE_ATTEMPTS) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(429).json({
        success: false,
        message: 'Too many attempts. Start the email change process again.'
      });
    }

    const incomingHash = hashValue(code);
    if (incomingHash !== user.emailChange.newCodeHash) {
      user.emailChange.newCodeAttempts = (user.emailChange.newCodeAttempts || 0) + 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid code. Please try again.',
        remainingAttempts: Math.max(MAX_EMAIL_CHANGE_ATTEMPTS - user.emailChange.newCodeAttempts, 0)
      });
    }

    const nextEmail = normalizeEmail(user.emailChange.pendingEmail);
    if (!nextEmail || !isValidEmail(nextEmail)) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(400).json({
        success: false,
        message: 'Invalid pending email. Start again.'
      });
    }

    const existingUser = await User.findOne({
      _id: { $ne: user._id },
      email: nextEmail
    }).select('_id');
    if (existingUser) {
      clearEmailChangeState(user);
      await user.save();
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    user.email = nextEmail;
    clearEmailChangeState(user);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Email updated successfully',
      user: buildAuthUserPayload(user)
    });
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    console.error('Verify email change new code error:', error);
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
