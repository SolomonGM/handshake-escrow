export const isStaffUser = (user) => {
  if (!user) return false;
  if (user.rank === 'developer') return true;
  return user.role === 'admin' || user.role === 'moderator';
};

export const isDeveloperUser = (user) => Boolean(user && user.rank === 'developer');
