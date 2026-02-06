import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';

const CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_CRON = '0 * * * *';
const DEFAULT_TZ = 'UTC';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.join(__dirname, '..', 'data', 'leaderboard.json');

let cachedLeaderboard = null;
let refreshPromise = null;

const isCacheFresh = (leaderboard) => {
  if (!leaderboard?.updatedAt) {
    return false;
  }

  const age = Date.now() - new Date(leaderboard.updatedAt).getTime();
  return age < CACHE_TTL_MS;
};

const readCacheFromDisk = async () => {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const data = JSON.parse(raw);
    cachedLeaderboard = data;
    return data;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to read leaderboard cache:', error);
    }
    return null;
  }
};

const writeCacheToDisk = async (leaderboard) => {
  try {
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, JSON.stringify(leaderboard, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write leaderboard cache:', error);
  }
};

const buildLeaderboard = async () => {
  const users = await User.find()
    .select('username avatar totalUSDValue totalDeals')
    .sort({ totalUSDValue: -1, totalDeals: -1, createdAt: 1 })
    .limit(3)
    .lean();

  const entries = users.map((user, index) => ({
    rank: index + 1,
    userId: user._id,
    username: user.username,
    avatar: user.avatar,
    totalUSDValue: Number(user.totalUSDValue || 0),
    totalDeals: Number(user.totalDeals || 0)
  }));

  return {
    updatedAt: new Date().toISOString(),
    entries
  };
};

export const refreshLeaderboard = async ({ force = false } = {}) => {
  if (!force && isCacheFresh(cachedLeaderboard)) {
    return { leaderboard: cachedLeaderboard, refreshed: false };
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const leaderboard = await buildLeaderboard();
    cachedLeaderboard = leaderboard;
    await writeCacheToDisk(leaderboard);
    return { leaderboard, refreshed: true };
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const ensureCacheLoaded = async () => {
  if (!cachedLeaderboard) {
    await readCacheFromDisk();
  }
};

export const getLeaderboard = async ({ force = false } = {}) => {
  await ensureCacheLoaded();

  if (force || !isCacheFresh(cachedLeaderboard)) {
    try {
      const { leaderboard, refreshed } = await refreshLeaderboard({ force: true });
      return { leaderboard, refreshed, stale: false, error: null };
    } catch (error) {
      return {
        leaderboard: cachedLeaderboard,
        refreshed: false,
        stale: true,
        error: error.message
      };
    }
  }

  return { leaderboard: cachedLeaderboard, refreshed: false, stale: false, error: null };
};

export const warmLeaderboardCache = async () => {
  await ensureCacheLoaded();

  try {
    await refreshLeaderboard();
  } catch (error) {
    console.warn('Leaderboard refresh skipped:', error.message);
  }
};

export const scheduleLeaderboardRefresh = () => {
  const schedule = process.env.LEADERBOARD_REFRESH_CRON || DEFAULT_CRON;
  const timezone = process.env.LEADERBOARD_REFRESH_TZ || DEFAULT_TZ;

  cron.schedule(schedule, async () => {
    try {
      await refreshLeaderboard({ force: true });
      console.log('Leaderboard refreshed via schedule.');
    } catch (error) {
      console.warn('Scheduled leaderboard refresh failed:', error.message);
    }
  }, { timezone });
};
