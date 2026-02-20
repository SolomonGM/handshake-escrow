const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;

export const USERNAME_RULES = {
  minLength: USERNAME_MIN_LENGTH,
  maxLength: USERNAME_MAX_LENGTH,
  regex: USERNAME_REGEX,
  invalidMessage: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and contain letters and numbers only`
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeUsername = (value) => String(value || '').trim();
export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const isValidUsername = (value) => {
  const username = String(value || '').trim();
  if (!username) {
    return false;
  }

  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_REGEX.test(username)
  );
};

export const isValidEmail = (value) => EMAIL_REGEX.test(normalizeEmail(value));

export const buildUsernameExistsQuery = (value) => {
  const normalized = String(value || '').trim();
  return { username: { $regex: `^${escapeRegExp(normalized)}$`, $options: 'i' } };
};

export const isMongoDuplicateKeyError = (error) => (
  Boolean(error) &&
  (
    error.code === 11000 ||
    String(error.message || '').includes('E11000 duplicate key error')
  )
);

export const getDuplicateKeyField = (error) => {
  if (!isMongoDuplicateKeyError(error)) {
    return null;
  }

  const keyPattern = error.keyPattern || {};
  if (keyPattern.email) {
    return 'email';
  }

  if (keyPattern.username) {
    return 'username';
  }

  const keyValue = error.keyValue || {};
  if (Object.prototype.hasOwnProperty.call(keyValue, 'email')) {
    return 'email';
  }

  if (Object.prototype.hasOwnProperty.call(keyValue, 'username')) {
    return 'username';
  }

  const message = String(error.message || '').toLowerCase();
  if (message.includes('email')) {
    return 'email';
  }
  if (message.includes('username')) {
    return 'username';
  }

  return null;
};
