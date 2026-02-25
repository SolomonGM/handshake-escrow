import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const DISCORD_DEFAULT_SCOPES = 'identify';

const sanitizeRoleId = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed || null;
};

const normalizeRankForDiscord = (value) => {
  const rank = String(value || '').trim().toLowerCase();
  if (!rank) {
    return '';
  }

  const aliases = {
    whale: 'ruby rich',
    moderator: 'manager'
  };

  return aliases[rank] || rank;
};

const getLegacyDiscordRoleMap = () => ({
  user: sanitizeRoleId(process.env.DISCORD_ROLE_ID_USER),
  moderator: sanitizeRoleId(process.env.DISCORD_ROLE_ID_MODERATOR),
  admin: sanitizeRoleId(process.env.DISCORD_ROLE_ID_ADMIN)
});

const getDiscordRankRoleMap = () => ({
  client: sanitizeRoleId(process.env.DISCORD_ROLE_ID_RANK_CLIENT),
  'rich client': sanitizeRoleId(process.env.DISCORD_ROLE_ID_RANK_RICH_CLIENT),
  'top client': sanitizeRoleId(process.env.DISCORD_ROLE_ID_RANK_TOP_CLIENT),
  'ruby rich': sanitizeRoleId(process.env.DISCORD_ROLE_ID_RANK_RUBY_RICH),
  manager: sanitizeRoleId(process.env.DISCORD_ROLE_ID_RANK_MANAGER),
  admin: sanitizeRoleId(process.env.DISCORD_ROLE_ID_RANK_ADMIN),
  owner: sanitizeRoleId(process.env.DISCORD_ROLE_ID_RANK_OWNER),
  developer: sanitizeRoleId(process.env.DISCORD_ROLE_ID_RANK_DEVELOPER)
});

const getMappedDiscordRoleIds = () => (
  Array.from(new Set([
    ...Object.values(getDiscordRankRoleMap()),
    ...Object.values(getLegacyDiscordRoleMap())
  ].filter(Boolean)))
);

const getPrimaryClientUrl = () => {
  const configuredUrls = String(process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  return configuredUrls[0] || 'http://localhost:5173';
};

const getSettingsRedirectBase = () => {
  const configured = String(process.env.DISCORD_SETTINGS_REDIRECT_URL || '').trim();
  return configured || `${getPrimaryClientUrl().replace(/\/$/, '')}/settings`;
};

export const buildDiscordSettingsRedirectUrl = (params = {}) => {
  const url = new URL(getSettingsRedirectBase());

  if (!url.searchParams.get('tab')) {
    url.searchParams.set('tab', 'profile');
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url.toString();
};

const getJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    const error = new Error('JWT_SECRET is required for Discord OAuth state');
    error.code = 'DISCORD_JWT_SECRET_MISSING';
    throw error;
  }

  return secret;
};

const getOAuthConfig = () => {
  const clientId = String(process.env.DISCORD_CLIENT_ID || '').trim();
  const redirectUri = String(process.env.DISCORD_OAUTH_REDIRECT_URI || '').trim();

  if (!clientId || !redirectUri) {
    const error = new Error('Discord OAuth is not fully configured');
    error.code = 'DISCORD_OAUTH_CONFIG_MISSING';
    throw error;
  }

  return { clientId, redirectUri };
};

const getOAuthSecretConfig = () => {
  const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || '').trim();
  if (!clientSecret) {
    const error = new Error('DISCORD_CLIENT_SECRET is not set');
    error.code = 'DISCORD_CLIENT_SECRET_MISSING';
    throw error;
  }

  return {
    ...getOAuthConfig(),
    clientSecret
  };
};

const getBotGuildConfig = () => {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();

  if (!botToken || !guildId) {
    return {
      isConfigured: false,
      botToken: null,
      guildId: null,
      message: 'Discord bot config missing (DISCORD_BOT_TOKEN or DISCORD_GUILD_ID).'
    };
  }

  return {
    isConfigured: true,
    botToken,
    guildId,
    message: null
  };
};

const getDefaultAvatarIndex = (discordUserId, discriminator) => {
  const numericDiscriminator = Number(discriminator);
  if (Number.isFinite(numericDiscriminator) && numericDiscriminator > 0) {
    return numericDiscriminator % 5;
  }

  try {
    const id = BigInt(discordUserId);
    return Number((id >> 22n) % 6n);
  } catch (error) {
    return 0;
  }
};

const buildAvatarUrl = (discordProfile, size = 128) => {
  const discordUserId = String(discordProfile?.userId || '').trim();
  const avatarHash = String(discordProfile?.avatar || '').trim();
  const discriminator = String(discordProfile?.discriminator || '').trim();

  if (!discordUserId) {
    return null;
  }

  if (!avatarHash) {
    const index = getDefaultAvatarIndex(discordUserId, discriminator);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${extension}?size=${size}`;
};

const buildDiscordTag = (discordProfile) => {
  const username = String(discordProfile?.username || '').trim();
  const discriminator = String(discordProfile?.discriminator || '').trim();

  if (!username) {
    return null;
  }

  if (!discriminator || discriminator === '0') {
    return username;
  }

  return `${username}#${discriminator}`;
};

export const resolveDiscordRoleIdForRank = (siteRank, siteRole = '') => {
  const normalizedRank = normalizeRankForDiscord(siteRank);
  const rankMatch = normalizedRank
    ? getDiscordRankRoleMap()[normalizedRank]
    : null;
  if (rankMatch) {
    return rankMatch;
  }

  const normalizedSiteRole = String(siteRole || '').trim().toLowerCase();
  if (!normalizedSiteRole) {
    return null;
  }

  return getLegacyDiscordRoleMap()[normalizedSiteRole] || null;
};

export const buildDiscordConnectionPayload = (userDoc) => {
  const discord = userDoc?.discord || {};
  const connected = Boolean(discord.connected && discord.userId);
  const expectedRoleId = resolveDiscordRoleIdForRank(userDoc?.rank, userDoc?.role);

  return {
    connected,
    userId: connected ? discord.userId || null : null,
    username: connected ? discord.username || null : null,
    discriminator: connected ? discord.discriminator || null : null,
    globalName: connected ? discord.globalName || null : null,
    displayName: connected ? discord.globalName || discord.username || null : null,
    tag: connected ? buildDiscordTag(discord) : null,
    avatarUrl: connected ? buildAvatarUrl(discord, 128) : null,
    guildMember: connected ? Boolean(discord.guildMember) : false,
    guildRoles: connected && Array.isArray(discord.guildRoles) ? discord.guildRoles : [],
    expectedRoleId,
    syncedRoleId: connected ? discord.syncedRoleId || null : null,
    syncedSiteRole: connected ? discord.syncedSiteRole || null : null,
    syncStatus: connected ? discord.syncStatus || 'never' : 'never',
    syncMessage: connected ? discord.syncMessage || null : null,
    connectedAt: connected ? discord.connectedAt || null : null,
    lastSyncedAt: connected ? discord.lastSyncedAt || null : null
  };
};

export const createDiscordOAuthStateToken = (appUserId) => {
  if (!appUserId) {
    throw new Error('App user id is required');
  }

  const payload = {
    provider: 'discord',
    action: 'connect',
    appUserId: String(appUserId),
    nonce: crypto.randomBytes(12).toString('hex')
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: `${DISCORD_OAUTH_STATE_TTL_SECONDS}s`
  });
};

export const verifyDiscordOAuthStateToken = (stateToken) => {
  try {
    const decoded = jwt.verify(String(stateToken || ''), getJwtSecret());

    if (decoded?.provider !== 'discord' || decoded?.action !== 'connect' || !decoded?.appUserId) {
      throw new Error('Invalid OAuth state payload');
    }

    return String(decoded.appUserId);
  } catch (error) {
    const wrappedError = new Error('Invalid or expired Discord OAuth state');
    wrappedError.code = 'DISCORD_INVALID_STATE';
    throw wrappedError;
  }
};

export const createDiscordAuthorizationUrl = (appUserId) => {
  const { clientId, redirectUri } = getOAuthConfig();
  const scopes = String(process.env.DISCORD_OAUTH_SCOPES || DISCORD_DEFAULT_SCOPES).trim() || DISCORD_DEFAULT_SCOPES;
  const state = createDiscordOAuthStateToken(appUserId);

  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');

  return {
    authUrl: url.toString(),
    expiresInSeconds: DISCORD_OAUTH_STATE_TTL_SECONDS
  };
};

const parseDiscordApiError = (error, fallbackMessage) => {
  const fallback = fallbackMessage || 'Discord request failed';
  const responseData = error?.response?.data;
  const status = error?.response?.status;
  const apiMessage = responseData?.message ? String(responseData.message) : null;

  if (apiMessage) {
    return status ? `${apiMessage} (Discord ${status})` : apiMessage;
  }

  return error?.message || fallback;
};

const exchangeDiscordCodeForToken = async (code) => {
  const { clientId, clientSecret, redirectUri } = getOAuthSecretConfig();

  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: redirectUri
  });

  try {
    const response = await axios.post(`${DISCORD_API_BASE}/oauth2/token`, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return response.data;
  } catch (error) {
    const wrapped = new Error(parseDiscordApiError(error, 'Failed to exchange Discord OAuth code'));
    wrapped.code = 'DISCORD_TOKEN_EXCHANGE_FAILED';
    throw wrapped;
  }
};

const fetchDiscordUserWithAccessToken = async (accessToken) => {
  try {
    const response = await axios.get(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return response.data;
  } catch (error) {
    const wrapped = new Error(parseDiscordApiError(error, 'Failed to fetch Discord user'));
    wrapped.code = 'DISCORD_USER_FETCH_FAILED';
    throw wrapped;
  }
};

export const exchangeCodeForDiscordUser = async (code) => {
  const tokenResponse = await exchangeDiscordCodeForToken(code);
  const accessToken = tokenResponse?.access_token;

  if (!accessToken) {
    const error = new Error('Discord access token was not returned');
    error.code = 'DISCORD_ACCESS_TOKEN_MISSING';
    throw error;
  }

  return fetchDiscordUserWithAccessToken(accessToken);
};

const fetchGuildMemberWithBotToken = async ({ botToken, guildId, discordUserId }) => {
  try {
    const response = await axios.get(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}`,
      {
        headers: {
          Authorization: `Bot ${botToken}`
        }
      }
    );

    return response.data;
  } catch (error) {
    if (error?.response?.status === 404) {
      return null;
    }

    const wrapped = new Error(parseDiscordApiError(error, 'Failed to fetch Discord guild member'));
    wrapped.code = 'DISCORD_GUILD_MEMBER_FETCH_FAILED';
    throw wrapped;
  }
};

const addGuildRoleWithBotToken = async ({ botToken, guildId, discordUserId, roleId }) => {
  try {
    await axios.put(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      null,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          'X-Audit-Log-Reason': 'Handshake role sync'
        }
      }
    );
  } catch (error) {
    const wrapped = new Error(parseDiscordApiError(error, 'Failed to assign Discord role'));
    wrapped.code = 'DISCORD_ROLE_ASSIGN_FAILED';
    throw wrapped;
  }
};

const removeGuildRoleWithBotToken = async ({ botToken, guildId, discordUserId, roleId }) => {
  try {
    await axios.delete(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          'X-Audit-Log-Reason': 'Handshake role sync'
        }
      }
    );
  } catch (error) {
    const wrapped = new Error(parseDiscordApiError(error, 'Failed to remove outdated Discord role'));
    wrapped.code = 'DISCORD_ROLE_REMOVE_FAILED';
    throw wrapped;
  }
};

export const applyDiscordConnectionToUserDocument = (userDoc, discordUser) => {
  if (!userDoc || !discordUser?.id) {
    throw new Error('Cannot apply Discord connection without user data');
  }

  const existing = userDoc.discord || {};

  userDoc.discord = {
    ...existing,
    connected: true,
    userId: String(discordUser.id),
    username: discordUser.username || null,
    discriminator: discordUser.discriminator || null,
    globalName: discordUser.global_name || null,
    avatar: discordUser.avatar || null,
    guildMember: false,
    guildRoles: [],
    syncedRoleId: null,
    syncedSiteRole: null,
    syncStatus: 'never',
    syncMessage: null,
    connectedAt: new Date(),
    lastSyncedAt: null
  };
};

export const clearDiscordConnectionOnUserDocument = (userDoc) => {
  if (!userDoc) {
    return;
  }

  userDoc.discord = {
    connected: false,
    userId: null,
    username: null,
    discriminator: null,
    globalName: null,
    avatar: null,
    guildMember: false,
    guildRoles: [],
    syncedRoleId: null,
    syncedSiteRole: null,
    syncStatus: 'never',
    syncMessage: null,
    connectedAt: null,
    lastSyncedAt: null
  };
};

export const syncDiscordRoleForUserDocument = async (userDoc) => {
  if (!userDoc?.discord?.connected || !userDoc?.discord?.userId) {
    if (userDoc?.discord) {
      userDoc.discord.guildMember = false;
      userDoc.discord.guildRoles = [];
      userDoc.discord.syncedRoleId = null;
      userDoc.discord.syncedSiteRole = null;
      userDoc.discord.syncStatus = 'skipped';
      userDoc.discord.syncMessage = 'Discord account is not connected.';
      userDoc.discord.lastSyncedAt = new Date();
    }

    return {
      status: 'skipped',
      message: 'Discord account is not connected.',
      targetRoleId: null
    };
  }

  const discordUserId = String(userDoc.discord.userId).trim();
  const normalizedRank = normalizeRankForDiscord(userDoc.rank);
  const targetRoleId = resolveDiscordRoleIdForRank(userDoc.rank, userDoc.role);
  const { isConfigured, botToken, guildId, message: missingConfigMessage } = getBotGuildConfig();

  if (!isConfigured) {
    userDoc.discord.syncStatus = 'failed';
    userDoc.discord.syncMessage = missingConfigMessage;
    userDoc.discord.lastSyncedAt = new Date();
    userDoc.discord.syncedRoleId = null;
    userDoc.discord.syncedSiteRole = null;

    return {
      status: 'failed',
      message: missingConfigMessage,
      targetRoleId
    };
  }

  let member;
  try {
    member = await fetchGuildMemberWithBotToken({
      botToken,
      guildId,
      discordUserId
    });
  } catch (error) {
    userDoc.discord.syncStatus = 'failed';
    userDoc.discord.syncMessage = error.message;
    userDoc.discord.lastSyncedAt = new Date();
    userDoc.discord.syncedRoleId = null;
    userDoc.discord.syncedSiteRole = null;

    return {
      status: 'failed',
      message: error.message,
      targetRoleId
    };
  }

  if (!member) {
    userDoc.discord.guildMember = false;
    userDoc.discord.guildRoles = [];
    userDoc.discord.syncedRoleId = null;
    userDoc.discord.syncedSiteRole = null;
    userDoc.discord.syncStatus = 'pending_guild_join';
    userDoc.discord.syncMessage = 'Connected account is not currently in the Discord guild.';
    userDoc.discord.lastSyncedAt = new Date();

    return {
      status: 'pending_guild_join',
      message: userDoc.discord.syncMessage,
      targetRoleId
    };
  }

  const currentRoles = Array.isArray(member.roles) ? member.roles : [];
  userDoc.discord.guildMember = true;
  userDoc.discord.guildRoles = currentRoles;

  if (!targetRoleId) {
    userDoc.discord.syncedRoleId = null;
    userDoc.discord.syncedSiteRole = null;
    userDoc.discord.syncStatus = 'skipped';
    userDoc.discord.syncMessage = `No Discord role mapping configured for rank "${normalizedRank || userDoc.rank || 'unknown'}".`;
    userDoc.discord.lastSyncedAt = new Date();

    return {
      status: 'skipped',
      message: userDoc.discord.syncMessage,
      targetRoleId: null
    };
  }

  const mappedRoleIds = getMappedDiscordRoleIds();
  const rolesToRemove = mappedRoleIds.filter(
    (roleId) => roleId !== targetRoleId && currentRoles.includes(roleId)
  );

  try {
    for (const roleId of rolesToRemove) {
      await removeGuildRoleWithBotToken({
        botToken,
        guildId,
        discordUserId,
        roleId
      });
    }

    await addGuildRoleWithBotToken({
      botToken,
      guildId,
      discordUserId,
      roleId: targetRoleId
    });

    const refreshedMember = await fetchGuildMemberWithBotToken({
      botToken,
      guildId,
      discordUserId
    });

    userDoc.discord.guildRoles = Array.isArray(refreshedMember?.roles)
      ? refreshedMember.roles
      : Array.from(new Set([...currentRoles.filter((roleId) => !rolesToRemove.includes(roleId)), targetRoleId]));
    userDoc.discord.syncedRoleId = targetRoleId;
    userDoc.discord.syncedSiteRole = normalizedRank || String(userDoc.rank || '').trim().toLowerCase() || null;
    userDoc.discord.syncStatus = 'synced';
    userDoc.discord.syncMessage = 'Discord role is synced with your Handshake rank.';
    userDoc.discord.lastSyncedAt = new Date();

    return {
      status: 'synced',
      message: userDoc.discord.syncMessage,
      targetRoleId
    };
  } catch (error) {
    userDoc.discord.syncStatus = 'failed';
    userDoc.discord.syncMessage = error.message;
    userDoc.discord.lastSyncedAt = new Date();
    userDoc.discord.syncedRoleId = null;
    userDoc.discord.syncedSiteRole = null;

    return {
      status: 'failed',
      message: error.message,
      targetRoleId
    };
  }
};
