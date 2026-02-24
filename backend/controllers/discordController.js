import User from '../models/User.js';
import { getDiscordProfile } from '../services/discordProfileService.js';
import {
  applyDiscordConnectionToUserDocument,
  buildDiscordConnectionPayload,
  buildDiscordSettingsRedirectUrl,
  clearDiscordConnectionOnUserDocument,
  createDiscordAuthorizationUrl,
  exchangeCodeForDiscordUser,
  syncDiscordRoleForUserDocument,
  verifyDiscordOAuthStateToken
} from '../services/discordIntegrationService.js';

const redirectWithStatus = (res, status, reason = null) => (
  res.redirect(buildDiscordSettingsRedirectUrl({
    discord: status,
    discord_reason: reason
  }))
);

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

export const getDiscordConnectUrlHandler = async (req, res) => {
  try {
    const { authUrl, expiresInSeconds } = createDiscordAuthorizationUrl(req.user.id);

    return res.json({
      success: true,
      authUrl,
      expiresInSeconds
    });
  } catch (error) {
    console.error('Discord connect-url error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create Discord connect URL'
    });
  }
};

export const getDiscordConnectionStatusHandler = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('role discord');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.json({
      success: true,
      discord: buildDiscordConnectionPayload(user)
    });
  } catch (error) {
    console.error('Discord status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get Discord connection status'
    });
  }
};

export const discordOAuthCallbackHandler = async (req, res) => {
  const oauthError = String(req.query.error || '').trim();
  if (oauthError) {
    return redirectWithStatus(
      res,
      oauthError === 'access_denied' ? 'denied' : 'error',
      oauthError
    );
  }

  const code = String(req.query.code || '').trim();
  const state = String(req.query.state || '').trim();

  if (!code || !state) {
    return redirectWithStatus(res, 'error', 'missing_code_or_state');
  }

  let appUserId;
  try {
    appUserId = verifyDiscordOAuthStateToken(state);
  } catch (error) {
    console.error('Discord callback state validation error:', error);
    return redirectWithStatus(res, 'error', 'invalid_state');
  }

  try {
    const user = await User.findById(appUserId);

    if (!user) {
      return redirectWithStatus(res, 'error', 'user_not_found');
    }

    const discordUser = await exchangeCodeForDiscordUser(code);
    const normalizedDiscordUserId = String(discordUser?.id || '').trim();
    if (!normalizedDiscordUserId) {
      return redirectWithStatus(res, 'error', 'discord_user_missing');
    }

    const existingLinkedUser = await User.findOne({ 'discord.userId': normalizedDiscordUserId }).select('_id');
    if (existingLinkedUser && String(existingLinkedUser._id) !== String(user._id)) {
      return redirectWithStatus(res, 'already_linked', 'discord_account_already_linked');
    }

    applyDiscordConnectionToUserDocument(user, discordUser);
    const syncResult = await syncDiscordRoleForUserDocument(user);
    await user.save();

    if (syncResult.status === 'synced') {
      return redirectWithStatus(res, 'connected');
    }

    if (syncResult.status === 'pending_guild_join') {
      return redirectWithStatus(res, 'connected_no_guild');
    }

    if (syncResult.status === 'failed') {
      return redirectWithStatus(res, 'connected_sync_issue', 'role_sync_failed');
    }

    return redirectWithStatus(res, 'connected_sync_pending');
  } catch (error) {
    if (error?.code === 11000) {
      return redirectWithStatus(res, 'already_linked', 'discord_account_already_linked');
    }

    console.error('Discord callback error:', error);
    return redirectWithStatus(res, 'error', 'callback_failed');
  }
};

export const syncDiscordRoleHandler = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.discord?.connected || !user.discord?.userId) {
      return res.status(400).json({
        success: false,
        message: 'Connect Discord before syncing roles.'
      });
    }

    const syncResult = await syncDiscordRoleForUserDocument(user);
    await user.save();

    return res.json({
      success: syncResult.status !== 'failed',
      status: syncResult.status,
      message: syncResult.message,
      discord: buildDiscordConnectionPayload(user)
    });
  } catch (error) {
    console.error('Discord sync-role error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync Discord role'
    });
  }
};

export const disconnectDiscordHandler = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    clearDiscordConnectionOnUserDocument(user);
    await user.save();

    return res.json({
      success: true,
      message: 'Discord account disconnected.',
      discord: buildDiscordConnectionPayload(user)
    });
  } catch (error) {
    console.error('Discord disconnect error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to disconnect Discord account'
    });
  }
};
