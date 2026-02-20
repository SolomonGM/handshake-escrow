const RAPID_MESSAGE_INTERVAL_MS = 3000;
const RAPID_MESSAGE_LIMIT = 3;
const CHAT_SPAM_COOLDOWN_MS = 5000;
const SPAM_STATE_TTL_MS = 30 * 60 * 1000;
const SPAM_STATE_MAX_USERS = 1000;

const userRateState = new Map();

const buildCooldownPayload = (remainingMs) => {
  const cooldownSeconds = Math.max(Math.ceil(remainingMs / 1000), 1);
  return {
    blocked: true,
    cooldownSeconds,
    message: `Slow down. You are sending messages too quickly. Try again in ${cooldownSeconds}s.`
  };
};

const pruneOldState = () => {
  if (userRateState.size <= SPAM_STATE_MAX_USERS) {
    return;
  }

  const now = Date.now();
  for (const [userId, state] of userRateState.entries()) {
    const inactiveTooLong = !state.cooldownUntil && now - state.lastMessageAt > SPAM_STATE_TTL_MS;
    const cooldownExpired = state.cooldownUntil && state.cooldownUntil < now - SPAM_STATE_TTL_MS;
    if (inactiveTooLong || cooldownExpired) {
      userRateState.delete(userId);
    }
  }
};

export const checkRapidMessageSpam = (userId) => {
  pruneOldState();

  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return { blocked: false };
  }

  const now = Date.now();
  const previous = userRateState.get(normalizedUserId) || {
    rapidCount: 0,
    lastMessageAt: 0,
    cooldownUntil: 0
  };

  if (previous.cooldownUntil && previous.cooldownUntil > now) {
    return buildCooldownPayload(previous.cooldownUntil - now);
  }

  const isRapid = previous.lastMessageAt && now - previous.lastMessageAt <= RAPID_MESSAGE_INTERVAL_MS;
  const rapidCount = isRapid ? previous.rapidCount + 1 : 1;

  if (rapidCount > RAPID_MESSAGE_LIMIT) {
    const cooldownUntil = now + CHAT_SPAM_COOLDOWN_MS;
    userRateState.set(normalizedUserId, {
      rapidCount: 0,
      lastMessageAt: now,
      cooldownUntil
    });
    return buildCooldownPayload(CHAT_SPAM_COOLDOWN_MS);
  }

  userRateState.set(normalizedUserId, {
    rapidCount,
    lastMessageAt: now,
    cooldownUntil: 0
  });

  return { blocked: false };
};
