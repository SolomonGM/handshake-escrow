const RANK_ALIASES = {
  whale: 'ruby rich',
  moderator: 'manager'
};

const RANK_DISPLAY = {
  client: {
    label: 'Client',
    color: '#06b6d4',
    textClass: 'text-[#06b6d4]',
    bgClass: 'bg-[#06b6d4]/20 border-[#06b6d4]/50',
    badge: null
  },
  'rich client': {
    label: 'Rich Client',
    color: '#f97316',
    textClass: 'text-[#f97316]',
    bgClass: 'bg-[#f97316]/20 border-[#f97316]/50',
    badge: '/badges/rich-client.png'
  },
  'top client': {
    label: 'Top Client',
    color: '#2563eb',
    textClass: 'text-[#2563eb]',
    bgClass: 'bg-[#2563eb]/20 border-[#2563eb]/50',
    badge: '/badges/top-client.png'
  },
  'ruby rich': {
    label: 'RUBY Rich',
    color: '#ff4da6',
    textClass: 'text-[#ff4da6]',
    bgClass: 'bg-[#ff4da6]/20 border-[#ff4da6]/50',
    badge: '/badges/RUBY.png'
  },
  manager: {
    label: 'Manager',
    color: '#6ee7b7',
    textClass: 'text-[#6ee7b7]',
    bgClass: 'bg-[#6ee7b7]/20 border-[#6ee7b7]/50',
    badge: '/badges/mod.png'
  },
  admin: {
    label: 'Admin',
    color: '#ef4444',
    textClass: 'text-[#ef4444]',
    bgClass: 'bg-[#ef4444]/20 border-[#ef4444]/50',
    badge: '/badges/mod.png',
    gradientClass: 'gradient-text-red-white'
  },
  owner: {
    label: 'Owner',
    color: '#ef4444',
    textClass: 'text-[#ef4444]',
    bgClass: 'bg-[#ef4444]/20 border-[#ef4444]/50',
    badge: '/badges/owner.png',
    gradientClass: 'gradient-text-red-white'
  },
  developer: {
    label: 'Developer',
    color: '#f5f5f5',
    textClass: 'text-[#f5f5f5]',
    bgClass: 'bg-white/20 border-white/50',
    badge: '/badges/developer.png',
    gradientClass: 'gradient-text'
  },
  bot: {
    label: 'BOT',
    color: '#10b981',
    textClass: 'text-[#10b981]',
    bgClass: 'bg-[#10b981]/20 border-[#10b981]/50',
    badge: null
  }
};

export const normalizeRank = (rank) => {
  if (!rank) return 'client';
  const normalized = String(rank).trim().toLowerCase();
  return RANK_ALIASES[normalized] || normalized;
};

export const getRankMeta = (rank) => {
  const key = normalizeRank(rank);
  return RANK_DISPLAY[key] || RANK_DISPLAY.client;
};

export const getRankLabel = (rank) => getRankMeta(rank).label;
export const getRankColor = (rank) => getRankMeta(rank).color;
export const getRankTextClass = (rank) => getRankMeta(rank).textClass;
export const getRankBgClass = (rank) => getRankMeta(rank).bgClass;
export const getRankBadge = (rank) => getRankMeta(rank).badge;
export const getRankGradientClass = (rank) => getRankMeta(rank).gradientClass || '';
