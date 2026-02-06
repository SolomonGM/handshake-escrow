import { getDiscordProfile } from '../services/discordProfileService.js';

export const getDiscordProfileHandler = async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const result = await getDiscordProfile({ force: forceRefresh });

    if (!result.profile) {
      return res.status(503).json({
        success: false,
        message: result.error || 'Discord profile unavailable'
      });
    }

    return res.json({
      success: true,
      profile: result.profile,
      stale: result.stale,
      refreshed: result.refreshed,
      error: result.error || null
    });
  } catch (error) {
    console.error('Discord profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Discord profile'
    });
  }
};
