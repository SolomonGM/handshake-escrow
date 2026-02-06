import TradeTicket from '../models/TradeTicket.js';
import User from '../models/User.js';
import { getIo } from '../utils/socketRegistry.js';
import { buildTransactionFeedItem } from './transactionFeedService.js';

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

  if (usdValue > 0) {
    await User.updateMany(
      { _id: { $in: participantIds } },
      { $inc: { totalUSDValue: usdValue, totalDeals: 1 } }
    );
  } else {
    await User.updateMany(
      { _id: { $in: participantIds } },
      { $inc: { totalDeals: 1 } }
    );
  }

  ticket.statsApplied = true;
  await ticket.save();
  return true;
};

const emitBroadcastIfNeeded = async (ticketId) => {
  const io = getIo();
  if (!io) {
    return;
  }

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
    io.emit('transaction_completed', { transaction });
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
  processDueTicketClosures().catch((error) => {
    console.error('Error processing due ticket closures:', error);
  });

  setInterval(() => {
    processDueTicketClosures().catch((error) => {
      console.error('Error processing due ticket closures:', error);
    });
  }, intervalMs);
};
