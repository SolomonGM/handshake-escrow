import { EXCHANGE_RATES } from '../config/wallets.js';

const COIN_SYMBOLS = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  litecoin: 'LTC',
  solana: 'SOL',
  'usdt-erc20': 'USDT',
  'usdc-erc20': 'USDC'
};

const getUsdAmount = (ticket) => {
  const amount = Number(ticket?.dealAmount ?? ticket?.expectedAmount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const resolveUserFromTicket = (ticket, userRef) => {
  if (!userRef) return null;
  if (typeof userRef === 'object' && userRef.username) return userRef;
  const userId = userRef.toString();
  if (ticket?.creator && ticket.creator._id?.toString() === userId) {
    return ticket.creator;
  }
  const participantMatch = ticket?.participants?.find(
    (participant) =>
      participant?.user &&
      (participant.user?._id?.toString() === userId || participant.user?.toString() === userId)
  );
  return participantMatch?.user || null;
};

export const resolveSenderReceiver = (ticket) => {
  const senderParticipant = ticket?.participants?.find((participant) => participant.role === 'sender');
  const receiverParticipant = ticket?.participants?.find((participant) => participant.role === 'receiver');
  const acceptedParticipant = ticket?.participants?.find((participant) => participant.status === 'accepted');

  let senderUser = null;
  let receiverUser = null;

  if (ticket?.creatorRole === 'sender') {
    senderUser = resolveUserFromTicket(ticket, ticket.creator);
    receiverUser = resolveUserFromTicket(ticket, receiverParticipant?.user || acceptedParticipant?.user);
  } else if (ticket?.creatorRole === 'receiver') {
    receiverUser = resolveUserFromTicket(ticket, ticket.creator);
    senderUser = resolveUserFromTicket(ticket, senderParticipant?.user || acceptedParticipant?.user);
  } else {
    senderUser = resolveUserFromTicket(ticket, senderParticipant?.user);
    receiverUser = resolveUserFromTicket(ticket, receiverParticipant?.user);
  }

  if (!senderUser && ticket?.creatorRole === 'sender') {
    senderUser = resolveUserFromTicket(ticket, ticket.creator);
  }

  if (!receiverUser && ticket?.creatorRole === 'receiver') {
    receiverUser = resolveUserFromTicket(ticket, ticket.creator);
  }

  return { senderUser, receiverUser };
};

const getPrivacySelection = (ticket, user) => {
  if (!ticket?.privacySelections || !user) return null;
  const userId = user._id?.toString() || user.toString();
  if (ticket.privacySelections instanceof Map) {
    return ticket.privacySelections.get(userId);
  }
  return ticket.privacySelections[userId];
};

const formatDisplayName = (user, privacySelection) => {
  if (!user) return 'Anonymous';
  if (privacySelection === 'anonymous') return 'Anonymous';
  return `@${user.username || 'User'}`;
};

export const buildTransactionFeedItem = (ticket) => {
  if (!ticket) return null;

  const { senderUser, receiverUser } = resolveSenderReceiver(ticket);
  const usdValue = getUsdAmount(ticket);
  const exchangeRate = EXCHANGE_RATES[ticket.cryptocurrency] || 1;
  const amount = exchangeRate > 0 ? Number((usdValue / exchangeRate).toFixed(8)) : 0;
  const coinSymbol = COIN_SYMBOLS[ticket.cryptocurrency] || ticket.cryptocurrency?.toUpperCase() || 'CRYPTO';

  const senderSelection = getPrivacySelection(ticket, senderUser);
  const receiverSelection = getPrivacySelection(ticket, receiverUser);
  const sender = formatDisplayName(senderUser, senderSelection);
  const receiver = formatDisplayName(receiverUser, receiverSelection);

  const completedAt = ticket.transactionCompletedAt || ticket.closedAt || ticket.updatedAt || new Date();
  const timestamp = new Date(completedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return {
    id: ticket.ticketId || ticket._id?.toString(),
    ticketId: ticket.ticketId,
    coinReceived: coinSymbol,
    amount,
    usdValue,
    sender,
    receiver,
    transactionId: ticket.payoutTransactionHash || ticket.receiverTransactionHash || 'N/A',
    blockchain: ticket.cryptocurrency || 'N/A',
    timestamp,
    status: 'completed',
    completedAt,
    isPlaceholder: false
  };
};

export const buildPlaceholderTransaction = (index) => ({
  id: `placeholder-${index + 1}`,
  coinReceived: 'N/A',
  amount: 0,
  usdValue: 0,
  sender: 'N/A',
  receiver: 'N/A',
  transactionId: 'N/A',
  blockchain: 'N/A',
  timestamp: 'N/A',
  status: 'completed',
  completedAt: null,
  isPlaceholder: true
});

export const ensureMinimumTransactions = (transactions, minItems = 0) => {
  if (!Array.isArray(transactions) || minItems <= 0) {
    return transactions || [];
  }

  if (transactions.length >= minItems) {
    return transactions;
  }

  const placeholdersNeeded = minItems - transactions.length;
  const placeholders = Array.from({ length: placeholdersNeeded }, (_, index) =>
    buildPlaceholderTransaction(index)
  );

  return [...transactions, ...placeholders];
};
