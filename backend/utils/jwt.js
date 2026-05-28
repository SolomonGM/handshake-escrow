import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const generateToken = (userId, sessionToken = null) => {
  const payload = { id: userId };
  if (sessionToken) {
    payload.sid = sessionToken;
  }

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

export const buildSessionToken = () => crypto.randomBytes(32).toString('hex');
