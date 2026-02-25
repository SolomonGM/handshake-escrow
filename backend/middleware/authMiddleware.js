import User from '../models/User.js';
import { verifyToken } from '../utils/jwt.js';
import {
  buildActiveBanDetails,
  getBanResetUpdate,
  isBanExpired
} from '../services/moderationService.js';

const createUnauthorizedResponse = (res, message) => res.status(401).json({
  success: false,
  message
});

const createProtectMiddleware = ({ allowBanned = false } = {}) => async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return createUnauthorizedResponse(res, 'Not authorized to access this route');
    }

    try {
      const decoded = verifyToken(token);
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return createUnauthorizedResponse(res, 'User not found');
      }

      if (isBanExpired(req.user.chatModeration)) {
        await User.findByIdAndUpdate(req.user._id, { $set: getBanResetUpdate() });
        req.user.chatModeration = {
          ...(req.user.chatModeration || {}),
          isBanned: false,
          bannedUntil: null,
          bannedReason: null,
          bannedBy: null,
          bannedAt: null
        };
      }

      const activeBan = buildActiveBanDetails(req.user);
      req.activeBan = activeBan;
      if (activeBan && !allowBanned) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_BANNED',
          message: activeBan.isPermanent
            ? 'Your account is permanently banned from the platform.'
            : `Your account is banned until ${new Date(activeBan.expiresAt).toLocaleString()}.`,
          moderation: {
            activeBan: true,
            ban: activeBan
          }
        });
      }

      next();
    } catch (error) {
      return createUnauthorizedResponse(res, 'Not authorized, token failed');
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    next(error);
  }
};

export const protect = createProtectMiddleware();
export const protectAllowBanned = createProtectMiddleware({ allowBanned: true });

// Optional: Role-based authorization middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};
