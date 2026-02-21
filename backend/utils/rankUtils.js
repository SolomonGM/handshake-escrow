export const MAX_XP = 1000;
export const MAX_USD_FOR_XP = 10000;

export const RANK_THRESHOLDS = [
  { rank: 'ruby rich', minUSD: 10000 },
  { rank: 'top client', minUSD: 5000 },
  { rank: 'rich client', minUSD: 1000 },
  { rank: 'client', minUSD: 0 }
];

export const STAFF_RANKS = ['developer', 'owner', 'admin', 'manager', 'moderator'];

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const isDeveloperRank = (rank) => rank === 'developer';
export const isStaffRank = (rank) => STAFF_RANKS.includes(rank);

export const getRankForTotalUSD = (totalUSDValue) => {
  const usdValue = toNumber(totalUSDValue);
  const tier = RANK_THRESHOLDS.find((entry) => usdValue >= entry.minUSD);
  return tier ? tier.rank : 'client';
};

export const getXpForTotalUSD = (totalUSDValue) => {
  const usdValue = toNumber(totalUSDValue);
  const clampedUSD = Math.min(Math.max(usdValue, 0), MAX_USD_FOR_XP);
  const xp = Math.floor((clampedUSD / MAX_USD_FOR_XP) * MAX_XP);
  return Math.min(Math.max(xp, 0), MAX_XP);
};
