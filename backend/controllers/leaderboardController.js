import { getLeaderboard } from '../services/leaderboardService.js';

export const fetchLeaderboard = async (req, res) => {
  try {
    const { leaderboard, stale } = await getLeaderboard();

    res.status(200).json({
      leaderboard: leaderboard?.entries || [],
      updatedAt: leaderboard?.updatedAt || null,
      stale: Boolean(stale)
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
