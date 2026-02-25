import ModerationAction from '../models/ModerationAction.js';

const isValidDate = (value) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const toDateOrNull = (value) => (isValidDate(value) ? new Date(value) : null);

export const getBanResetUpdate = () => ({
  'chatModeration.isBanned': false,
  'chatModeration.bannedUntil': null,
  'chatModeration.bannedReason': null,
  'chatModeration.bannedBy': null,
  'chatModeration.bannedAt': null
});

export const isBanExpired = (moderation, now = new Date()) => {
  if (!moderation?.isBanned) {
    return false;
  }

  const bannedUntil = toDateOrNull(moderation.bannedUntil);
  if (!bannedUntil) {
    return false;
  }

  return bannedUntil.getTime() <= now.getTime();
};

export const buildActiveBanDetails = (user, now = new Date()) => {
  const moderation = user?.chatModeration || {};
  if (!moderation.isBanned) {
    return null;
  }

  const expiresAt = toDateOrNull(moderation.bannedUntil);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  const bannedAt = toDateOrNull(moderation.bannedAt) || toDateOrNull(user?.updatedAt);
  const bannedByValue = moderation.bannedBy;
  const bannedBy = bannedByValue
    ? (
      typeof bannedByValue === 'object'
        ? {
          id: bannedByValue._id || null,
          userId: bannedByValue.userId || null,
          username: bannedByValue.username || null
        }
        : { id: bannedByValue }
    )
    : null;

  return {
    reason: moderation.bannedReason || null,
    issuedAt: bannedAt,
    expiresAt,
    isPermanent: !expiresAt,
    bannedBy
  };
};

export const buildModerationStatePayload = (user, now = new Date()) => {
  const activeBan = buildActiveBanDetails(user, now);
  return {
    activeBan: Boolean(activeBan),
    ban: activeBan
  };
};

export const logModerationAction = async ({
  actionType,
  scope = 'chat',
  targetUser = null,
  moderatorUser = null,
  reason = null,
  isPermanent = false,
  expiresAt = null,
  ticketId = null,
  metadata = {}
} = {}) => {
  if (!actionType) {
    return null;
  }

  try {
    return await ModerationAction.create({
      actionType,
      scope,
      targetUser,
      moderatorUser,
      reason: reason ? String(reason).trim() : null,
      isPermanent: Boolean(isPermanent),
      expiresAt: toDateOrNull(expiresAt),
      ticketId: ticketId ? String(ticketId).trim() : null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {}
    });
  } catch (error) {
    console.error('Failed to log moderation action:', error);
    return null;
  }
};
