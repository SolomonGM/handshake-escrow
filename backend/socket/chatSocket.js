import jwt from 'jsonwebtoken';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Announcement from '../models/Announcement.js';
import PassOrder from '../models/PassOrder.js';
import { completePassOrder } from '../controllers/passController.js';
import { upsertPassTransactionHistory } from '../services/passTransactionHistory.js';
import { isDeveloperUser, isStaffUser } from '../utils/staffUtils.js';
import { checkRapidMessageSpam } from '../utils/chatSpamGuard.js';

const activeUsers = new Map();

let automationInterval = null;
let automationInFlight = false;

const BOT_PROFILE = {
  userId: 'N/A',
  username: 'Handshake',
  avatar: null,
  role: 'BOT',
  rank: 'bot',
  badge: null
};

const GIVEAWAY_DEFAULT_DURATION_MS = 5 * 60 * 1000;
const PRIVATE_BOT_MESSAGE_TTL_MS = 30 * 1000;
const GIVEAWAY_MIN_DURATION_MS = 30 * 1000;
const GIVEAWAY_MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const SCHEDULE_MIN_DELAY_MS = 10 * 1000;
const COMMAND_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const moderationCommands = [
  {
    command: '/mute @user [reason]',
    description: 'Mute a user indefinitely in chat',
    example: '/mute @spammer flooding chat'
  },
  {
    command: '/timeout @user <duration> [reason]',
    description: 'Temporarily mute a user (e.g. 10m, 2h, 1d)',
    example: '/timeout @spammer 30m cooldown'
  },
  {
    command: '/unmute @user',
    description: 'Remove a user mute',
    example: '/unmute @spammer'
  },
  {
    command: '/help',
    description: 'Show available staff commands',
    example: '/help'
  }
];

const adminModerationCommands = [
  {
    command: '/ban @user [reason]',
    description: 'Permanently ban a user from chat',
    example: '/ban @botfarm repeated abuse'
  },
  {
    command: '/permban @user [reason]',
    description: 'Alias for /ban',
    example: '/permban @botfarm repeated abuse'
  },
  {
    command: '/unban @user',
    description: 'Remove a chat ban',
    example: '/unban @user'
  }
];

const moderatorAnnouncementCommands = [
  {
    command: '/pin <message>',
    description: 'Pin a message at the top of chat',
    example: '/pin Verify trades only inside Handshake.'
  }
];

const adminAnnouncementCommands = [
  ...moderatorAnnouncementCommands,
  {
    command: '/unpin',
    description: 'Remove the active pinned message',
    example: '/unpin'
  },
  {
    command: '/announce [Title] | [Message] | [ImageURL]',
    description: 'Create a standard announcement card',
    example: '/announce Update | We deploy in 30m | https://example.com/image.png'
  },
  {
    command: '/clearannounce',
    description: 'Remove active standard announcement cards',
    example: '/clearannounce'
  },
  {
    command: '/schedule <time> <message>',
    description: 'Schedule an announcement (time: 30m, 2h, or ISO date)',
    example: '/schedule 30m Maintenance starts in 30 minutes.'
  },
  {
    command: '/schedule list',
    description: 'List pending scheduled announcements with countdowns',
    example: '/schedule list'
  },
  {
    command: '/schedule cancel <id>',
    description: 'Cancel a pending scheduled announcement',
    example: '/schedule cancel A1B2C3'
  },
  {
    command: '/schedule edit <id> <time> <message>',
    description: 'Edit time/message of a pending schedule',
    example: '/schedule edit A1B2C3 45m Maintenance delayed by 15 minutes.'
  },
  {
    command: '/alert <message>',
    description: 'Show a high-priority pop-up on all screens',
    example: '/alert Emergency maintenance starts now.'
  }
];

const giveawayCommands = [
  {
    command: '/pass-giveaway <passes> <winners> [duration]',
    description: 'Run a pass giveaway with clickable entry button',
    example: '/pass-giveaway 2 3 5m'
  }
];

const passManagementCommands = [
  {
    command: '/pass-return <user> [orderId] [reason]',
    description: 'Unlock a stuck pass purchase and return user to selection',
    example: '/pass-return @client PASS-1234 amount mismatch resolved'
  },
  {
    command: '/pass-complete <user> [orderId] [txHash] [note]',
    description: 'Force-complete a pass order and credit passes',
    example: '/pass-complete 12345678901234567 PASS-1234 0xabc123 manual fix'
  },
  {
    command: '/refund <user> <address|prompt> <coin> <message>',
    description: 'Mark a pass order refunded, optionally prompting for address first',
    example: '/refund @client 0xabc... eth internal bot mismatch'
  },
  {
    command: '/pass-order <user> [orderId]',
    description: 'Inspect latest pass order context for a user',
    example: '/pass-order @client'
  }
];

const PASS_MONITORED_STATUSES = ['pending', 'confirmed', 'awaiting-staff', 'failed', 'timedout', 'expired'];
const PASS_RESOLVABLE_STATUSES = ['pending', 'confirmed', 'awaiting-staff', 'failed', 'timedout', 'expired', 'returned'];
const PASS_REFUNDABLE_STATUSES = ['pending', 'confirmed', 'awaiting-staff', 'failed', 'timedout', 'expired', 'completed', 'returned'];

const REFUND_COIN_ALIASES = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  ltc: 'litecoin',
  litecoin: 'litecoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  usdt: 'usdt-erc20',
  'usdt-erc20': 'usdt-erc20',
  usdc: 'usdc-erc20',
  'usdc-erc20': 'usdc-erc20'
};

const muteBroadcastTemplates = [
  'Take a breather {user} (Muted).',
  '{user} is now in quiet mode (Muted).',
  '{user} has been put on timeout (Muted).'
];

const banBroadcastTemplates = [
  'Take a hike {user} (Banned).',
  '{user} has been escorted out (Banned).',
  'Door is that way {user} (Banned).'
];

const parseDurationToMs = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d+)(s|m|h|d|w)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = (match[2] || 'm').toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };
  return amount * (multipliers[unit] || multipliers.m);
};

const parseScheduledTime = (rawValue) => {
  if (!rawValue) return null;
  const value = String(rawValue).trim();
  if (!value) return null;

  const stripped = value.toLowerCase().startsWith('in ')
    ? value.slice(3).trim()
    : value;

  const durationMs = parseDurationToMs(stripped);
  if (durationMs) {
    return new Date(Date.now() + durationMs);
  }

  const absolute = new Date(value);
  if (Number.isNaN(absolute.getTime())) {
    return null;
  }

  return absolute;
};

const formatMs = (ms) => {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatCountdown = (targetDate) => {
  if (!targetDate) return 'unknown';
  const timestamp = new Date(targetDate).getTime();
  if (Number.isNaN(timestamp)) return 'unknown';
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'now';
  return formatMs(diff);
};

const generateCommandId = () => {
  let id = '';
  for (let index = 0; index < 6; index += 1) {
    id += COMMAND_ID_CHARS[Math.floor(Math.random() * COMMAND_ID_CHARS.length)];
  }
  return id;
};

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

const getModerationPower = (user) => {
  if (!user) return 0;
  if (user.rank === 'developer') return 3;
  if (user.role === 'admin') return 2;
  if (user.role === 'moderator') return 1;
  return 0;
};

const buildBotMessagePayload = (message, meta = {}) => ({
  ...meta,
  id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  userId: BOT_PROFILE.userId,
  username: BOT_PROFILE.username,
  avatar: BOT_PROFILE.avatar,
  role: BOT_PROFILE.role,
  rank: BOT_PROFILE.rank,
  badge: BOT_PROFILE.badge,
  message,
  timestamp: new Date().toISOString(),
  isBot: true
});

const emitPrivateBotMessage = (socket, message, meta = {}) => {
  socket.emit('command_feedback', buildBotMessagePayload(message, {
    isGlobal: false,
    ttlMs: PRIVATE_BOT_MESSAGE_TTL_MS,
    ...meta
  }));
};

const emitPublicBotMessage = (io, message, meta = {}) => {
  io.emit('new_message', buildBotMessagePayload(message, {
    isGlobal: true,
    ...meta
  }));
};

const resolveChatModerationBlock = async (user) => {
  const moderation = user?.chatModeration || {};
  const now = new Date();
  const updates = {};

  if (moderation.isBanned) {
    if (moderation.bannedUntil && moderation.bannedUntil <= now) {
      updates['chatModeration.isBanned'] = false;
      updates['chatModeration.bannedUntil'] = null;
      updates['chatModeration.bannedReason'] = null;
      updates['chatModeration.bannedBy'] = null;
    } else {
      const untilText = moderation.bannedUntil
        ? ` until ${new Date(moderation.bannedUntil).toLocaleString()}`
        : '';
      return {
        blocked: true,
        message: `You are banned from chat${untilText}.`
      };
    }
  }

  if (moderation.isMuted) {
    if (moderation.mutedUntil && moderation.mutedUntil <= now) {
      updates['chatModeration.isMuted'] = false;
      updates['chatModeration.mutedUntil'] = null;
      updates['chatModeration.mutedReason'] = null;
      updates['chatModeration.mutedBy'] = null;
    } else {
      const untilText = moderation.mutedUntil
        ? ` until ${new Date(moderation.mutedUntil).toLocaleString()}`
        : '';
      return {
        blocked: true,
        message: `You are muted in chat${untilText}.`
      };
    }
  }

  if (Object.keys(updates).length > 0 && user?._id) {
    await User.findByIdAndUpdate(user._id, { $set: updates });
  }

  return { blocked: false };
};

const findUserByIdentifier = async (identifier) => {
  if (!identifier) return null;
  const raw = identifier.startsWith('@') ? identifier.slice(1) : identifier;
  if (!raw) return null;

  if (/^\d{17}$/.test(raw)) {
    return User.findOne({ userId: raw });
  }

  return User.findOne({ username: new RegExp(`^${raw}$`, 'i') });
};

const normalizeRefundCoin = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return REFUND_COIN_ALIASES[normalized] || null;
};

const isValidRefundAddress = (address, coin) => {
  const trimmed = String(address || '').trim();
  if (!trimmed || !coin) return false;

  if (coin === 'bitcoin') {
    return /^(bc1|tb1|[13mn2])[a-zA-Z0-9]{20,}$/i.test(trimmed);
  }

  if (coin === 'litecoin') {
    return /^(ltc1|tltc1|[LM3mn2Q])[a-zA-Z0-9]{20,}$/i.test(trimmed);
  }

  if (coin === 'ethereum' || coin === 'usdt-erc20' || coin === 'usdc-erc20') {
    return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  }

  if (coin === 'solana') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
  }

  return trimmed.length >= 20;
};

const emitPrivateBotMessageToUser = (io, userId, message, meta = {}) => {
  const active = activeUsers.get(String(userId || ''));
  if (!active?.socketId) {
    return false;
  }

  const targetSocket = io.sockets.sockets.get(active.socketId);
  if (!targetSocket) {
    return false;
  }

  emitPrivateBotMessage(targetSocket, message, meta);
  return true;
};

const appendOrderAdminAction = (order, action, actor, details, metadata = {}) => {
  if (!order) return;
  if (!Array.isArray(order.adminActions)) {
    order.adminActions = [];
  }
  order.adminActions.push({
    action,
    actor,
    details,
    metadata,
    createdAt: new Date()
  });
};

const resolvePassOrderForUser = async ({ targetUser, orderId = '', statuses = PASS_MONITORED_STATUSES }) => {
  if (!targetUser?._id) return null;

  const query = { user: targetUser._id };

  const normalizedOrderId = String(orderId || '').trim();
  if (normalizedOrderId) {
    query.orderId = normalizedOrderId;
  }

  if (Array.isArray(statuses) && statuses.length > 0) {
    query.status = { $in: statuses };
  }

  return PassOrder.findOne(query).sort({ createdAt: -1 });
};

const isLikelyOrderId = (value) => /^PASS-/i.test(String(value || '').trim());

const isLikelyTxHash = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.startsWith('0x') && raw.length >= 18) return true;
  return /^[A-Fa-f0-9]{16,}$/.test(raw);
};

const toAnnouncementPayload = (announcement) => {
  const payload = {
    id: String(announcement._id),
    type: announcement.type || 'announcement',
    title: announcement.title,
    message: announcement.message,
    imageUrl: announcement.imageUrl || null,
    commandId: announcement.commandId || null,
    createdAt: announcement.createdAt,
    expiresAt: announcement.expiresAt || null,
    scheduledFor: announcement.scheduledFor || null
  };

  if (payload.type === 'giveaway') {
    const entries = Array.isArray(announcement?.giveaway?.entries)
      ? announcement.giveaway.entries
      : [];

    payload.giveaway = {
      passesPerWinner: announcement?.giveaway?.passesPerWinner || 0,
      winnerCount: announcement?.giveaway?.winnerCount || 0,
      endsAt: announcement?.giveaway?.endsAt || null,
      status: announcement?.giveaway?.status || 'open',
      participantCount: entries.length,
      winnerUsernames: announcement?.giveaway?.winnerUsernames || []
    };
  }

  return payload;
};

const fetchActiveAnnouncements = async () => {
  const now = new Date();
  const records = await Announcement.find({
    isActive: true,
    isCancelled: { $ne: true },
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: now } }
    ]
  })
    .sort({ createdAt: -1 })
    .lean();

  return records.map(toAnnouncementPayload);
};

const emitActiveAnnouncements = async (emitter) => {
  const payload = await fetchActiveAnnouncements();
  emitter.emit('chat_announcements', payload);
  emitter.emit('chat_announcement', payload[0] || null);
};

const updateActiveUserList = (io) => {
  io.emit('active_users', {
    count: activeUsers.size,
    users: Array.from(activeUsers.values()).map((entry) => ({
      username: entry.username,
      rank: entry.rank
    }))
  });
};

const processScheduledAnnouncements = async (io) => {
  const dueSchedules = await Announcement.find({
    type: 'scheduled',
    isActive: false,
    isCancelled: { $ne: true },
    scheduledFor: { $ne: null, $lte: new Date() }
  });

  if (dueSchedules.length === 0) {
    return false;
  }

  for (const scheduled of dueSchedules) {
    scheduled.type = 'announcement';
    scheduled.isActive = true;
    await scheduled.save();

    emitPublicBotMessage(
      io,
      `Scheduled announcement ${scheduled.commandId || scheduled._id} is now live.`,
      { commandEvent: 'schedule_run' }
    );
  }

  return true;
};

const processExpiredAnnouncements = async () => {
  const expiration = await Announcement.updateMany(
    {
      isActive: true,
      expiresAt: { $ne: null, $lte: new Date() }
    },
    {
      $set: { isActive: false }
    }
  );

  return Number(expiration.modifiedCount || 0) > 0;
};

const pickWinners = (userIds, count) => {
  const pool = [...userIds];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, count);
};

const completeDueGiveaways = async (io) => {
  const dueGiveaways = await Announcement.find({
    type: 'giveaway',
    isActive: true,
    'giveaway.status': 'open',
    'giveaway.endsAt': { $ne: null, $lte: new Date() }
  });

  if (dueGiveaways.length === 0) {
    return false;
  }

  for (const giveaway of dueGiveaways) {
    const entries = Array.isArray(giveaway?.giveaway?.entries)
      ? giveaway.giveaway.entries.map((entry) => String(entry))
      : [];
    const uniqueEntries = [...new Set(entries)];
    const winnerCount = Math.min(
      Number(giveaway?.giveaway?.winnerCount || 0),
      uniqueEntries.length
    );

    const selectedWinnerIds = winnerCount > 0
      ? pickWinners(uniqueEntries, winnerCount)
      : [];

    let winnerUsernames = [];
    if (selectedWinnerIds.length > 0) {
      const passesPerWinner = Number(giveaway?.giveaway?.passesPerWinner || 0);
      await User.updateMany(
        { _id: { $in: selectedWinnerIds } },
        { $inc: { passes: passesPerWinner } }
      );

      const winners = await User.find({ _id: { $in: selectedWinnerIds } })
        .select('username')
        .lean();
      winnerUsernames = winners.map((winner) => winner.username);
    }

    giveaway.isActive = false;
    giveaway.giveaway.status = 'completed';
    giveaway.giveaway.winnerIds = selectedWinnerIds;
    giveaway.giveaway.winnerUsernames = winnerUsernames;
    giveaway.giveaway.completedAt = new Date();
    await giveaway.save();

    if (winnerUsernames.length > 0) {
      emitPublicBotMessage(
        io,
        `Pass giveaway ${giveaway.commandId || giveaway._id} ended. Winners: ${winnerUsernames.map((name) => `@${name}`).join(', ')}.`,
        { commandEvent: 'giveaway_complete' }
      );
    } else {
      emitPublicBotMessage(
        io,
        `Pass giveaway ${giveaway.commandId || giveaway._id} ended with no valid entries.`,
        { commandEvent: 'giveaway_complete' }
      );
    }
  }

  return true;
};

const startAutomationLoop = (io) => {
  if (automationInterval) {
    return;
  }

  automationInterval = setInterval(async () => {
    if (automationInFlight) {
      return;
    }

    automationInFlight = true;
    try {
      let changed = false;
      if (await processScheduledAnnouncements(io)) changed = true;
      if (await processExpiredAnnouncements()) changed = true;
      if (await completeDueGiveaways(io)) changed = true;

      if (changed) {
        await emitActiveAnnouncements(io);
      }
    } catch (error) {
      console.error('Announcement automation error:', error);
    } finally {
      automationInFlight = false;
    }
  }, 1000);
};

const getRoleFlags = (user) => {
  const isDeveloper = isDeveloperUser(user);
  const isAdmin = isDeveloper || user?.role === 'admin';
  const isModerator = user?.role === 'moderator';
  const isStaff = isStaffUser(user);
  return {
    isDeveloper,
    isAdmin,
    isModerator,
    isStaff
  };
};

const ensureModerationTarget = async ({ socket, args, command, actorIsAdmin }) => {
  const targetArg = args[0];
  const targetUser = await findUserByIdentifier(targetArg || '');

  if (!targetArg || !targetUser) {
    emitPrivateBotMessage(socket, 'User not found. Provide @username or 17-digit user ID.');
    return { ok: false };
  }

  if (String(targetUser._id) === String(socket.user._id)) {
    emitPrivateBotMessage(socket, 'You cannot moderate yourself.');
    return { ok: false };
  }

  const actorPower = getModerationPower(socket.user);
  const targetPower = getModerationPower(targetUser);
  if (targetPower >= actorPower) {
    emitPrivateBotMessage(socket, `You cannot use ${command} on @${targetUser.username}.`);
    return { ok: false };
  }

  if (!actorIsAdmin && (command === '/ban' || command === '/permban' || command === '/unban')) {
    emitPrivateBotMessage(socket, 'Only admins can use ban commands.');
    return { ok: false };
  }

  return { ok: true, targetUser };
};

const handleScheduleCommand = async ({ socket, args }) => {
  const subcommand = (args[0] || '').toLowerCase();

  if (subcommand === 'list') {
    const scheduled = await Announcement.find({
      type: 'scheduled',
      isActive: false,
      isCancelled: { $ne: true },
      scheduledFor: { $gt: new Date() }
    })
      .sort({ scheduledFor: 1 })
      .lean();

    if (scheduled.length === 0) {
      emitPrivateBotMessage(socket, 'No scheduled announcements are pending.');
      return true;
    }

    const lines = scheduled.map((item) => (
      `#${item.commandId || item._id}: ${formatCountdown(item.scheduledFor)} (${new Date(item.scheduledFor).toLocaleString()}) - ${item.message}`
    ));
    emitPrivateBotMessage(socket, `Scheduled announcements:\n${lines.join('\n')}`);
    return true;
  }

  if (subcommand === 'cancel') {
    const commandId = String(args[1] || '').trim().toUpperCase();
    if (!commandId) {
      emitPrivateBotMessage(socket, 'Usage: /schedule cancel <id>');
      return true;
    }

    const scheduled = await Announcement.findOne({
      type: 'scheduled',
      commandId,
      isActive: false,
      isCancelled: { $ne: true }
    });

    if (!scheduled) {
      emitPrivateBotMessage(socket, `No pending schedule found for ID ${commandId}.`);
      return true;
    }

    scheduled.isCancelled = true;
    await scheduled.save();
    emitPrivateBotMessage(socket, `Cancelled schedule ${commandId}.`);
    return true;
  }

  if (subcommand === 'edit') {
    const commandId = String(args[1] || '').trim().toUpperCase();
    const timeArg = args[2];
    const updatedMessage = args.slice(3).join(' ').trim();

    if (!commandId || !timeArg || !updatedMessage) {
      emitPrivateBotMessage(socket, 'Usage: /schedule edit <id> <time> <message>');
      return true;
    }

    const runAt = parseScheduledTime(timeArg);
    if (!runAt || (runAt.getTime() - Date.now()) < SCHEDULE_MIN_DELAY_MS) {
      emitPrivateBotMessage(socket, 'Schedule time must be valid and at least 10 seconds in the future.');
      return true;
    }

    const scheduled = await Announcement.findOne({
      type: 'scheduled',
      commandId,
      isActive: false,
      isCancelled: { $ne: true }
    });

    if (!scheduled) {
      emitPrivateBotMessage(socket, `No pending schedule found for ID ${commandId}.`);
      return true;
    }

    scheduled.scheduledFor = runAt;
    scheduled.message = updatedMessage;
    await scheduled.save();
    emitPrivateBotMessage(
      socket,
      `Updated schedule ${commandId}. Runs in ${formatCountdown(runAt)} (${runAt.toLocaleString()}).`
    );
    return true;
  }

  const timeArg = args[0];
  const message = args.slice(1).join(' ').trim();
  if (!timeArg || !message) {
    emitPrivateBotMessage(socket, 'Usage: /schedule <time> <message>');
    return true;
  }

  const runAt = parseScheduledTime(timeArg);
  if (!runAt || (runAt.getTime() - Date.now()) < SCHEDULE_MIN_DELAY_MS) {
    emitPrivateBotMessage(socket, 'Schedule time must be valid and at least 10 seconds in the future.');
    return true;
  }

  const commandId = generateCommandId();
  await Announcement.create({
    type: 'scheduled',
    title: 'Scheduled Announcement',
    message,
    imageUrl: null,
    createdBy: socket.user._id,
    commandId,
    isActive: false,
    isCancelled: false,
    scheduledFor: runAt
  });

  emitPrivateBotMessage(
    socket,
    `Scheduled announcement ${commandId} created. Countdown: ${formatCountdown(runAt)} (${runAt.toLocaleString()}).`
  );
  return true;
};

const handlePassAdminCommand = async ({ io, socket, command, args }) => {
  const targetArg = args[0];
  const targetUser = await findUserByIdentifier(targetArg || '');
  if (!targetArg || !targetUser) {
    emitPrivateBotMessage(socket, 'User not found. Provide @username or 17-digit user ID.');
    return true;
  }

  if (command === '/pass-order') {
    const orderIdArg = isLikelyOrderId(args[1]) ? String(args[1]).trim() : '';
    const order = await resolvePassOrderForUser({
      targetUser,
      orderId: orderIdArg,
      statuses: []
    });

    if (!order) {
      emitPrivateBotMessage(socket, `No pass order found for @${targetUser.username}.`);
      return true;
    }

    const summaryLines = [
      `Order: ${order.orderId}`,
      `Status: ${order.status}`,
      `Coin: ${order.cryptocurrency}`,
      `Amount: ${order.cryptoAmount}`,
      `Passes: ${order.passCount}`,
      `Address: ${order.paymentAddress}`,
      `TX: ${order.transactionHash || 'N/A'}`,
      `Updated: ${new Date(order.updatedAt || order.createdAt).toLocaleString()}`
    ];
    emitPrivateBotMessage(socket, `Pass order for @${targetUser.username}:\n${summaryLines.join('\n')}`);
    return true;
  }

  if (command === '/pass-return') {
    const orderIdArg = isLikelyOrderId(args[1]) ? String(args[1]).trim() : '';
    const reason = args.slice(orderIdArg ? 2 : 1).join(' ').trim() || 'Manual return by admin.';

    const order = await resolvePassOrderForUser({
      targetUser,
      orderId: orderIdArg,
      statuses: PASS_RESOLVABLE_STATUSES
    });

    if (!order) {
      emitPrivateBotMessage(socket, `No resolvable pass order found for @${targetUser.username}.`);
      return true;
    }

    if (order.status === 'completed' || order.status === 'refunded') {
      emitPrivateBotMessage(socket, `Order ${order.orderId} is already ${order.status}.`);
      return true;
    }

    order.status = 'returned';
    order.returnedAt = new Date();
    order.returnedBy = socket.user._id;
    order.returnReason = reason;
    order.timeoutDetails = {
      ...(order.timeoutDetails || {}),
      manualVerification: true,
      staffContactRequested: false,
      staffNotes: reason
    };
    order.transactionDetails = {
      ...(order.transactionDetails || {}),
      paymentNotes: `${order.transactionDetails?.paymentNotes || ''}\n[RETURN ${new Date().toISOString()}] ${reason}`.trim()
    };
    appendOrderAdminAction(order, 'return', socket.user._id, reason, {
      orderId: order.orderId,
      targetUserId: targetUser.userId
    });
    await order.save();

    io.emit(`pass_order_update:${order.orderId}`, {
      orderId: order.orderId,
      status: 'returned',
      message: `Staff returned this order to selection. ${reason}`,
      resolvedBy: socket.user.username,
      resolvedAt: order.returnedAt
    });

    const targetNotified = emitPrivateBotMessageToUser(
      io,
      targetUser._id,
      `Your pass order ${order.orderId} was unlocked by staff. You can go back to pass selection now.`
    );

    emitPrivateBotMessage(
      socket,
      `Order ${order.orderId} returned for @${targetUser.username}.${targetNotified ? '' : ' User is offline.'}`
    );
    return true;
  }

  if (command === '/pass-complete') {
    const orderIdArg = isLikelyOrderId(args[1]) ? String(args[1]).trim() : '';
    const potentialTxArgIndex = orderIdArg ? 2 : 1;
    const txArg = isLikelyTxHash(args[potentialTxArgIndex]) ? String(args[potentialTxArgIndex]).trim() : '';
    const note = args
      .slice(txArg ? potentialTxArgIndex + 1 : (orderIdArg ? 2 : 1))
      .join(' ')
      .trim();

    const order = await resolvePassOrderForUser({
      targetUser,
      orderId: orderIdArg,
      statuses: [...PASS_RESOLVABLE_STATUSES, 'completed']
    });

    if (!order) {
      emitPrivateBotMessage(socket, `No completable pass order found for @${targetUser.username}.`);
      return true;
    }

    if (order.status === 'refunded') {
      emitPrivateBotMessage(socket, `Order ${order.orderId} is already refunded and cannot be force-completed.`);
      return true;
    }

    const txHash = txArg || order.transactionHash || `manual-${Date.now()}-${String(order._id).slice(-6)}`;
    const completed = await completePassOrder(order.orderId, txHash, io);
    if (!completed) {
      emitPrivateBotMessage(socket, `Failed to complete order ${order.orderId}.`);
      return true;
    }

    const refreshedOrder = await PassOrder.findOne({ orderId: order.orderId }).populate('user', 'username passes');
    if (!refreshedOrder) {
      emitPrivateBotMessage(socket, `Order ${order.orderId} completed but could not be reloaded.`);
      return true;
    }

    refreshedOrder.timeoutDetails = {
      ...(refreshedOrder.timeoutDetails || {}),
      manualVerification: true,
      staffContactRequested: false,
      staffNotes: note || 'Force completed by admin.'
    };
    refreshedOrder.transactionDetails = {
      ...(refreshedOrder.transactionDetails || {}),
      paymentNotes: `${refreshedOrder.transactionDetails?.paymentNotes || ''}\n[FORCE-COMPLETE ${new Date().toISOString()}] ${note || 'Force completed by admin.'}`.trim()
    };
    appendOrderAdminAction(refreshedOrder, 'force-complete', socket.user._id, note || 'Force completed by admin.', {
      orderId: refreshedOrder.orderId,
      transactionHash: txHash
    });
    await refreshedOrder.save();
    await upsertPassTransactionHistory(refreshedOrder, 'completed');

    const newBalance = refreshedOrder?.transactionDetails?.balanceAfter ?? refreshedOrder?.user?.passes;

    const targetNotified = emitPrivateBotMessageToUser(
      io,
      targetUser._id,
      `Your pass order ${refreshedOrder.orderId} was completed by staff. Passes credited: ${refreshedOrder.passCount}.`
    );

    emitPrivateBotMessage(
      socket,
      `Order ${refreshedOrder.orderId} force-completed for @${targetUser.username}. Balance: ${newBalance ?? 'N/A'}.${targetNotified ? '' : ' User is offline.'}`
    );
    return true;
  }

  if (command === '/refund') {
    const addressOrPrompt = String(args[1] || '').trim();
    const coinArg = String(args[2] || '').trim();
    const refundMessage = args.slice(3).join(' ').trim() || 'Manual refund issued by admin.';

    if (!addressOrPrompt || !coinArg) {
      emitPrivateBotMessage(socket, 'Usage: /refund <user> <address|prompt> <coin> <message>');
      return true;
    }

    const normalizedCoin = normalizeRefundCoin(coinArg);
    if (!normalizedCoin) {
      emitPrivateBotMessage(socket, 'Unsupported coin. Use one of: btc, ltc, eth, sol, usdt, usdc.');
      return true;
    }

    const order = await resolvePassOrderForUser({
      targetUser,
      statuses: PASS_REFUNDABLE_STATUSES
    });

    if (!order) {
      emitPrivateBotMessage(socket, `No refundable pass order found for @${targetUser.username}.`);
      return true;
    }

    if (order.status === 'refunded') {
      emitPrivateBotMessage(socket, `Order ${order.orderId} is already refunded.`);
      return true;
    }

    if (addressOrPrompt.toLowerCase() === 'prompt') {
      order.status = 'awaiting-staff';
      order.timeoutDetails = {
        ...(order.timeoutDetails || {}),
        manualVerification: true,
        staffContactRequested: true,
        staffNotes: `Refund prompt issued by @${socket.user.username}: ${refundMessage}`
      };
      appendOrderAdminAction(order, 'refund', socket.user._id, 'Prompted user for refund address', {
        orderId: order.orderId,
        coin: normalizedCoin,
        message: refundMessage
      });
      await order.save();

      const promptText = `Staff is reviewing a ${normalizedCoin.toUpperCase()} refund for order ${order.orderId}. Please send your ${normalizedCoin.toUpperCase()} refund address in live chat.`;
      const targetNotified = emitPrivateBotMessageToUser(io, targetUser._id, promptText);
      io.emit(`pass_order_update:${order.orderId}`, {
        orderId: order.orderId,
        status: 'awaiting-staff',
        message: 'Staff requested a refund address in live chat.'
      });
      emitPrivateBotMessage(
        socket,
        `Refund prompt sent for order ${order.orderId}.${targetNotified ? '' : ' User is offline.'}`
      );
      return true;
    }

    if (!isValidRefundAddress(addressOrPrompt, normalizedCoin)) {
      emitPrivateBotMessage(socket, `Invalid ${normalizedCoin.toUpperCase()} refund address format.`);
      return true;
    }

    const refundAddress = addressOrPrompt;
    const targetUserRecord = await User.findById(targetUser._id).select('passes username');
    const balanceBefore = Number(targetUserRecord?.passes || 0);
    let balanceAfter = balanceBefore;

    if (order.status === 'completed' && targetUserRecord) {
      const passDebit = Math.min(order.passCount || 0, balanceBefore);
      if (passDebit > 0) {
        targetUserRecord.passes = balanceBefore - passDebit;
        balanceAfter = targetUserRecord.passes;
        await targetUserRecord.save();
      }
    }

    order.status = 'refunded';
    order.refundedAt = new Date();
    order.refundedBy = socket.user._id;
    order.refundAddress = refundAddress;
    order.refundCoin = normalizedCoin;
    order.refundMessage = refundMessage;
    order.refundTransactionHash = order.refundTransactionHash || `manual-refund-${Date.now()}-${String(order._id).slice(-6)}`;
    order.timeoutDetails = {
      ...(order.timeoutDetails || {}),
      manualVerification: true,
      staffContactRequested: true,
      staffNotes: `Refund by @${socket.user.username}: ${refundMessage}`
    };
    order.transactionDetails = {
      ...(order.transactionDetails || {}),
      balanceBefore,
      balanceAfter,
      paymentNotes: `${order.transactionDetails?.paymentNotes || ''}\n[REFUND ${new Date().toISOString()}] ${normalizedCoin.toUpperCase()} -> ${refundAddress}. ${refundMessage}`.trim()
    };
    appendOrderAdminAction(order, 'refund', socket.user._id, refundMessage, {
      orderId: order.orderId,
      coin: normalizedCoin,
      address: refundAddress,
      balanceBefore,
      balanceAfter
    });
    await order.save();
    await upsertPassTransactionHistory(order, 'refunded');

    io.emit(`pass_order_update:${order.orderId}`, {
      orderId: order.orderId,
      status: 'refunded',
      message: `Refund marked by staff. ${normalizedCoin.toUpperCase()} destination: ${refundAddress}`
    });

    const targetNotified = emitPrivateBotMessageToUser(
      io,
      targetUser._id,
      `Your pass order ${order.orderId} was marked refunded by staff. Refund address: ${refundAddress}.`
    );

    emitPrivateBotMessage(
      socket,
      `Order ${order.orderId} marked refunded for @${targetUser.username}. Pass balance: ${balanceBefore} -> ${balanceAfter}.${targetNotified ? '' : ' User is offline.'}`
    );
    return true;
  }

  return false;
};

const handleModerationCommand = async ({ io, socket, command, args, roleFlags }) => {
  if (!roleFlags.isStaff) {
    emitPrivateBotMessage(socket, 'You do not have permission to use moderation commands.');
    return true;
  }

  if ((command === '/ban' || command === '/permban' || command === '/unban') && !roleFlags.isAdmin) {
    emitPrivateBotMessage(socket, 'Only admins can use ban commands.');
    return true;
  }

  const targetCheck = await ensureModerationTarget({
    socket,
    args,
    command,
    actorIsAdmin: roleFlags.isAdmin
  });
  if (!targetCheck.ok) {
    return true;
  }

  const { targetUser } = targetCheck;

  if (command === '/mute') {
    const reason = args.slice(1).join(' ').trim() || null;
    await User.findByIdAndUpdate(targetUser._id, {
      $set: {
        'chatModeration.isMuted': true,
        'chatModeration.mutedUntil': null,
        'chatModeration.mutedReason': reason,
        'chatModeration.mutedBy': socket.user._id
      }
    });
    emitPrivateBotMessage(socket, `Muted @${targetUser.username}${reason ? ` (${reason})` : ''}.`);
    emitPublicBotMessage(
      io,
      pickRandom(muteBroadcastTemplates).replace('{user}', `@${targetUser.username}`),
      { commandEvent: 'mute_public' }
    );
    return true;
  }

  if (command === '/timeout') {
    const durationArg = args[1];
    const durationMs = parseDurationToMs(durationArg);
    if (!durationMs) {
      emitPrivateBotMessage(socket, 'Usage: /timeout @user <duration> [reason]');
      return true;
    }

    const reason = args.slice(2).join(' ').trim() || null;
    const mutedUntil = new Date(Date.now() + durationMs);
    await User.findByIdAndUpdate(targetUser._id, {
      $set: {
        'chatModeration.isMuted': true,
        'chatModeration.mutedUntil': mutedUntil,
        'chatModeration.mutedReason': reason,
        'chatModeration.mutedBy': socket.user._id
      }
    });
    emitPrivateBotMessage(
      socket,
      `Timed out @${targetUser.username} until ${mutedUntil.toLocaleString()}${reason ? ` (${reason})` : ''}.`
    );
    return true;
  }

  if (command === '/unmute') {
    await User.findByIdAndUpdate(targetUser._id, {
      $set: {
        'chatModeration.isMuted': false,
        'chatModeration.mutedUntil': null,
        'chatModeration.mutedReason': null,
        'chatModeration.mutedBy': null
      }
    });
    emitPrivateBotMessage(socket, `Unmuted @${targetUser.username}.`);
    return true;
  }

  if (command === '/ban' || command === '/permban') {
    const reason = args.slice(1).join(' ').trim() || null;
    await User.findByIdAndUpdate(targetUser._id, {
      $set: {
        'chatModeration.isBanned': true,
        'chatModeration.bannedUntil': null,
        'chatModeration.bannedReason': reason,
        'chatModeration.bannedBy': socket.user._id
      }
    });
    emitPrivateBotMessage(socket, `Permanently banned @${targetUser.username}${reason ? ` (${reason})` : ''}.`);
    emitPublicBotMessage(
      io,
      pickRandom(banBroadcastTemplates).replace('{user}', `@${targetUser.username}`),
      { commandEvent: 'ban_public' }
    );
    return true;
  }

  if (command === '/unban') {
    await User.findByIdAndUpdate(targetUser._id, {
      $set: {
        'chatModeration.isBanned': false,
        'chatModeration.bannedUntil': null,
        'chatModeration.bannedReason': null,
        'chatModeration.bannedBy': null
      }
    });
    emitPrivateBotMessage(socket, `Unbanned @${targetUser.username}.`);
    return true;
  }

  return false;
};

const handleSlashCommand = async ({ io, socket, command, args, rawArgs, roleFlags }) => {
  if (command === '/help') {
    if (!roleFlags.isStaff) {
      emitPrivateBotMessage(socket, '/help is only available to moderators and admins.');
      return true;
    }

    const sections = [
      {
        title: 'Moderation',
        commands: moderationCommands
      }
    ];

    if (roleFlags.isAdmin) {
      sections.push({
        title: 'Admin',
        commands: adminModerationCommands
      });
    }

    sections.push({
      title: 'Announcements',
      commands: roleFlags.isAdmin ? adminAnnouncementCommands : moderatorAnnouncementCommands
    });

    if (roleFlags.isAdmin) {
      sections.push({
        title: 'Giveaways',
        commands: giveawayCommands
      });
      sections.push({
        title: 'Pass Operations',
        commands: passManagementCommands
      });
    }

    socket.emit('chat_help', {
      title: roleFlags.isAdmin ? 'Admin Command Center' : 'Moderator Command Center',
      subtitle: roleFlags.isAdmin
        ? 'Moderation, admin, announcement, giveaway, and pass recovery tools'
        : 'Moderation plus allowed announcement tools',
      sections,
      footer: 'Commands are restricted by role.'
    });
    emitPrivateBotMessage(socket, 'Opened command help.');
    return true;
  }

  if (command === '/pin') {
    if (!roleFlags.isStaff) {
      emitPrivateBotMessage(socket, 'Only moderators and admins can use /pin.');
      return true;
    }

    const pinnedText = rawArgs.trim();
    if (!pinnedText) {
      emitPrivateBotMessage(socket, 'Usage: /pin <message>');
      return true;
    }

    await Announcement.updateMany(
      { type: 'pin', isActive: true },
      { $set: { isActive: false } }
    );

    const pin = await Announcement.create({
      type: 'pin',
      title: 'Pinned Message',
      message: pinnedText,
      imageUrl: null,
      createdBy: socket.user._id,
      commandId: generateCommandId(),
      isActive: true
    });

    await emitActiveAnnouncements(io);
    emitPrivateBotMessage(socket, `Pinned message updated (ID ${pin.commandId}).`);
    return true;
  }

  if (command === '/unpin') {
    if (!roleFlags.isAdmin) {
      emitPrivateBotMessage(socket, 'Only admins can use /unpin.');
      return true;
    }

    const result = await Announcement.updateMany(
      { type: 'pin', isActive: true },
      { $set: { isActive: false } }
    );
    if (Number(result.modifiedCount || 0) === 0) {
      emitPrivateBotMessage(socket, 'No active pin to remove.');
      return true;
    }

    await emitActiveAnnouncements(io);
    emitPrivateBotMessage(socket, 'Pinned message removed.');
    return true;
  }

  if (command === '/announce') {
    if (!roleFlags.isAdmin) {
      emitPrivateBotMessage(socket, 'Only admins can use /announce.');
      return true;
    }

    const content = rawArgs.trim();
    const splitContent = content.split('|');
    const title = splitContent[0]?.trim();
    const message = splitContent[1]?.trim();
    const imageUrl = splitContent[2]?.trim() || null;

    if (!title || !message) {
      emitPrivateBotMessage(socket, 'Usage: /announce [title] | [message] | [imageUrl (optional)]');
      return true;
    }

    await Announcement.updateMany(
      { type: 'announcement', isActive: true },
      { $set: { isActive: false } }
    );

    const announcement = await Announcement.create({
      type: 'announcement',
      title,
      message,
      imageUrl,
      createdBy: socket.user._id,
      commandId: generateCommandId(),
      isActive: true
    });

    await emitActiveAnnouncements(io);
    emitPrivateBotMessage(socket, `Announcement published (ID ${announcement.commandId}).`);
    return true;
  }

  if (command === '/clearannounce') {
    if (!roleFlags.isAdmin) {
      emitPrivateBotMessage(socket, 'Only admins can use /clearannounce.');
      return true;
    }

    const result = await Announcement.updateMany(
      { type: 'announcement', isActive: true },
      { $set: { isActive: false } }
    );

    if (Number(result.modifiedCount || 0) === 0) {
      emitPrivateBotMessage(socket, 'No active announcement to clear.');
      return true;
    }

    await emitActiveAnnouncements(io);
    emitPrivateBotMessage(socket, 'Announcement cleared.');
    return true;
  }

  if (command === '/schedule') {
    if (!roleFlags.isAdmin) {
      emitPrivateBotMessage(socket, 'Only admins can use schedule commands.');
      return true;
    }

    return handleScheduleCommand({ socket, args });
  }

  if (command === '/alert') {
    if (!roleFlags.isAdmin) {
      emitPrivateBotMessage(socket, 'Only admins can use /alert.');
      return true;
    }

    const message = rawArgs.trim();
    if (!message) {
      emitPrivateBotMessage(socket, 'Usage: /alert <message>');
      return true;
    }

    io.emit('chat_alert', {
      id: `alert-${Date.now()}`,
      title: 'Handshake Alert',
      message,
      createdAt: new Date().toISOString()
    });

    emitPrivateBotMessage(socket, 'Alert pushed to all users.');
    return true;
  }

  if (command === '/pass-giveaway') {
    if (!roleFlags.isAdmin) {
      emitPrivateBotMessage(socket, 'Only admins can use /pass-giveaway.');
      return true;
    }

    const passesPerWinner = Number.parseInt(args[0], 10);
    const winnerCount = Number.parseInt(args[1], 10);
    const durationArg = args[2] || '';
    const parsedDuration = durationArg ? parseDurationToMs(durationArg) : GIVEAWAY_DEFAULT_DURATION_MS;
    const durationMs = Number(parsedDuration || 0);

    if (!Number.isInteger(passesPerWinner) || passesPerWinner <= 0) {
      emitPrivateBotMessage(socket, 'Usage: /pass-giveaway <passes> <winners> [duration]');
      return true;
    }

    if (!Number.isInteger(winnerCount) || winnerCount <= 0) {
      emitPrivateBotMessage(socket, 'Winner count must be a positive whole number.');
      return true;
    }

    if (
      !Number.isFinite(durationMs) ||
      durationMs < GIVEAWAY_MIN_DURATION_MS ||
      durationMs > GIVEAWAY_MAX_DURATION_MS
    ) {
      emitPrivateBotMessage(
        socket,
        `Duration must be between ${formatMs(GIVEAWAY_MIN_DURATION_MS)} and ${formatMs(GIVEAWAY_MAX_DURATION_MS)}.`
      );
      return true;
    }

    const endsAt = new Date(Date.now() + durationMs);
    const commandId = generateCommandId();
    await Announcement.create({
      type: 'giveaway',
      title: 'Pass Giveaway',
      message: `Enter now to win ${passesPerWinner} pass(es). Winners: ${winnerCount}.`,
      imageUrl: null,
      createdBy: socket.user._id,
      commandId,
      isActive: true,
      giveaway: {
        passesPerWinner,
        winnerCount,
        endsAt,
        entries: [],
        winnerIds: [],
        winnerUsernames: [],
        status: 'open',
        completedAt: null
      }
    });

    await emitActiveAnnouncements(io);
    emitPrivateBotMessage(
      socket,
      `Pass giveaway ${commandId} started. Countdown: ${formatCountdown(endsAt)} (${endsAt.toLocaleString()}).`
    );
    return true;
  }

  if (
    command === '/pass-return' ||
    command === '/pass-complete' ||
    command === '/refund' ||
    command === '/pass-order'
  ) {
    if (!roleFlags.isAdmin) {
      emitPrivateBotMessage(socket, 'Only admins can use pass recovery commands.');
      return true;
    }

    return handlePassAdminCommand({
      io,
      socket,
      command,
      args
    });
  }

  if (
    command === '/mute' ||
    command === '/timeout' ||
    command === '/unmute' ||
    command === '/ban' ||
    command === '/permban' ||
    command === '/unban'
  ) {
    return handleModerationCommand({
      io,
      socket,
      command,
      args,
      roleFlags
    });
  }

  if (command.startsWith('/')) {
    if (roleFlags.isStaff) {
      emitPrivateBotMessage(socket, 'Unknown command. Type /help to see available commands.');
    } else {
      emitPrivateBotMessage(socket, 'Slash commands are only available to moderators and admins.');
    }
    return true;
  }

  return false;
};

export const setupChatSocket = (io) => {
  startAutomationLoop(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      socket.user = null;
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join_chat', async () => {
      if (!socket.user) {
        return;
      }

      activeUsers.set(socket.user._id.toString(), {
        socketId: socket.id,
        username: socket.user.username,
        avatar: socket.user.avatar,
        rank: socket.user.rank,
        badge: socket.user.rank === 'developer' ? 'developer' : null,
        chatOpen: false
      });

      updateActiveUserList(io);

      try {
        const user = await User.findById(socket.user._id);
        const lastViewTime = user.lastChatView || new Date(0);
        const newMessageCount = await Message.countDocuments({
          createdAt: { $gt: lastViewTime }
        });
        socket.emit('unread_count', { count: newMessageCount });
      } catch (error) {
        console.error('Error checking unread messages:', error);
      }

      try {
        await emitActiveAnnouncements(socket);
      } catch (error) {
        console.error('Error sending announcements:', error);
      }

      console.log(`User joined: ${socket.user.username}`);
    });

    socket.on('chat_opened', async () => {
      if (!socket.user) {
        return;
      }

      const userInfo = activeUsers.get(socket.user._id.toString());
      if (userInfo) {
        userInfo.chatOpen = true;
      }

      await User.findByIdAndUpdate(socket.user._id, {
        lastChatView: new Date()
      });
    });

    socket.on('chat_closed', () => {
      if (!socket.user) {
        return;
      }

      const userInfo = activeUsers.get(socket.user._id.toString());
      if (userInfo) {
        userInfo.chatOpen = false;
      }
    });

    socket.on('enter_giveaway', async (payload) => {
      try {
        if (!socket.user) {
          emitPrivateBotMessage(socket, 'Sign in to enter giveaways.');
          return;
        }

        const giveawayId = String(payload?.giveawayId || '').trim();
        if (!giveawayId) {
          emitPrivateBotMessage(socket, 'Invalid giveaway ID.');
          return;
        }

        const giveaway = await Announcement.findOne({
          _id: giveawayId,
          type: 'giveaway',
          isActive: true,
          'giveaway.status': 'open'
        });

        if (!giveaway) {
          emitPrivateBotMessage(socket, 'This giveaway is no longer active.');
          return;
        }

        if (
          giveaway.giveaway?.endsAt &&
          new Date(giveaway.giveaway.endsAt).getTime() <= Date.now()
        ) {
          emitPrivateBotMessage(socket, 'This giveaway just ended.');
          return;
        }

        const alreadyEntered = (giveaway.giveaway?.entries || [])
          .some((entry) => String(entry) === String(socket.user._id));
        if (alreadyEntered) {
          emitPrivateBotMessage(socket, 'You are already entered in this giveaway.');
          return;
        }

        giveaway.giveaway.entries.push(socket.user._id);
        await giveaway.save();

        await emitActiveAnnouncements(io);
        emitPrivateBotMessage(socket, `You entered giveaway ${giveaway.commandId || giveaway._id}. Good luck.`);
      } catch (error) {
        console.error('Giveaway entry error:', error);
        emitPrivateBotMessage(socket, 'Failed to enter giveaway. Please try again.');
      }
    });

    socket.on('send_message', async (data) => {
      try {
        if (!socket.user) {
          socket.emit('error', { message: 'You must be signed in to send messages' });
          return;
        }

        const { message = '', mentions, replyTo, sticker } = data;
        const trimmedMessage = typeof message === 'string' ? message.trim() : '';

        const freshUser = await User.findById(socket.user._id).select('-password');
        if (!freshUser) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        socket.user = freshUser;

        const moderationBlock = await resolveChatModerationBlock(freshUser);
        if (moderationBlock.blocked) {
          socket.emit('error', { message: moderationBlock.message, showToUser: true });
          return;
        }

        if (trimmedMessage.startsWith('/')) {
          const separatorIndex = trimmedMessage.indexOf(' ');
          const command = (separatorIndex === -1
            ? trimmedMessage
            : trimmedMessage.slice(0, separatorIndex)
          ).toLowerCase();
          const rawArgs = separatorIndex === -1 ? '' : trimmedMessage.slice(separatorIndex + 1).trim();
          const args = rawArgs ? rawArgs.split(/\s+/) : [];
          const roleFlags = getRoleFlags(socket.user);

          const handled = await handleSlashCommand({
            io,
            socket,
            command,
            args,
            rawArgs,
            roleFlags
          });

          if (handled) {
            return;
          }
        }

        if (!trimmedMessage && !sticker) {
          socket.emit('error', { message: 'Message or sticker is required' });
          return;
        }

        if (trimmedMessage.length > 500) {
          socket.emit('error', { message: 'Message is too long (max 500 characters)' });
          return;
        }

        const spamCheck = checkRapidMessageSpam(socket.user._id);
        if (spamCheck.blocked) {
          socket.emit('error', {
            message: spamCheck.message,
            showToUser: true,
            cooldownSeconds: spamCheck.cooldownSeconds
          });
          return;
        }

        const newMessage = await Message.create({
          userId: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.avatar,
          rank: socket.user.rank,
          badge: socket.user.rank === 'developer' ? 'developer' : null,
          message: trimmedMessage,
          mentions: mentions || [],
          replyTo: replyTo || null,
          sticker: sticker || null
        });

        await newMessage.populate('replyTo', 'username message avatar rank');

        io.emit('new_message', {
          id: newMessage._id,
          userId: socket.user.userId,
          username: newMessage.username,
          avatar: newMessage.avatar,
          rank: newMessage.rank,
          badge: newMessage.badge,
          message: newMessage.message,
          mentions: newMessage.mentions,
          replyTo: newMessage.replyTo,
          sticker: newMessage.sticker,
          timestamp: newMessage.createdAt
        });

        activeUsers.forEach((userInfo, userId) => {
          if (!userInfo.chatOpen && userId !== socket.user._id.toString()) {
            const userSocket = io.sockets.sockets.get(userInfo.socketId);
            if (userSocket) {
              userSocket.emit('new_message_notification');
            }
          }
        });
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('typing', () => {
      if (!socket.user) {
        return;
      }

      socket.broadcast.emit('user_typing', {
        username: socket.user.username,
        rank: socket.user.rank
      });
    });

    socket.on('stop_typing', () => {
      if (!socket.user) {
        return;
      }

      socket.broadcast.emit('user_stop_typing', {
        username: socket.user.username
      });
    });

    socket.on('delete_message', async (data) => {
      try {
        if (!socket.user) {
          socket.emit('error', { message: 'You must be signed in to delete messages' });
          return;
        }

        const { messageId } = data;
        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        const canDelete = (
          isStaffUser(socket.user) ||
          message.userId.toString() === socket.user._id.toString()
        );

        if (!canDelete) {
          socket.emit('error', { message: 'You do not have permission to delete this message' });
          return;
        }

        message.isDeleted = true;
        message.deletedBy = socket.user._id;
        await message.save();

        io.emit('message_deleted', { messageId });
      } catch (error) {
        console.error('Delete message error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    socket.on('disconnect', () => {
      if (socket.user) {
        activeUsers.delete(socket.user._id.toString());
        updateActiveUserList(io);
      }

      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

export default setupChatSocket;
