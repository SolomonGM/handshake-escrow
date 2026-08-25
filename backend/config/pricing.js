export const MIN_TRADE_USD = 50;

export const FEE_CREDIT_BUNDLES = Object.freeze({
  '0': Object.freeze({ type: 'Starter Credits', creditAmount: 12, price: 10 }),
  '1': Object.freeze({ type: 'Trader Credits', creditAmount: 32, price: 25 }),
  '2': Object.freeze({ type: 'Rhino Credits', creditAmount: 70, price: 50 })
});

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const calculatePlatformFee = (dealAmount) => {
  const amount = Number(dealAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Deal amount must be a positive number');
  }

  if (amount < 1000) {
    return roundCurrency(Math.max(amount * 0.015, 1.5));
  }

  if (amount < 10000) {
    return roundCurrency(Math.max(amount * 0.01, 15));
  }

  return roundCurrency(Math.max(amount * 0.0065, 100));
};

export const calculateFeeBreakdown = (dealAmount, requestedCredit = 0) => {
  const amount = roundCurrency(dealAmount);
  const platformFee = calculatePlatformFee(amount);
  const availableCredit = Math.max(0, Number(requestedCredit) || 0);
  const creditApplied = roundCurrency(Math.min(platformFee, availableCredit));
  const feeDue = roundCurrency(platformFee - creditApplied);

  return {
    dealAmount: amount,
    platformFee,
    creditApplied,
    feeDue,
    totalDue: roundCurrency(amount + feeDue)
  };
};

export const getFeeScheduleText = () => [
  'Deals $50-$999.99: 1.5% ($1.50 minimum)',
  'Deals $1,000-$9,999.99: 1% ($15 minimum)',
  'Deals $10,000+: 0.65% ($100 minimum)',
  'Handshake Credits reduce the platform fee dollar-for-dollar',
  'Blockchain network fees are separate'
].join('\n');

