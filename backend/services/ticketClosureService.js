import TradeTicket from '../models/TradeTicket.js';
import User from '../models/User.js';
import { getIo } from '../utils/socketRegistry.js';
import { MAX_USD_FOR_XP, MAX_XP, RANK_THRESHOLDS, STAFF_RANKS } from '../utils/rankUtils.js';
import { buildTransactionFeedItem } from './transactionFeedService.js';
import { postCompletedTicketDiscordEmbed } from './discordTicketBroadcastService.js';

const closureTimers = new Map();

const getDealUsdValue = (ticket) => {
  const amount = Number(ticket?.dealAmount ?? ticket?.expectedAmount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const getParticipantIds = (ticket) => {
  const ids = new Set();

  if (ticket?.creator) {
    ids.add(ticket.creator._id?.toString() || ticket.creator.toString());
  }

  (ticket?.participants || []).forEach((participant) => {
    if (participant?.status === 'accepted' && participant?.user) {
      ids.add(participant.user._id?.toString() || participant.user.toString());
    }
  });

  return Array.from(ids);
};

export const applyTicketCompletionStats = async (ticket) => {
  if (!ticket || ticket.statsApplied) {
    return false;
  }

  const usdValue = getDealUsdValue(ticket);
  const participantIds = getParticipantIds(ticket);

  if (!participantIds.length) {
    ticket.statsApplied = true;
    await ticket.save();
    return false;
  }

  const rankBranches = RANK_THRESHOLDS
    .filter((entry) => entry.rank !== 'client')
    .map((entry) => ({
      case: { $gte: ['$totalUSDValue', entry.minUSD] },
      then: entry.rank
    }));

  const clampedTotalUSD = {
    $min: [
      { $max: ['$totalUSDValue', 0] },
      MAX_USD_FOR_XP
    ]
  };

  const xpExpression = {
    $min: [
      MAX_XP,
      {
        $max: [
          0,
          {
            $floor: {
              $multiply: [
                { $divide: [clampedTotalUSD, MAX_USD_FOR_XP] },
                MAX_XP
              ]
            }
          }
        ]
      }
    ]
  };

  const updatePipeline = [
    {
      $set: {
        totalDeals: { $add: [{ $ifNull: ['$totalDeals', 0] }, 1] },
        totalUSDValue: usdValue > 0
          ? { $add: [{ $ifNull: ['$totalUSDValue', 0] }, usdValue] }
          : { $ifNull: ['$totalUSDValue', 0] }
      }
    },
    {
      $set: {
        rank: {
          $cond: [
            { $in: ['$rank', STAFF_RANKS] },
            '$rank',
            {
              $switch: {
                branches: rankBranches,
                default: 'client'
              }
            }
          ]
        },
        xp: {
          $cond: [
            { $in: ['$rank', STAFF_RANKS] },
            '$xp',
            xpExpression
          ]
        }
      }
    }
  ];

  await User.updateMany(
    { _id: { $in: participantIds } },
    updatePipeline
  );

  ticket.statsApplied = true;
  await ticket.save();
  return true;
};

const emitBroadcastIfNeeded = async (ticketId) => {
  const io = getIo();

  const ticket = await TradeTicket.findOneAndUpdate(
    { _id: ticketId, broadcastedAt: null },
    { $set: { broadcastedAt: new Date() } },
    { new: true }
  )
    .populate('creator', 'username userId avatar')
    .populate('participants.user', 'username userId avatar');

  if (!ticket) {
    return;
  }

  const transaction = buildTransactionFeedItem(ticket);
  if (transaction) {
    if (io) {
      io.emit('transaction_completed', { transaction });
    }

    await postCompletedTicketDiscordEmbed({
      ticket,
      transaction
    });
  }
};

export const finalizeTicketClosureById = async (ticketId) => {
  if (!ticketId) return null;

  const ticket = await TradeTicket.findById(ticketId);
  if (!ticket) return null;

  if (ticket.status !== 'completed') {
    ticket.status = 'completed';
    ticket.closedAt = ticket.closedAt || new Date();
    ticket.closedBy = ticket.closedBy || ticket.closeInitiatedBy || ticket.closedBy;
    ticket.transactionCompletedAt = ticket.transactionCompletedAt || ticket.closedAt;
    ticket.closeScheduledAt = null;
    await ticket.save();
  }

  await applyTicketCompletionStats(ticket);
  await emitBroadcastIfNeeded(ticket._id);

  return ticket;
};

export const scheduleTicketClosure = (ticketId, closeAt) => {
  if (!ticketId || !closeAt) return;

  const closeTime = new Date(closeAt).getTime();
  if (!Number.isFinite(closeTime)) {
    return;
  }

  const delay = closeTime - Date.now();

  if (closureTimers.has(ticketId)) {
    clearTimeout(closureTimers.get(ticketId));
    closureTimers.delete(ticketId);
  }

  if (delay <= 0) {
    finalizeTicketClosureById(ticketId);
    return;
  }

  const timeoutId = setTimeout(() => {
    closureTimers.delete(ticketId);
    finalizeTicketClosureById(ticketId);
  }, delay);

  closureTimers.set(ticketId, timeoutId);
};

export const processDueTicketClosures = async () => {
  const now = new Date();
  const dueTickets = await TradeTicket.find({
    status: 'closing',
    closeScheduledAt: { $lte: now, $ne: null }
  }).select('_id');

  for (const ticket of dueTickets) {
    await finalizeTicketClosureById(ticket._id);
  }
};

const PRIVACY_AUTO_CLOSE_AFTER_MS = 10 * 60 * 1000;

// Lazily backfill privacyPromptShownAt for tickets created before the field
// existed. We use transactionCompletedAt as the best proxy for when the prompt
// was first shown, so legacy stuck tickets enter the 10-min countdown rather
// than being trapped in awaiting-close forever.
const backfillPrivacyPromptShownAt = async () => {
  const legacy = await TradeTicket.find({
    privacyPromptShown: true,
    privacyPromptShownAt: null,
    status: { $in: ['awaiting-close', 'closing'] }
  }).select('_id transactionCompletedAt updatedAt');

  for (const ticket of legacy) {
    const fallbackAt = ticket.transactionCompletedAt || ticket.updatedAt || new Date();
    await TradeTicket.updateOne(
      { _id: ticket._id },
      { $set: { privacyPromptShownAt: fallbackAt } }
    );
  }
};

// If a completed-but-not-yet-closed ticket has been sitting on the Broadcast
// Privacy prompt for more than 10 minutes with at least one missing selection,
// fill the missing sides with the default "anonymous" choice and finalize the
// closure. Prevents trades from holding active-ticket slots indefinitely.
export const processPrivacyTimeouts = async () => {
  await backfillPrivacyPromptShownAt();

  const cutoff = new Date(Date.now() - PRIVACY_AUTO_CLOSE_AFTER_MS);
  const candidates = await TradeTicket.find({
    privacyPromptShownAt: { $ne: null, $lte: cutoff },
    status: { $in: ['awaiting-close', 'closing'] }
  }).select('_id ticketId status creator participants privacySelections privacyPromptShownAt closeScheduledAt messages');

  for (const ticket of candidates) {
    try {
      const partyIds = new Set();
      if (ticket.creator) {
        partyIds.add(ticket.creator._id?.toString() || ticket.creator.toString());
      }
      (ticket.participants || []).forEach((participant) => {
        if (participant?.status === 'accepted' && participant?.user) {
          partyIds.add(participant.user._id?.toString() || participant.user.toString());
        }
      });

      const readSelection = (key) => {
        if (!ticket.privacySelections) return null;
        if (ticket.privacySelections instanceof Map) {
          return ticket.privacySelections.get(key);
        }
        return ticket.privacySelections[key];
      };

      const writeSelection = (key, value) => {
        if (!ticket.privacySelections || (!(ticket.privacySelections instanceof Map) && typeof ticket.privacySelections !== 'object')) {
          ticket.privacySelections = new Map();
        }
        if (ticket.privacySelections instanceof Map) {
          ticket.privacySelections.set(key, value);
        } else {
          ticket.privacySelections[key] = value;
        }
      };

      let filled = 0;
      for (const partyId of partyIds) {
        if (!readSelection(partyId)) {
          writeSelection(partyId, 'anonymous');
          filled += 1;
        }
      }

      const alreadyClosing = ticket.status === 'closing';
      ticket.messages.push({
        isBot: true,
        content: 'Auto-closing ticket',
        type: 'embed',
        embedData: {
          title: 'Auto-closing ticket',
          description: filled > 0
            ? `No Broadcast Privacy selection was made within 10 minutes. Defaulting ${filled} participant(s) to <strong>Anonymous</strong> and closing the ticket.`
            : 'Closing ticket after privacy prompt timeout.',
          color: 'orange'
        },
        timestamp: new Date()
      });

      ticket.status = 'closing';
      if (!alreadyClosing || !ticket.closeScheduledAt) {
        ticket.closeScheduledAt = new Date();
      }
      await ticket.save();

      await finalizeTicketClosureById(ticket._id);
    } catch (error) {
      console.error(`Error auto-closing ticket ${ticket.ticketId} after privacy timeout:`, error);
    }
  }
};

export const backfillCompletedTickets = async () => {
  const tickets = await TradeTicket.find({
    status: 'completed',
    statsApplied: { $ne: true }
  });

  for (const ticket of tickets) {
    if (!ticket.transactionCompletedAt) {
      ticket.transactionCompletedAt = ticket.closedAt || ticket.updatedAt || new Date();
      await ticket.save();
    }
    await applyTicketCompletionStats(ticket);
  }
};

export const startTicketClosureMonitor = () => {
  const intervalMs = 30000;
  const runCycle = () => {
    processDueTicketClosures().catch((error) => {
      console.error('Error processing due ticket closures:', error);
    });
    processPrivacyTimeouts().catch((error) => {
      console.error('Error processing privacy timeouts:', error);
    });
  };

  runCycle();
  setInterval(runCycle, intervalMs);
};
