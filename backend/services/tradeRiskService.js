import TradeTicket from '../models/TradeTicket.js';
import User from '../models/User.js';

const production = process.env.NODE_ENV === 'production';

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getTradeRiskPolicy = () => ({
  maxTradeUsd: positiveNumber(process.env.MAX_TRADE_USD, production ? 2_500 : 100_000),
  enhancedAuthThresholdUsd: positiveNumber(process.env.ENHANCED_AUTH_TRADE_USD, production ? 500 : 10_000),
  maxUserCommittedExposureUsd: positiveNumber(process.env.MAX_USER_COMMITTED_EXPOSURE_USD, production ? 5_000 : 500_000),
  maxPlatformCommittedExposureUsd: positiveNumber(process.env.MAX_PLATFORM_COMMITTED_EXPOSURE_USD, production ? 25_000 : 5_000_000)
});

const sumDealAmounts = (tickets) => tickets.reduce(
  (total, ticket) => total + Number(ticket.dealAmount || 0),
  0
);

const activeCommitmentFilter = (excludeTicketId = null) => ({
  status: { $in: ['open', 'in-progress', 'disputed'] },
  dealAmountConfirmed: true,
  fundsReleased: false,
  ...(excludeTicketId ? { ticketId: { $ne: excludeTicketId } } : {})
});

const riskError = (code, message, details = {}) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 409;
  error.details = details;
  return error;
};

export const assessTradeAmount = async ({ ticketId, userId, amount }) => {
  const dealAmount = Number(amount);
  const policy = getTradeRiskPolicy();
  if (!Number.isFinite(dealAmount) || dealAmount <= 0) {
    throw riskError('INVALID_TRADE_AMOUNT', 'Trade amount must be a positive number.');
  }
  if (dealAmount > policy.maxTradeUsd) {
    throw riskError(
      'TRADE_LIMIT_EXCEEDED',
      `This launch currently protects trades up to $${policy.maxTradeUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Contact Handshake for a reviewed business limit.`,
      { limitUsd: policy.maxTradeUsd }
    );
  }

  const user = await User.findById(userId).select('twoFactor.enabled');
  if (dealAmount >= policy.enhancedAuthThresholdUsd && !user?.twoFactor?.enabled) {
    const error = riskError(
      'ENHANCED_AUTH_REQUIRED',
      `Enable two-factor authentication before confirming trades of $${policy.enhancedAuthThresholdUsd.toLocaleString()} or more.`,
      { thresholdUsd: policy.enhancedAuthThresholdUsd }
    );
    error.statusCode = 403;
    throw error;
  }

  const baseFilter = activeCommitmentFilter(ticketId);
  const [userTickets, platformTickets] = await Promise.all([
    TradeTicket.find({
      ...baseFilter,
      $or: [
        { creator: userId },
        { participants: { $elemMatch: { user: userId, status: 'accepted' } } }
      ]
    }).select('dealAmount'),
    TradeTicket.find(baseFilter).select('dealAmount')
  ]);

  const userExposureAfter = sumDealAmounts(userTickets) + dealAmount;
  if (userExposureAfter > policy.maxUserCommittedExposureUsd) {
    throw riskError(
      'USER_EXPOSURE_LIMIT_REACHED',
      'Your active protected trades would exceed the current account custody limit. Complete or cancel an existing trade first.',
      { limitUsd: policy.maxUserCommittedExposureUsd, exposureAfterUsd: userExposureAfter }
    );
  }

  const platformExposureAfter = sumDealAmounts(platformTickets) + dealAmount;
  if (platformExposureAfter > policy.maxPlatformCommittedExposureUsd) {
    throw riskError(
      'PLATFORM_CAPACITY_REACHED',
      'Handshake has reached its current protected-custody capacity. Please try again after active trades settle.',
      { limitUsd: policy.maxPlatformCommittedExposureUsd }
    );
  }

  return {
    approved: true,
    policy,
    userExposureAfter,
    platformExposureAfter
  };
};
