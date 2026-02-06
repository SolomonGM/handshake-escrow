import axios from 'axios';
import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DEFAULT_USER_ID = '983995784624230410';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CRON = '0 4 * * *'; // Daily at 04:00
const DEFAULT_TZ = 'UTC';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.join(__dirname, '..', 'data', 'discordProfile.json');

let cachedProfile = null;
let refreshPromise = null;

const getDefaultAvatarIndex = (user) => {
  if (user.discriminator && user.discriminator !== '0') {
    return Number(user.discriminator) % 5;
  }

  try {
    const id = BigInt(user.id);
    return Number((id >> 22n) % 6n);
  } catch (error) {
    return 0;
  }
};

const buildDefaultAvatarUrl = (user) => {
  const index = getDefaultAvatarIndex(user);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
};

const buildAvatarUrl = (user, size) => {
  if (!user.avatar) {
    return buildDefaultAvatarUrl(user);
  }

  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
};

const buildBannerUrl = (user, size) => {
  if (!user.banner) {
    return null;
  }

  const ext = user.banner.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=${size}`;
};

const normalizeProfile = (user) => {
  const avatarUrl = buildAvatarUrl(user, 512);
  const avatarUrlSmall = buildAvatarUrl(user, 128);
  const bannerUrl = buildBannerUrl(user, 1024);
  const tag = user.discriminator && user.discriminator !== '0'
    ? `${user.username}#${user.discriminator}`
    : user.username;

  return {
    id: user.id,
    username: user.username,
    globalName: user.global_name || null,
    displayName: user.global_name || user.username,
    discriminator: user.discriminator || null,
    tag,
    avatarUrl,
    avatarUrlSmall,
    bannerUrl,
    fetchedAt: new Date().toISOString()
  };
};

const isCacheFresh = (profile) => {
  if (!profile?.fetchedAt) {
    return false;
  }

  const age = Date.now() - new Date(profile.fetchedAt).getTime();
  return age < CACHE_TTL_MS;
};

const readCacheFromDisk = async () => {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const data = JSON.parse(raw);
    cachedProfile = data;
    return data;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to read Discord profile cache:', error);
    }
    return null;
  }
};

const writeCacheToDisk = async (profile) => {
  try {
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, JSON.stringify(profile, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write Discord profile cache:', error);
  }
};

const fetchDiscordUser = async () => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    const error = new Error('DISCORD_BOT_TOKEN is not set');
    error.code = 'DISCORD_TOKEN_MISSING';
    throw error;
  }

  const userId = process.env.DISCORD_USER_ID || DEFAULT_USER_ID;
  const response = await axios.get(`${DISCORD_API_BASE}/users/${userId}`, {
    headers: {
      Authorization: `Bot ${token}`
    }
  });

  return response.data;
};

export const refreshDiscordProfile = async ({ force = false } = {}) => {
  if (!force && isCacheFresh(cachedProfile)) {
    return { profile: cachedProfile, refreshed: false };
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const user = await fetchDiscordUser();
    const profile = normalizeProfile(user);
    cachedProfile = profile;
    await writeCacheToDisk(profile);
    return { profile, refreshed: true };
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const ensureCacheLoaded = async () => {
  if (!cachedProfile) {
    await readCacheFromDisk();
  }
};

export const getDiscordProfile = async ({ force = false } = {}) => {
  await ensureCacheLoaded();

  if (force || !isCacheFresh(cachedProfile)) {
    try {
      const { profile, refreshed } = await refreshDiscordProfile({ force: true });
      return { profile, refreshed, stale: false, error: null };
    } catch (error) {
      return {
        profile: cachedProfile,
        refreshed: false,
        stale: true,
        error: error.message
      };
    }
  }

  return { profile: cachedProfile, refreshed: false, stale: false, error: null };
};

export const warmDiscordProfileCache = async () => {
  await ensureCacheLoaded();

  try {
    await refreshDiscordProfile();
  } catch (error) {
    console.warn('Discord profile refresh skipped:', error.message);
  }
};

export const scheduleDiscordProfileRefresh = () => {
  const schedule = process.env.DISCORD_PROFILE_REFRESH_CRON || DEFAULT_CRON;
  const timezone = process.env.DISCORD_PROFILE_REFRESH_TZ || DEFAULT_TZ;

  cron.schedule(schedule, async () => {
    try {
      await refreshDiscordProfile({ force: true });
      console.log('Discord profile refreshed via schedule.');
    } catch (error) {
      console.warn('Scheduled Discord profile refresh failed:', error.message);
    }
  }, { timezone });
};
