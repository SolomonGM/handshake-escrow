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
import {
  sendDiscordInteractionFollowup,
  verifyDiscordInteractionRequest
} from '../services/discordCommandService.js';

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
    const syncResult = await syncDiscordRoleForUserDocument(user, { trigger: 'oauth_connect' });
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

    const syncResult = await syncDiscordRoleForUserDocument(user, { trigger: 'website_manual' });
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

export const discordInteractionsHandler = async (req, res) => {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');
  const rawBody = req.rawBody;
  const isValid = verifyDiscordInteractionRequest({
    signature,
    timestamp,
    rawBody
  });

  if (!isValid) {
    return res.status(401).send('Invalid request signature');
  }

  const interaction = req.body || {};
  const interactionType = Number(interaction.type || 0);

  if (interactionType === 1) {
    return res.status(200).json({ type: 1 });
  }

  const commandName = String(interaction?.data?.name || '').toLowerCase();
  if (interactionType !== 2 || commandName !== 'sync') {
    return res.status(200).json({
      type: 4,
      data: {
        content: 'Unknown command.',
        flags: 64
      }
    });
  }

  res.status(200).json({
    type: 5,
    data: {
      flags: 64
    }
  });

  setImmediate(async () => {
    try {
      const discordUserId = String(
        interaction?.member?.user?.id || interaction?.user?.id || ''
      ).trim();
      const applicationId = String(
        interaction?.application_id || process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID || ''
      ).trim();
      const interactionToken = String(interaction?.token || '').trim();

      if (!discordUserId) {
        await sendDiscordInteractionFollowup({
          applicationId,
          interactionToken,
          content: 'Could not resolve your Discord user id.',
          isEphemeral: true
        });
        return;
      }

      const user = await User.findOne({ 'discord.userId': discordUserId });
      if (!user) {
        await sendDiscordInteractionFollowup({
          applicationId,
          interactionToken,
          content: 'Your Discord account is not linked to Handshake yet. Connect it in website Settings first.',
          isEphemeral: true
        });
        return;
      }

      const syncResult = await syncDiscordRoleForUserDocument(user, { trigger: 'discord_command' });
      await user.save();

      if (syncResult.status === 'synced') {
        await sendDiscordInteractionFollowup({
          applicationId,
          interactionToken,
          content: `Sync complete. Your rank role is now synced. Target role: ${syncResult.targetRoleId ? `<@&${syncResult.targetRoleId}>` : 'N/A'}`,
          isEphemeral: true
        });
        return;
      }

      await sendDiscordInteractionFollowup({
        applicationId,
        interactionToken,
        content: `Sync finished with status "${syncResult.status}". ${syncResult.message || ''}`.trim(),
        isEphemeral: true
      });
    } catch (error) {
      console.error('Discord /sync command failed:', error);
      const applicationId = String(
        interaction?.application_id || process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID || ''
      ).trim();
      const interactionToken = String(interaction?.token || '').trim();

      await sendDiscordInteractionFollowup({
        applicationId,
        interactionToken,
        content: `Sync failed. ${error?.message || 'Unexpected error'}`,
        isEphemeral: true
      });
    }
  });

  return undefined;
};
