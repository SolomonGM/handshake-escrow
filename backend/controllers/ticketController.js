import TradeTicket from '../models/TradeTicket.js';
import User from '../models/User.js';
import axios from 'axios';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import {
  calculateTotalAmount,
  convertUsdToCryptoAmount,
  getExchangeRateForCoin,
  ETH_RPC_CONFIG,
  UTXO_NETWORKS
} from '../config/wallets.js';
import { scheduleTicketClosure } from '../services/ticketClosureService.js';
import {
  getActiveNetworkModeForCoin,
  getRuntimeConfig,
  getTicketAvailabilityForCoin,
  getTicketAvailabilityMatrix,
  getTicketPauseMetadata
} from '../services/runtimeConfigService.js';
import { isStaffUser } from '../utils/staffUtils.js';
import { allocateDepositAddress } from '../services/hdWalletService.js';
import { sendTicketPayout } from '../services/ticketPayoutService.js';
import { assessTradeAmount } from '../services/tradeRiskService.js';
import {
  analyzeTicketSafety,
  buildDealAgreementDigest,
  buildTicketEvidenceBrief,
  detectLiveSafetySignals,
  hasCompletedSafetyReview,
  isSafetyReviewRequired,
  normalizeDealAgreement,
  validateDealAgreement
} from '../services/aiSafetyService.js';
import {
  MIN_TRADE_USD,
  calculateFeeBreakdown,
  calculatePlatformFee,
  getFeeScheduleText
} from '../config/pricing.js';

const ACTIVE_TICKET_LIMIT = 12;
const ACTIVE_TICKET_STATUSES = ['open', 'in-progress'];
const UNAVAILABLE_TICKET_CLOSE_SECONDS = 120;
const SUPPORTED_TICKET_COINS = ['bitcoin', 'ethereum', 'litecoin', 'solana', 'usdt-erc20', 'usdc-erc20', 'usdt-spl', 'usdc-spl'];

const formatUsd = (value) => `$${Number(value || 0).toFixed(2)}`;

const buildAuthorizationDigest = (payload) => crypto
  .createHash('sha256')
  .update(JSON.stringify(payload))
  .digest('hex');

const getStoredCreditApplied = (ticket) => {
  if (ticket?.legacyPassUsed || ticket?.feeDecision === 'with-pass') {
    return calculatePlatformFee(ticket.dealAmount);
  }
  return Math.max(0, Number(ticket?.feeCreditAppliedUsd || 0));
};

const getTicketFeeBreakdown = (ticket) => (
  calculateFeeBreakdown(ticket.dealAmount, getStoredCreditApplied(ticket))
);

const buildFeePromptDescription = (dealAmount) => {
  const quote = calculateFeeBreakdown(dealAmount);
  return [
    `<strong>Quoted platform fee:</strong> ${formatUsd(quote.platformFee)}`,
    `<strong>Total escrow deposit:</strong> ${formatUsd(quote.totalDue)}`,
    '',
    '<strong>Fee schedule:</strong>',
    ...getFeeScheduleText().split('\n').map((line) => `• ${line}`),
    '',
    'Either participant can apply Handshake Credits. Credits reduce this fee dollar-for-dollar; any remainder is included in the escrow deposit.'
  ].join('\n');
};

const addFeeSelectionPrompt = (ticket) => {
  const hasFeePrompt = ticket.messages.some((msg) => msg.embedData?.actionType === 'fee-selection');
  if (hasFeePrompt || ticket.feesConfirmed) return false;
  ticket.messages.push({
    isBot: true,
    content: 'Fee Options',
    type: 'embed',
    embedData: {
      title: 'Apply Handshake Credits?',
      description: buildFeePromptDescription(ticket.dealAmount),
      color: 'blue',
      requiresAction: true,
      actionType: 'fee-selection'
    },
    timestamp: new Date()
  });
  return true;
};

const buildSafetyIdentifier = (userId) => crypto
  .createHash('sha256')
  .update(`handshake-safety:${String(userId)}`)
  .digest('hex');

const getBooleanMapValue = (mapLike, key) => {
  if (!mapLike || !key) return false;
  if (mapLike instanceof Map) return mapLike.get(String(key)) === true;
  return mapLike[String(key)] === true;
};

const userCanAccessTicket = (ticket, userId, user = null) => {
  const normalizedId = String(userId);
  const creatorId = String(ticket.creator?._id || ticket.creator || '');
  const isParticipant = (ticket.participants || []).some((participant) => (
    participant.status === 'accepted' &&
    String(participant.user?._id || participant.user || '') === normalizedId
  ));
  return creatorId === normalizedId || isParticipant || isStaffUser(user);
};

const buildSafetyGateResponse = (ticket) => ({
  success: false,
  code: 'SAFETY_REVIEW_REQUIRED',
  message: !ticket.dealAgreement?.confirmedAt
    ? 'Both parties must confirm the written deal terms before choosing payment options.'
    : 'Both parties must review and acknowledge the latest Safety Copilot report before choosing payment options.',
  safety: {
    agreementConfirmed: Boolean(ticket.dealAgreement?.confirmedAt),
    assessmentComplete: Boolean(ticket.safetyAssessment?.analysisId),
    dealDigestMatches: Boolean(
      ticket.safetyAssessment?.dealDigest &&
      ticket.safetyAssessment.dealDigest === ticket.dealAgreement?.digest
    )
  }
});

const restoreUnusedFeeBenefit = async (ticket) => {
  if (
    ticket.feeBenefitRestoredAt ||
    ticket.transactionDetected ||
    ticket.transactionConfirmed ||
    ticket.fundsReleased
  ) {
    return;
  }

  const creditUserId = ticket.feeCreditUsedBy || ticket.passUsedBy;
  const creditAmount = Number(ticket.feeCreditAppliedUsd || 0);

  if (ticket.legacyPassUsed && ticket.passUsedBy) {
    await User.findByIdAndUpdate(ticket.passUsedBy, { $inc: { passes: 1 } });
  } else if (creditUserId && creditAmount > 0) {
    await User.findByIdAndUpdate(creditUserId, { $inc: { feeCredits: creditAmount } });
  } else {
    return;
  }

  ticket.feeBenefitRestoredAt = new Date();
};

const buildUnavailableTicketResponse = (coin, runtimeConfig, message = null) => {
  const now = Date.now();
  const autoCloseAt = new Date(now + UNAVAILABLE_TICKET_CLOSE_SECONDS * 1000).toISOString();

  return {
    success: false,
    code: 'TICKET_COIN_UNAVAILABLE',
    message: message || `${coin.toUpperCase()} ticket creation is currently unavailable.`,
    cryptocurrency: coin,
    unavailableForSeconds: UNAVAILABLE_TICKET_CLOSE_SECONDS,
    autoCloseAt,
    ticketAvailability: getTicketAvailabilityMatrix(runtimeConfig),
    payoutSupport: {
      ethereumOnly: false,
      automaticCoins: ['ethereum', 'usdt-erc20', 'usdc-erc20', 'solana', 'usdt-spl', 'usdc-spl'],
      manualCoins: ['bitcoin', 'litecoin'],
      message: 'Automated payout is supported for ETH/ERC20/SOL/SPL tickets. BTC/LTC require staff processing until a secure UTXO signer is configured.'
    }
  };
};

const getEthProvider = (networkMode = 'mainnet') => {
  const config = ETH_RPC_CONFIG[networkMode] || ETH_RPC_CONFIG.mainnet;
  if (!config?.rpcUrl) {
    return null;
  }
  return new ethers.JsonRpcProvider(config.rpcUrl);
};

const getAddressPrefixMatch = (rawValue, crypto) => {
  const patterns = {
    ethereum: /^(0x[a-fA-F0-9]{40})/,
    'usdt-erc20': /^(0x[a-fA-F0-9]{40})/,
    'usdc-erc20': /^(0x[a-fA-F0-9]{40})/,
    bitcoin: /^((?:bc1|tb1)[0-9a-z]{20,}|[13mn2][a-zA-Z0-9]{25,34})/,
    litecoin: /^((?:ltc1|tltc1)[0-9a-z]{20,}|[LM3mn2Q][a-zA-Z0-9]{25,34})/,
    solana: /^([1-9A-HJ-NP-Za-km-z]{32,44})/,
    'usdt-spl': /^([1-9A-HJ-NP-Za-km-z]{32,44})/,
    'usdc-spl': /^([1-9A-HJ-NP-Za-km-z]{32,44})/
  };
  const pattern = patterns[crypto];
  if (!pattern) {
    return null;
  }
  const match = rawValue.match(pattern);
  return match ? match[1] : null;
};

const getPayoutAddressFamily = (crypto) => {
  const normalized = String(crypto || '').toLowerCase();
  if (normalized === 'ethereum' || normalized.endsWith('-erc20')) {
    return 'ethereum';
  }
  if (normalized === 'solana' || normalized.endsWith('-spl')) {
    return 'solana';
  }
  return normalized;
};

const normalizePayoutAddress = (address, crypto) => {
  const extractedAddress = getAddressPrefixMatch(String(address || '').trim(), crypto);
  if (!extractedAddress) {
    return null;
  }

  const family = getPayoutAddressFamily(crypto);
  if (family === 'ethereum') {
    return ethers.isAddress(extractedAddress) ? ethers.getAddress(extractedAddress) : null;
  }
  if (family === 'solana') {
    try {
      return new PublicKey(extractedAddress).toBase58();
    } catch (error) {
      return null;
    }
  }

  return extractedAddress;
};

const getTicketPartyIds = (ticket) => {
  const ids = new Set();
  if (ticket?.creator) {
    ids.add(String(ticket.creator?._id || ticket.creator));
  }
  (ticket?.participants || []).forEach((participant) => {
    if (participant?.status === 'accepted' && participant?.user) {
      ids.add(String(participant.user?._id || participant.user));
    }
  });
  return Array.from(ids);
};

const getPrivacySelectionValue = (ticket, userId) => {
  if (!ticket?.privacySelections || !userId) {
    return null;
  }
  const key = userId.toString();
  if (ticket.privacySelections instanceof Map) {
    return ticket.privacySelections.get(key);
  }
  return ticket.privacySelections[key];
};

const hasAllPrivacySelections = (ticket) => {
  const partyIds = getTicketPartyIds(ticket);
  if (!partyIds.length) {
    return false;
  }
  return partyIds.every((partyId) => Boolean(getPrivacySelectionValue(ticket, partyId)));
};

const addStaffActionMessage = (ticket, { title, description, color = 'blue' }) => {
  ticket.messages.push({
    isBot: true,
    content: title,
    type: 'embed',
    embedData: {
      title,
      description,
      color,
      requiresAction: false
    },
    timestamp: new Date()
  });
};

const resolveTicketDepositDestination = async (ticket, runtimeConfig = null) => {
  const existingAddress = String(ticket?.depositAddress || ticket?.botWalletAddress || '').trim();
  const mode = ticket?.transactionNetworkMode
    || ticket?.depositNetworkMode
    || getActiveNetworkModeForCoin(ticket?.cryptocurrency, runtimeConfig || await getRuntimeConfig());

  if (existingAddress) {
    if (!ticket.depositAddress) {
      ticket.depositAddress = existingAddress;
    }
    ticket.botWalletAddress = existingAddress;
    ticket.transactionNetworkMode = mode;
    return {
      wallet: existingAddress,
      mode
    };
  }

  const allocation = await allocateDepositAddress(ticket.cryptocurrency);
  ticket.depositAddress = allocation.address;
  ticket.depositChain = allocation.chain;
  ticket.depositToken = allocation.token;
  ticket.depositIndex = allocation.derivationIndex;
  ticket.depositNetworkMode = allocation.networkMode;
  ticket.botWalletAddress = allocation.address;
  ticket.transactionNetworkMode = allocation.networkMode || mode;

  return {
    wallet: allocation.address,
    mode: ticket.transactionNetworkMode
  };
};

const buildActiveTicketLimitQuery = (userId) => ({
  status: { $in: ACTIVE_TICKET_STATUSES },
  $or: [
    { creator: userId },
    {
      participants: {
        $elemMatch: {
          user: userId,
          status: 'accepted'
        }
      }
    }
  ]
});

const countUserActiveTickets = async (userId) => (
  TradeTicket.countDocuments(buildActiveTicketLimitQuery(userId))
);

const applyRescanTransaction = (ticket) => {
  ticket.rescanAttempts += 1;
  ticket.lastRescanTime = new Date();

  if (ticket.rescanAttempts > 3) {
    ticket.messages = ticket.messages.filter(msg =>
      msg.embedData?.actionType !== 'transaction-timeout'
    );

    ticket.messages.push({
      isBot: true,
      content: 'Maximum Attempts Reached',
      type: 'embed',
      embedData: {
        title: 'Maximum Attempts Reached',
        description: 'After 3 rescan attempts, we cannot proceed with automatic detection.\n\nPlease type <strong>/ping</strong> to contact staff for manual verification.',
        color: 'red',
        requiresAction: false
      },
      timestamp: new Date()
    });

    ticket.awaitingTransaction = false;
    ticket.transactionTimedOut = true;
    return { maxAttemptsReached: true };
  }

  ticket.messages = ticket.messages.filter(msg =>
    msg.embedData?.actionType !== 'transaction-timeout'
  );

  ticket.messages.push({
    isBot: true,
    content: 'Rescanning for Transaction',
    type: 'embed',
    embedData: {
      title: 'Rescanning for Transaction',
      description: `Attempt ${ticket.rescanAttempts} of 3. Scanning for payment...\n\nTime limit: ${ticket.rescanAttempts === 1 ? '10' : ticket.rescanAttempts === 2 ? '8' : '12'} minutes`,
      color: 'blue',
      requiresAction: false
    },
    timestamp: new Date()
  });

  ticket.transactionTimedOut = false;
  ticket.awaitingTransaction = true;
  ticket.transactionTimeoutAt = null;

  return { maxAttemptsReached: false };
};

const applyCancelTransaction = (ticket) => {
  ticket.messages = ticket.messages.filter(msg =>
    msg.embedData?.actionType !== 'transaction-timeout'
  );

  ticket.messages.push({
    isBot: true,
    content: 'Transaction Cancelled',
    type: 'embed',
    embedData: {
      title: 'Transaction Cancelled',
      description: 'Transaction monitoring has been cancelled.\n\nIf you need assistance, please type <strong>/ping</strong> to contact staff.',
      color: 'red',
      requiresAction: false
    },
    timestamp: new Date()
  });

  ticket.awaitingTransaction = false;
  ticket.transactionTimedOut = true;
};

const normalizeAttachmentsInput = (attachments, maxDataUrlLength) => {
  let list = attachments;

  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch (error) {
      const matches = list.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g);
      list = matches && matches.length ? matches : [list];
    }
  }

  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((attachment) => {
    const rawUrl = typeof attachment === 'string'
      ? attachment
      : (attachment?.url || attachment?.data || attachment?.dataUrl);

    if (typeof rawUrl !== 'string' || !rawUrl.startsWith('data:image/')) {
      return null;
    }

    if (maxDataUrlLength && rawUrl.length > maxDataUrlLength) {
      return null;
    }

    const size = Number(attachment?.size);
    const width = Number(attachment?.width);
    const height = Number(attachment?.height);

    return {
      url: rawUrl,
      name: attachment?.name || 'image',
      type: attachment?.type || 'image',
      size: Number.isFinite(size) ? size : undefined,
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined
    };
  }).filter(Boolean);
};

const getTicketRateContext = (ticket, networkModeOverride = null) => {
  const fallbackMode = ticket?.transactionNetworkMode
    || ticket?.payoutNetworkMode
    || null;
  return {
    networkMode: networkModeOverride || fallbackMode
  };
};

const getTicketExchangeRate = (ticket, networkModeOverride = null) => {
  const context = getTicketRateContext(ticket, networkModeOverride);
  return getExchangeRateForCoin(ticket?.cryptocurrency, context);
};

const getTicketCryptoAmount = (ticket, usdAmount, networkModeOverride = null) => {
  const context = getTicketRateContext(ticket, networkModeOverride);
  return convertUsdToCryptoAmount(usdAmount, ticket?.cryptocurrency, context);
};

const buildPayoutDetails = (ticket, networkMode = 'mainnet') => {
  const exchangeRate = getTicketExchangeRate(ticket, networkMode);
  const dealAmount = Number(ticket.dealAmount ?? ticket.expectedAmount ?? 0);
  if (!Number.isFinite(dealAmount) || dealAmount <= 0) {
    throw new Error('Invalid deal amount for payout');
  }
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('Invalid exchange rate for payout');
  }
  const payoutUsd = dealAmount;
  if (!Number.isFinite(payoutUsd) || payoutUsd <= 0) {
    throw new Error('Invalid payout amount');
  }
  const payoutCrypto = getTicketCryptoAmount(ticket, payoutUsd, networkMode).toFixed(8);

  return {
    payoutCrypto,
    payoutUsd
  };
};

const BLOCKCYPHER_TOKEN = String(process.env.BLOCKCYPHER_TOKEN || '').trim();
const withBlockCypherToken = (url) => (
  BLOCKCYPHER_TOKEN
    ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(BLOCKCYPHER_TOKEN)}`
    : url
);

const getUtxoPayoutNetwork = (coin, mode) => {
  const normalized = String(coin || '').toLowerCase();
  const networks = UTXO_NETWORKS[normalized] || {};
  return networks[mode] || networks.mainnet || networks.testnet || null;
};

const getPayoutRequiredConfirmations = (confirmationNetwork, networkMode) => {
  const normalized = String(confirmationNetwork || '').toLowerCase();
  if (normalized === 'bitcoin' || normalized === 'litecoin') {
    return getUtxoPayoutNetwork(normalized, networkMode)?.confirmationsRequired || 2;
  }
  if (normalized === 'ethereum') {
    const config = ETH_RPC_CONFIG[networkMode] || ETH_RPC_CONFIG.mainnet;
    return config?.confirmationsRequired || 2;
  }
  if (normalized === 'solana') {
    return 1;
  }
  return 0;
};

const markPayoutComplete = async ({ ticketId, receiverName }) => {
  const ticket = await TradeTicket.findOne({ ticketId });
  if (!ticket) {
    return null;
  }

  ticket.messages = ticket.messages.filter(msg =>
    msg.embedData?.actionType !== 'payout-confirming'
  );

  ticket.fundsReleased = true;
  ticket.transactionCompletedAt = ticket.transactionCompletedAt || new Date();
  ticket.status = 'awaiting-close';

  const hasCompleteMessage = ticket.messages.some(
    msg => msg.embedData?.title === 'Complete'
  );

  if (!hasCompleteMessage) {
    ticket.messages.push({
      isBot: true,
      content: 'Complete',
      type: 'embed',
      embedData: {
        title: 'Complete',
        description: `@${receiverName || 'Receiver'} has received their funds.\n\nThank you for using Handshake!`,
        color: 'blurple'
      },
      timestamp: new Date()
    });
  }

  const hasPrivacyPrompt = ticket.messages.some(
    msg => msg.embedData?.actionType === 'privacy-selection'
  );

  if (!hasPrivacyPrompt) {
    ticket.messages.push({
      isBot: true,
      content: 'Broadcast Privacy',
      type: 'embed',
      embedData: {
        title: 'Broadcast Privacy',
        description: 'Before we broadcast this completed trade, choose how your name appears on the public feed. You can choose <strong>Anonymous</strong> or <strong>Global</strong>. If no selection is made within 10 minutes, the ticket auto-closes and any unchosen side defaults to <strong>Anonymous</strong>.',
        color: 'blue',
        requiresAction: true,
        actionType: 'privacy-selection'
      },
      timestamp: new Date()
    });
    ticket.privacyPromptShown = true;
    ticket.privacyPromptShownAt = new Date();
  }

  await ticket.save();
  return ticket;
};

const updatePayoutConfirmingMessage = async ({ ticketId, txHash, confirmations, requiredConfirmations }) => {
  const ticket = await TradeTicket.findOne({ ticketId });
  if (!ticket) {
    return;
  }

  const confirmingMsg = ticket.messages.find(msg =>
    msg.embedData?.actionType === 'payout-confirming'
  );

  if (confirmingMsg) {
    confirmingMsg.embedData.metadata = confirmingMsg.embedData.metadata || {};
    confirmingMsg.embedData.metadata.txHash = txHash;
    confirmingMsg.embedData.metadata.confirmations = confirmations;
    confirmingMsg.embedData.metadata.requiredConfirmations = requiredConfirmations;
    confirmingMsg.embedData.description = `Your payout has been broadcast.\n\nTransaction: ${String(txHash).slice(0, 16)}...\n\nConfirmations: ${Math.min(confirmations, requiredConfirmations)}/${requiredConfirmations}`;
    ticket.markModified('messages');
    await ticket.save();
  }
};

const startPayoutConfirmationWatcher = ({ ticketId, txHash, receiverName, networkMode = 'mainnet' }) => {
  const provider = getEthProvider(networkMode);
  const config = ETH_RPC_CONFIG[networkMode] || ETH_RPC_CONFIG.mainnet;
  const requiredConfirmations = config?.confirmationsRequired || 2;
  if (!provider) {
    return;
  }

  setImmediate(async () => {
    try {
      await provider.waitForTransaction(txHash, requiredConfirmations);
      const ticket = await TradeTicket.findOne({ ticketId });
      if (!ticket) {
        return;
      }

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'payout-confirming'
      );

      ticket.fundsReleased = true;
      ticket.transactionCompletedAt = ticket.transactionCompletedAt || new Date();
      ticket.status = 'awaiting-close';

      const hasCompleteMessage = ticket.messages.some(
        msg => msg.embedData?.title === 'Complete'
      );

      if (!hasCompleteMessage) {
        ticket.messages.push({
          isBot: true,
          content: 'Complete',
          type: 'embed',
          embedData: {
            title: 'Complete',
            description: `\u{1F389} @${receiverName || 'Receiver'} has received their funds.\n\n\u{2728} Thank you for using Handshake!`,
            color: 'blurple'
          },
          timestamp: new Date()
        });
      }

      const hasPrivacyPrompt = ticket.messages.some(
        msg => msg.embedData?.actionType === 'privacy-selection'
      );

      if (!hasPrivacyPrompt) {
        ticket.messages.push({
          isBot: true,
          content: 'Broadcast Privacy',
          type: 'embed',
          embedData: {
            title: 'Broadcast Privacy',
            description: 'Before we broadcast this completed trade, choose how your name appears on the public feed. You can choose <strong>Anonymous</strong> or <strong>Global</strong>. If no selection is made within 10 minutes, the ticket auto-closes and any unchosen side defaults to <strong>Anonymous</strong>.',
            color: 'blue',
            requiresAction: true,
            actionType: 'privacy-selection'
          },
          timestamp: new Date()
        });
        ticket.privacyPromptShown = true;
        ticket.privacyPromptShownAt = new Date();
      }

      await ticket.save();
    } catch (error) {
      console.error('❌ Payout confirmation watcher error:', error);
    }
  });
};

const startPayoutCompletionFinalizer = ({ ticketId, receiverName }) => {
  setImmediate(async () => {
    try {
      const ticket = await TradeTicket.findOne({ ticketId });
      if (!ticket) {
        return;
      }

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'payout-confirming'
      );

      ticket.fundsReleased = true;
      ticket.transactionCompletedAt = ticket.transactionCompletedAt || new Date();
      ticket.status = 'awaiting-close';

      const hasCompleteMessage = ticket.messages.some(
        msg => msg.embedData?.title === 'Complete'
      );

      if (!hasCompleteMessage) {
        ticket.messages.push({
          isBot: true,
          content: 'Complete',
          type: 'embed',
          embedData: {
            title: 'Complete',
            description: `@${receiverName || 'Receiver'} has received their funds.\n\nThank you for using Handshake!`,
            color: 'blurple'
          },
          timestamp: new Date()
        });
      }

      const hasPrivacyPrompt = ticket.messages.some(
        msg => msg.embedData?.actionType === 'privacy-selection'
      );

      if (!hasPrivacyPrompt) {
        ticket.messages.push({
          isBot: true,
          content: 'Broadcast Privacy',
          type: 'embed',
          embedData: {
            title: 'Broadcast Privacy',
            description: 'Before we broadcast this completed trade, choose how your name appears on the public feed. You can choose <strong>Anonymous</strong> or <strong>Global</strong>. If no selection is made within 10 minutes, the ticket auto-closes and any unchosen side defaults to <strong>Anonymous</strong>.',
            color: 'blue',
            requiresAction: true,
            actionType: 'privacy-selection'
          },
          timestamp: new Date()
        });
        ticket.privacyPromptShown = true;
        ticket.privacyPromptShownAt = new Date();
      }

      await ticket.save();
    } catch (error) {
      console.error('Payout completion finalizer error:', error);
    }
  });
};

const startUtxoPayoutConfirmationWatcher = ({ ticketId, txHash, receiverName, coin, networkMode = 'mainnet' }) => {
  const network = getUtxoPayoutNetwork(coin, networkMode);
  if (!network?.apiBase) {
    console.error(`UTXO payout confirmation watcher unavailable for ${coin}:${networkMode}`);
    return;
  }

  const requiredConfirmations = network.confirmationsRequired || 2;
  const intervalMs = 30_000;
  const maxAttempts = 240;
  let attempts = 0;

  const poll = async () => {
    attempts += 1;
    try {
      const url = withBlockCypherToken(`${network.apiBase}/txs/${encodeURIComponent(txHash)}`);
      const { data } = await axios.get(url, { timeout: 10_000 });
      const confirmations = Math.max(0, Number(data?.confirmations || 0));

      await updatePayoutConfirmingMessage({
        ticketId,
        txHash,
        confirmations,
        requiredConfirmations
      });

      if (confirmations >= requiredConfirmations) {
        await markPayoutComplete({ ticketId, receiverName });
        return;
      }
    } catch (error) {
      console.error(`UTXO payout confirmation watcher error for ${ticketId}:`, error.message);
    }

    if (attempts < maxAttempts) {
      const timer = setTimeout(poll, intervalMs);
      timer.unref?.();
    }
  };

  setImmediate(poll);
};

// Creates a new trade ticket
export const createTicket = async (req, res) => {
  try {
    const cryptocurrency = String(req.body?.cryptocurrency || '').trim().toLowerCase();
    const userId = req.user._id;

    if (!cryptocurrency) {
      return res.status(400).json({
        success: false,
        code: 'CRYPTOCURRENCY_REQUIRED',
        message: 'Cryptocurrency is required.'
      });
    }

    if (!SUPPORTED_TICKET_COINS.includes(cryptocurrency)) {
      return res.status(400).json({
        success: false,
        code: 'UNSUPPORTED_TICKET_COIN',
        message: 'Unsupported cryptocurrency for ticket creation.',
        supportedCoins: SUPPORTED_TICKET_COINS
      });
    }

    const activeTicketCount = await countUserActiveTickets(userId);
    if (activeTicketCount >= ACTIVE_TICKET_LIMIT) {
      return res.status(400).json({
        success: false,
        message: `Too many active tickets. You can only have ${ACTIVE_TICKET_LIMIT} active tickets at a time.`,
        code: 'ACTIVE_TICKET_LIMIT_REACHED',
        activeTicketLimit: ACTIVE_TICKET_LIMIT
      });
    }

    const runtimeConfig = await getRuntimeConfig();
    const isCoinAvailable = getTicketAvailabilityForCoin(cryptocurrency, runtimeConfig);
    if (!isCoinAvailable) {
      return res.status(409).json(buildUnavailableTicketResponse(cryptocurrency, runtimeConfig));
    }

    // Derive a unique deposit address for this ticket from the chain xpub.
    // This is what guarantees no two tickets can collide on the same address —
    // the source of the "wrong user got the confirmation" bug.
    let depositAllocation;
    try {
      depositAllocation = await allocateDepositAddress(cryptocurrency);
    } catch (allocationError) {
      console.error('HD address allocation failed:', allocationError);
      const isConfigMissing = allocationError.code === 'HD_CONFIG_MISSING';
      return res.status(isConfigMissing ? 503 : 500).json({
        success: false,
        code: isConfigMissing ? 'DEPOSIT_WALLET_NOT_CONFIGURED' : 'DEPOSIT_ALLOCATION_FAILED',
        message: isConfigMissing
          ? `${cryptocurrency.toUpperCase()} deposit wallet is not configured. Contact an administrator.`
          : 'Failed to allocate a deposit address. Please try again.',
        envKey: allocationError.envKey || null
      });
    }

    const ticketId = `#${crypto.randomInt(100000000000, 1000000000000)}`;
    const cryptoUpper = cryptocurrency.toUpperCase();
    const cryptoCapitalized = cryptocurrency.charAt(0).toUpperCase() + cryptocurrency.slice(1);

    const initialMessages = [
      {
        isBot: true,
        content: `${cryptoUpper} Ticket Created Successfully!`,
        type: 'embed',
        embedData: {
          title: `${cryptoCapitalized} Ticket Created Successfully!`,
          description: 'Welcome to our automated cryptocurrency Middleman system! Your cryptocurrency will be stored securely for the duration of this deal. Please notify support for assistance.',
          color: 'green',
          footer: `Ticket ${ticketId}`
        }
      },
      {
        isBot: true,
        content: 'Security notification',
        type: 'embed',
        embedData: {
          title: 'Security Notification',
          description: 'Our bot and staff team will NEVER direct message you. Ensure all conversations related to the deal are done within this ticket. Failure to do so may put you at risk of being scammed.',
          color: 'red'
        }
      }
    ];

    const ticket = await TradeTicket.create({
      ticketId,
      creator: userId,
      cryptocurrency,
      safetyReviewRequired: isSafetyReviewRequired(),
      messages: initialMessages,
      status: 'open',
      depositAddress: depositAllocation.address,
      depositChain: depositAllocation.chain,
      depositToken: depositAllocation.token,
      depositIndex: depositAllocation.derivationIndex,
      depositNetworkMode: depositAllocation.networkMode,
      // Mirror the unique deposit address into the legacy field so the existing
      // address-scoped monitor scans per-ticket — fixing the multi-ticket
      // same-amount collision bug for free.
      botWalletAddress: depositAllocation.address,
      transactionNetworkMode: depositAllocation.networkMode
    });

    await ticket.populate('creator', 'username userId avatar');

    res.status(201).json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket',
      error: error.message
    });
  }
};

// Returns current ticket creation availability matrix for UI gating.
export const getTicketAvailability = async (req, res) => {
  try {
    const runtimeConfig = await getRuntimeConfig();
    const configuredAvailability = getTicketAvailabilityMatrix(runtimeConfig);
    const availabilityReasons = {};
    const ticketAvailability = Object.fromEntries(
      Object.entries(configuredAvailability).map(([coin, enabled]) => {
        const isAvailable = Boolean(enabled);

        if (!enabled) {
          availabilityReasons[coin] = 'disabled_by_admin';
        }

        return [coin, isAvailable];
      })
    );

    res.json({
      success: true,
      ticketAvailability,
      configuredTicketAvailability: configuredAvailability,
      availabilityReasons,
      payoutSupport: {
        ethereumOnly: false,
        automaticCoins: SUPPORTED_TICKET_COINS,
        manualCoins: [],
        message: 'Automatic payout is available only for enabled assets whose private signer, gas, and chain monitoring checks pass.'
      }
    });
  } catch (error) {
    console.error('Get ticket availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket availability',
      error: error.message
    });
  }
};

// Retrieves ticket by ID
export const getTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;
    
    console.log('🔍 Looking for ticket:', ticketId);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar')
      .populate('messages.sender', 'username userId avatar rank');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // This check determines whether user has access to this ticket
    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user && p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );
    const isStaff = isStaffUser(req.user);

    if (!isCreator && !isParticipant && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const pauseState = await getTicketPauseMetadata();

    res.json({
      success: true,
      ticket,
      workflow: {
        paused: Boolean(pauseState.paused),
        pauseReason: pauseState.pauseReason || null,
        pauseChangedAt: pauseState.pauseChangedAt || null
      }
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket',
      error: error.message
    });
  }
};

// Creates or revises the transaction-specific agreement that the safety
// review and any later human dispute review are anchored to.
export const updateDealAgreement = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;
    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!userCanAccessTicket(ticket, userId, req.user) || isStaffUser(req.user)) {
      return res.status(403).json({ success: false, message: 'Only the two trading parties can propose deal terms.' });
    }
    if (!ticket.dealAmountConfirmed || !ticket.rolesConfirmed) {
      return res.status(409).json({ success: false, message: 'Confirm roles and the deal amount before writing the agreement.' });
    }
    if (ticket.feesConfirmed || ticket.transactionDetected || ticket.fundsReleased) {
      return res.status(409).json({
        success: false,
        code: 'AGREEMENT_LOCKED',
        message: 'The agreement cannot be changed after payment instructions have been accepted.'
      });
    }

    const normalized = normalizeDealAgreement(req.body || {});
    const validationErrors = validateDealAgreement(normalized);
    if (validationErrors.length) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DEAL_AGREEMENT',
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    const nextVersion = Number(ticket.dealAgreement?.version || 0) + 1;
    const digest = buildDealAgreementDigest(normalized);
    ticket.dealAgreement = {
      ...normalized,
      version: nextVersion,
      proposedBy: userId,
      proposedAt: new Date(),
      digest,
      confirmations: new Map([[String(userId), true]]),
      confirmedAt: null
    };
    ticket.safetyAssessment = null;
    ticket.aiEvidenceBrief = null;

    ticket.messages = ticket.messages.filter((message) => ![
      'deal-agreement-setup',
      'deal-agreement-confirmation',
      'safety-review-acknowledgement'
    ].includes(message.embedData?.actionType));
    ticket.messages.push({
      isBot: true,
      content: 'Deal Terms Proposed',
      type: 'embed',
      embedData: {
        title: `Deal Agreement v${nextVersion}`,
        description: `One party proposed written delivery and acceptance terms. The other party must review and confirm the exact agreement digest <strong>${digest.slice(0, 12)}</strong> before the Safety Copilot runs.`,
        color: 'blue',
        requiresAction: true,
        actionType: 'deal-agreement-confirmation'
      },
      timestamp: new Date()
    });

    await ticket.save();
    res.json({ success: true, message: 'Deal terms saved and locked for confirmation.', ticket });
  } catch (error) {
    console.error('Update deal agreement error:', error);
    res.status(500).json({ success: false, message: 'Failed to save deal terms' });
  }
};

export const confirmDealAgreement = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed, digest } = req.body || {};
    const userId = req.user._id;
    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!userCanAccessTicket(ticket, userId, req.user) || isStaffUser(req.user)) {
      return res.status(403).json({ success: false, message: 'Only the two trading parties can confirm deal terms.' });
    }
    if (!ticket.dealAgreement?.digest) {
      return res.status(409).json({ success: false, message: 'No deal agreement has been proposed.' });
    }
    if (digest !== ticket.dealAgreement.digest) {
      return res.status(409).json({
        success: false,
        code: 'AGREEMENT_VERSION_CHANGED',
        message: 'The deal terms changed. Review the newest version before confirming.'
      });
    }

    if (!confirmed) {
      ticket.dealAgreement.confirmations = new Map();
      ticket.dealAgreement.confirmedAt = null;
      ticket.safetyAssessment = null;
      ticket.messages.push({
        isBot: true,
        content: 'Deal Terms Rejected',
        type: 'embed',
        embedData: {
          title: 'Agreement Needs Revision',
          description: 'A party rejected the current terms. No payment instructions will be shown until a revised agreement is confirmed and reviewed.',
          color: 'red'
        },
        timestamp: new Date()
      });
      await ticket.save();
      return res.json({ success: true, message: 'Agreement rejected.', ticket });
    }

    ticket.dealAgreement.confirmations.set(String(userId), true);
    ticket.markModified('dealAgreement.confirmations');
    const partyIds = getTicketPartyIds(ticket);
    const allConfirmed = partyIds.length >= 2 && partyIds.every((id) => (
      getBooleanMapValue(ticket.dealAgreement.confirmations, id)
    ));

    if (allConfirmed) {
      ticket.dealAgreement.confirmedAt = new Date();
      ticket.messages = ticket.messages.filter(
        (message) => message.embedData?.actionType !== 'deal-agreement-confirmation'
      );
      await ticket.save();

      const assessment = await analyzeTicketSafety({
        ticket,
        safetyIdentifier: buildSafetyIdentifier(userId)
      });
      ticket.safetyAssessment = assessment;
      ticket.messages.push({
        isBot: true,
        content: 'Safety Review Ready',
        type: 'embed',
        embedData: {
          title: `Safety Copilot: ${String(assessment.riskLevel).toUpperCase()} review`,
          description: `${assessment.summary}\n\nThis report is advisory and cannot release, refund, or move funds. Both parties must review it before payment options unlock.`,
          color: assessment.riskLevel === 'high' ? 'red' : assessment.riskLevel === 'medium' ? 'orange' : 'green',
          requiresAction: true,
          actionType: 'safety-review-acknowledgement'
        },
        timestamp: new Date()
      });
    }

    await ticket.save();
    res.json({
      success: true,
      message: allConfirmed ? 'Agreement confirmed and safety review completed.' : 'Waiting for the other party to confirm.',
      ticket
    });
  } catch (error) {
    console.error('Confirm deal agreement error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm deal terms' });
  }
};

export const analyzeTicketSafetyReview = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;
    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!userCanAccessTicket(ticket, userId, req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!ticket.dealAgreement?.confirmedAt) {
      return res.status(409).json({ success: false, message: 'Both parties must confirm the deal agreement first.' });
    }
    if (ticket.fundsReleased) {
      return res.status(409).json({ success: false, message: 'The transaction has already been released.' });
    }

    ticket.safetyAssessment = await analyzeTicketSafety({
      ticket,
      safetyIdentifier: buildSafetyIdentifier(userId)
    });
    await ticket.save();
    res.json({ success: true, message: 'Safety review refreshed.', ticket });
  } catch (error) {
    console.error('Analyze ticket safety error:', error);
    res.status(500).json({ success: false, message: 'Safety review could not be completed' });
  }
};

export const acknowledgeTicketSafety = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { analysisId } = req.body || {};
    const userId = req.user._id;
    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!userCanAccessTicket(ticket, userId, req.user) || isStaffUser(req.user)) {
      return res.status(403).json({ success: false, message: 'Only the two trading parties can acknowledge this review.' });
    }
    if (!ticket.safetyAssessment?.analysisId || ticket.safetyAssessment.analysisId !== analysisId) {
      return res.status(409).json({
        success: false,
        code: 'SAFETY_REVIEW_CHANGED',
        message: 'The safety report changed. Review the newest report before acknowledging it.'
      });
    }
    if (ticket.safetyAssessment.dealDigest !== ticket.dealAgreement?.digest) {
      return res.status(409).json({ success: false, message: 'The report does not match the current agreement.' });
    }

    ticket.safetyAssessment.acknowledgements.set(String(userId), true);
    ticket.markModified('safetyAssessment.acknowledgements');
    const allAcknowledged = getTicketPartyIds(ticket).every((id) => (
      getBooleanMapValue(ticket.safetyAssessment.acknowledgements, id)
    ));

    if (allAcknowledged) {
      ticket.messages = ticket.messages.filter(
        (message) => message.embedData?.actionType !== 'safety-review-acknowledgement'
      );
      ticket.messages.push({
        isBot: true,
        content: 'Safety Review Acknowledged',
        type: 'embed',
        embedData: {
          title: 'Pre-payment Safety Review Complete',
          description: 'Both parties reviewed the same agreement and safety report. This does not guarantee the counterparty or the underlying goods; continue to preserve delivery evidence.',
          color: 'green'
        },
        timestamp: new Date()
      });
      addFeeSelectionPrompt(ticket);
    }

    await ticket.save();
    res.json({
      success: true,
      message: allAcknowledged ? 'Safety review complete. Payment options are unlocked.' : 'Waiting for the other party to review.',
      ticket
    });
  } catch (error) {
    console.error('Acknowledge safety review error:', error);
    res.status(500).json({ success: false, message: 'Failed to acknowledge safety review' });
  }
};

export const generateTicketEvidenceBrief = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;
    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!userCanAccessTicket(ticket, userId, req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!ticket.transactionConfirmed && ticket.status !== 'disputed') {
      return res.status(409).json({
        success: false,
        message: 'Evidence briefs become available after escrow funding or when a ticket is disputed.'
      });
    }
    ticket.aiEvidenceBrief = await buildTicketEvidenceBrief({
      ticket,
      safetyIdentifier: buildSafetyIdentifier(userId)
    });
    await ticket.save();
    res.json({ success: true, message: 'Neutral evidence brief generated.', ticket });
  } catch (error) {
    console.error('Generate evidence brief error:', error);
    res.status(500).json({ success: false, message: 'Evidence brief could not be generated' });
  }
};

// Adds user to ticket
export const addUserToTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userIdentifier } = req.body; // Can be username or userId
    const requesterId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // This check determines whether requester is the creator
    if (ticket.creator._id.toString() !== requesterId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only ticket creator can add users'
      });
    }

    // This lookup finds user by userId (17-digit ID only)
    let targetUser;
    
    // This validation accepts only 17-digit userId
    targetUser = await User.findOne({ userId: userIdentifier })
      .select('username userId avatar');

    if (!targetUser) {
      // Added error message to ticket
      ticket.messages.push({
        isBot: true,
        content: 'Invalid User ID',
        type: 'embed',
        embedData: {
          title: 'Invalid User ID',
          description: 'User not found. Please enter a valid 17-digit User ID. You can find a user\'s ID by clicking on their profile picture in the live chat.',
          color: 'red'
        }
      });
      await ticket.save();
      await ticket.populate('participants.user', 'username userId avatar');
      
      return res.status(200).json({
        success: false,
        message: 'User not found. Please use the 17-digit User ID.',
        error: 'invalid_user',
        ticket
      });
    }

    // This check determines whether user is trying to add themselves
    if (targetUser._id.toString() === requesterId.toString()) {
      ticket.messages.push({
        isBot: true,
        content: 'Cannot Add Yourself',
        type: 'embed',
        embedData: {
          title: 'Cannot Add Yourself',
          description: 'You cannot add yourself to your own ticket. Please enter the User ID of the person you want to trade with.',
          color: 'red'
        }
      });
      await ticket.save();
      await ticket.populate('participants.user', 'username userId avatar');
      
      return res.status(200).json({
        success: false,
        message: 'You cannot add yourself to the ticket',
        error: 'self_add',
        ticket
      });
    }

    // This check determines whether user is already in ticket
    const alreadyAdded = ticket.participants.some(
      p => p.user.toString() === targetUser._id.toString()
    );

    if (alreadyAdded) {
      return res.status(400).json({
        success: false,
        message: 'User already added to ticket',
        error: 'already_added'
      });
    }

    // Added user to participants
    ticket.participants.push({
      user: targetUser._id,
      status: 'pending'
    });

    // Added system message
    ticket.messages.push({
      isBot: true,
      content: 'Invitation Sent',
      type: 'embed',
      embedData: {
        title: 'Waiting for Response',
        description: `An invitation has been sent to @${targetUser.username} (ID: ${targetUser.userId}). Waiting for them to accept or decline the invitation.`,
        color: 'orange'
      }
    });

    await ticket.save();
    await ticket.populate('participants.user', 'username userId avatar');

    res.json({
      success: true,
      message: `Successfully added ${targetUser.username}`,
      ticket
    });
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add user',
      error: error.message
    });
  }
};

// Sends message in ticket
export const sendMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { content = '', attachments = [] } = req.body;
    const userId = req.user._id;
    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    const MAX_ATTACHMENTS = 2;
    const MAX_DATA_URL_LENGTH = 1500000; // ~1.1MB binary after base64 encoding
    const MAX_TICKET_EMBEDDED_ATTACHMENT_CHARS = 8000000;

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // This check determines whether user has access
    const isCreator = ticket.creator.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user.toString() === userId.toString() && p.status === 'accepted'
    );
    const isStaff = isStaffUser(req.user);

    if (!isCreator && !isParticipant && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (isStaff && trimmedContent.startsWith('/staff')) {
      const parts = trimmedContent.split(' ').filter(Boolean);
      const staffCommand = (parts[1] || 'help').toLowerCase();
      const pauseState = await getTicketPauseMetadata();
      const commandMutatesTicket = new Set([
        'rescan',
        'cancel-transaction',
        'close',
        'cancel',
        'dispute',
        'refund'
      ]);

      if (pauseState.paused && commandMutatesTicket.has(staffCommand)) {
        return res.status(423).json({
          success: false,
          code: 'TICKET_WORKFLOW_PAUSED',
          message: pauseState.pauseReason
            ? `Ticket workflow is paused: ${pauseState.pauseReason}`
            : 'Ticket workflow is temporarily paused while runtime configuration is being updated.',
          pauseChangedAt: pauseState.pauseChangedAt || null
        });
      }

      const sendStaffHelp = async () => {
        const description = [
          '<strong>/staff rescan</strong> - Rescan for a transaction',
          '<strong>/staff cancel-transaction</strong> - Cancel transaction monitoring',
          '<strong>/staff close</strong> - Close this ticket (60s countdown)',
          '<strong>/staff cancel</strong> - Cancel this ticket immediately',
          '<strong>/staff dispute</strong> - Mark ticket as disputed',
          '<strong>/staff refund &lt;address&gt; [reason]</strong> - Admin only: refund escrow to an address'
        ].join('<br/>');
        addStaffActionMessage(ticket, {
          title: 'Staff Commands',
          description,
          color: 'blue'
        });
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar rank');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      };

      if (staffCommand === 'help') {
        return sendStaffHelp();
      }

      if (staffCommand === 'rescan') {
        applyRescanTransaction(ticket);
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar rank');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'cancel-transaction') {
        applyCancelTransaction(ticket);
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar rank');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'close') {
        const alreadyClosed = ['completed', 'cancelled', 'refunded'].includes(ticket.status);
        if (alreadyClosed) {
          return res.status(400).json({
            success: false,
            message: 'Ticket is already closed.'
          });
        }

        const closeAt = new Date(Date.now() + 60 * 1000);
        ticket.status = 'closing';
        ticket.closeScheduledAt = closeAt;
        ticket.closeInitiatedBy = userId;

        const hasClosingMessage = ticket.messages.some(
          (msg) => msg.embedData?.actionType === 'ticket-closing'
        );
        if (!hasClosingMessage) {
          ticket.messages.push({
            isBot: true,
            content: 'Ticket Closing',
            type: 'embed',
            embedData: {
              title: 'Ticket Closing',
              description: 'Staff initiated closure. This ticket will close in 1 minute.',
              color: 'yellow',
              requiresAction: false,
              actionType: 'ticket-closing'
            },
            timestamp: new Date()
          });
        }

        await ticket.save();
        scheduleTicketClosure(ticket._id, ticket.closeScheduledAt);
        await ticket.populate('messages.sender', 'username userId avatar rank');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'cancel') {
        await restoreUnusedFeeBenefit(ticket);
        ticket.status = 'cancelled';
        ticket.closedAt = new Date();
        ticket.closedBy = userId;
        addStaffActionMessage(ticket, {
          title: 'Ticket Cancelled',
          description: 'A staff member cancelled this ticket.',
          color: 'red'
        });
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar rank');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'dispute') {
        ticket.status = 'disputed';
        addStaffActionMessage(ticket, {
          title: 'Ticket Disputed',
          description: 'This ticket has been marked as disputed by staff.',
          color: 'orange'
        });
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar rank');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'refund') {
        const isAdminStaff = req.user?.rank === 'developer' || req.user?.role === 'admin';
        if (!isAdminStaff) {
          return res.status(403).json({
            success: false,
            message: 'Only admins can issue ticket refunds.'
          });
        }

        const refundAddress = normalizePayoutAddress(parts[2], ticket.cryptocurrency);
        const refundReason = parts.slice(3).join(' ').trim();
        if (!refundAddress) {
          addStaffActionMessage(ticket, {
            title: 'Refund Address Required',
            description: `Use <strong>/staff refund &lt;${ticket.cryptocurrency?.toUpperCase() || 'crypto'} address&gt; [reason]</strong>.`,
            color: 'red'
          });
          await ticket.save();
          await ticket.populate('messages.sender', 'username userId avatar rank');
          return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
        }

        const runtimeConfig = await getRuntimeConfig();
        const refundNetworkMode = ticket.payoutNetworkMode
          || ticket.transactionNetworkMode
          || getActiveNetworkModeForCoin(ticket.cryptocurrency, runtimeConfig);
        const refundUsd = Number(ticket.expectedAmount || ticket.dealAmount || 0);
        const storedRefundCrypto = Number(ticket.expectedCryptoAmount);
        const refundCrypto = Number.isFinite(storedRefundCrypto) && storedRefundCrypto > 0
          ? storedRefundCrypto.toFixed(8)
          : getTicketCryptoAmount(ticket, refundUsd, refundNetworkMode).toFixed(8);

        try {
          const transferResult = await sendTicketPayout({
            ticket,
            toAddress: refundAddress,
            amountCrypto: refundCrypto,
            amountUsd: refundUsd,
            networkMode: refundNetworkMode,
            purpose: 'ticket_refund',
            sourceType: 'ticket',
            sourceId: ticket.ticketId,
            actor: userId,
            idempotencyKey: `ticket-refund:${ticket.ticketId}:${refundAddress}:${refundCrypto}`
          });

          ticket.status = transferResult.txHash ? 'refunded' : 'disputed';
          ticket.closedAt = transferResult.txHash ? new Date() : null;
          ticket.closedBy = userId;
          ticket.refundedAt = transferResult.txHash ? new Date() : null;
          ticket.refundedBy = userId;
          ticket.refundReason = refundReason || ticket.refundReason || null;
          ticket.payoutAddress = refundAddress;
          ticket.payoutNetworkMode = refundNetworkMode;
          ticket.payoutTransactionHash = transferResult.txHash || null;

          addStaffActionMessage(ticket, {
            title: transferResult.txHash ? 'Ticket Refunded' : 'Refund Queued',
            description: transferResult.txHash
              ? `Refund sent to ${refundAddress}.\n\nAmount: ${refundCrypto} ${ticket.cryptocurrency.toUpperCase()}\nTx: ${transferResult.txHash}${refundReason ? `\n\nReason: ${refundReason}` : ''}`
              : `Refund queued for signer approval.\n\nAmount: ${refundCrypto} ${ticket.cryptocurrency.toUpperCase()}\nTo: ${refundAddress}\nTransfer ID: ${transferResult.transfer?.transferId || 'pending'}${refundReason ? `\n\nReason: ${refundReason}` : ''}`,
            color: transferResult.txHash ? 'purple' : 'orange'
          });
        } catch (error) {
          addStaffActionMessage(ticket, {
            title: 'Refund Not Sent',
            description: `${error.message}${error.transfer?.transferId ? `\n\nTransfer ID: ${error.transfer.transferId}` : ''}`,
            color: 'red'
          });
        }

        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar rank');
        return res.json({
          success: true,
          message: ticket.messages[ticket.messages.length - 1]
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Unknown staff command. Use /staff help for options.'
      });
    }

    const normalizedIncoming = normalizeAttachmentsInput(attachments, MAX_DATA_URL_LENGTH);

    if (!trimmedContent && normalizedIncoming.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content or image attachment is required'
      });
    }

    if (normalizedIncoming.length > MAX_ATTACHMENTS) {
      return res.status(400).json({
        success: false,
        message: `You can send up to ${MAX_ATTACHMENTS} images at once`
      });
    }

    const existingAttachmentChars = (ticket.messages || []).reduce((total, message) => (
      total + (message.attachments || []).reduce((attachmentTotal, attachment) => (
        attachmentTotal + String(typeof attachment === 'string' ? attachment : attachment?.url || '').length
      ), 0)
    ), 0);
    const incomingAttachmentChars = normalizedIncoming.reduce(
      (total, attachment) => total + String(attachment.url || '').length,
      0
    );
    if (existingAttachmentChars + incomingAttachmentChars > MAX_TICKET_EMBEDDED_ATTACHMENT_CHARS) {
      return res.status(413).json({
        success: false,
        code: 'TICKET_EVIDENCE_STORAGE_LIMIT',
        message: 'This ticket has reached its temporary evidence-storage limit. Contact staff before adding more images.'
      });
    }

    const sanitizedAttachments = normalizedIncoming;

    if (!trimmedContent && sanitizedAttachments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Only image attachments are supported'
      });
    }

    // Normalize any existing attachments on the ticket to avoid casting errors
    let didNormalizeExisting = false;
    if (Array.isArray(ticket.messages)) {
      ticket.messages.forEach((message) => {
        if (message && message.attachments !== undefined) {
          const normalizedExisting = normalizeAttachmentsInput(message.attachments, MAX_DATA_URL_LENGTH);
          message.attachments = normalizedExisting;
          didNormalizeExisting = true;
        }
      });
    }

    ticket.messages.push({
      sender: userId,
      content: trimmedContent,
      type: 'text',
      attachments: sanitizedAttachments
    });
    const sentMessage = ticket.messages[ticket.messages.length - 1];
    const safetyAlerts = detectLiveSafetySignals(trimmedContent).map((signal) => ({
      ...signal,
      detectedAt: new Date(),
      messageId: sentMessage._id
    }));
    if (safetyAlerts.length) {
      ticket.liveSafetySignals = [
        ...(ticket.liveSafetySignals || []),
        ...safetyAlerts
      ].slice(-50);
    }

    if (didNormalizeExisting) {
      ticket.markModified('messages');
    }

    await ticket.save();
    await ticket.populate('messages.sender', 'username userId avatar rank');

    res.json({
      success: true,
      message: sentMessage,
      safetyAlerts
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Retrieves user's tickets
export const getUserTickets = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('📋 Fetching tickets for user:', userId);

    // Retrieves tickets where user is creator or participant
    const tickets = await TradeTicket.find({
      $or: [
        { creator: userId },
        { 'participants.user': userId }
      ]
    })
    .populate('creator', 'username userId avatar')
    .populate('participants.user', 'username userId avatar')
    .sort({ createdAt: -1 });

    console.log(`📦 Found ${tickets.length} total tickets`);

    // Separates into different categories
    
    // Invitations - tickets where user is invited but hasn't responded
    const invitations = tickets.filter(t => {
      const participant = t.participants.find(p => p.user && p.user._id.toString() === userId.toString());
      return participant && participant.status === 'pending';
    });
    console.log(`📨 Invitations: ${invitations.length}`);
    
    // Active - tickets that are open or in-progress where user is creator or accepted participant
    const activeTickets = tickets.filter(t => {
      const isCreator = t.creator._id.toString() === userId.toString();
      const participant = t.participants.find(p => p.user && p.user._id.toString() === userId.toString());
      const isAcceptedParticipant = participant && participant.status === 'accepted';
      // Show tickets that are open OR in-progress AND user is either creator or accepted participant
      const isActive = (isCreator || isAcceptedParticipant) && (
        t.status === 'open' ||
        t.status === 'in-progress' ||
        t.status === 'awaiting-close' ||
        t.status === 'closing'
      );
      if (isActive) {
        console.log(`🔥 Active ticket found: ${t.ticketId}, status: ${t.status}, isCreator: ${isCreator}`);
      }
      return isActive;
    });
    console.log(`🔥 Active Tickets: ${activeTickets.length}`);
    
    // My Tickets - ONLY finished tickets (completed, cancelled, refunded) where user is creator OR accepted participant
    const myTickets = tickets.filter(t => {
      const isCreator = t.creator._id.toString() === userId.toString();
      const participant = t.participants.find(p => p.user && p.user._id.toString() === userId.toString());
      const isAcceptedParticipant = participant && participant.status === 'accepted';
      const isFinished = ['completed', 'cancelled', 'refunded'].includes(t.status);
      return (isCreator || isAcceptedParticipant) && isFinished;
    });
    console.log(`✅ My Tickets (finished): ${myTickets.length}`);

    res.json({
      success: true,
      myTickets,
      invitations,
      activeTickets
    });
  } catch (error) {
    console.error('Get user tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error.message
    });
  }
};

// Responds to ticket invitation
export const respondToInvitation = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { action } = req.body; // 'accept' or 'decline'
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const participant = ticket.participants.find(
      p => p.user.toString() === userId.toString()
    );

    if (!participant) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    // Retrieves user info
    const user = await User.findById(userId).select('username userId');

    // Added embed notification to ticket
    if (action === 'accept') {
      const activeTicketCount = await countUserActiveTickets(userId);
      if (activeTicketCount >= ACTIVE_TICKET_LIMIT) {
        return res.status(400).json({
          success: false,
          message: `Too many active tickets. You can only have ${ACTIVE_TICKET_LIMIT} active tickets at a time.`,
          code: 'ACTIVE_TICKET_LIMIT_REACHED',
          activeTicketLimit: ACTIVE_TICKET_LIMIT
        });
      }

      participant.status = 'accepted';
      
      // Only add acceptance message if none exists (check for any user added message)
      const hasAcceptanceMessage = ticket.messages.some(msg => 
        msg.embedData?.title?.includes('has been added to the ticket')
      );
      
      if (!hasAcceptanceMessage) {
        ticket.messages.push({
          isBot: true,
          content: `User Accepted`,
          type: 'embed',
          embedData: {
            title: `@${user.username} has been added to the ticket`,
            description: 'You may now proceed with your deal.',
            color: 'green'
          },
          timestamp: new Date()
        });
      }
      
      // Updated ticket status to in-progress
      if (ticket.status === 'open') {
        ticket.status = 'in-progress';
      }

      // Only add role selection prompt if it doesn't exist
      const hasRoleSelectionPrompt = ticket.messages.some(msg => 
        msg.embedData?.actionType === 'role-selection'
      );
      
      if (!hasRoleSelectionPrompt) {
        ticket.messages.push({
          isBot: true,
          content: 'Select Your Role',
          type: 'embed',
          embedData: {
            title: 'Select Your Role',
            description: 'Please select whether you are the <strong>Sender</strong> (sending cryptocurrency) or the <strong>Receiver</strong> (receiving cryptocurrency).',
            color: 'blue',
            requiresAction: true,
            actionType: 'role-selection'
          },
          timestamp: new Date()
        });
      }

      ticket.roleSelectionShown = true;

      await ticket.save();
    } else {
      // When declined, remove the participant from the ticket instead of cancelling it
      ticket.participants = ticket.participants.filter(
        p => p.user.toString() !== userId.toString()
      );
      
      ticket.messages.push({
        isBot: true,
        content: 'Invitation Declined',
        type: 'embed',
        embedData: {
          title: `@${user.username} has declined the invitation`,
          description: 'The user has been removed from this ticket. You can invite another user if needed.',
          color: 'red'
        },
        timestamp: new Date()
      });
      
      // Ticket remains active for creator to invite someone else
      await ticket.save();
    }

    res.json({
      success: true,
      message: `Invitation ${action}ed successfully`
    });
  } catch (error) {
    console.error('Respond to invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to invitation',
      error: error.message
    });
  }
};

// Triggers user prompt after 10 seconds (only once)
export const triggerUserPrompt = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Only creator can trigger prompt
    if (ticket.creator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only ticket creator can trigger prompt'
      });
    }

    // This check determines whether prompt already shown
    if (ticket.hasShownPrompt) {
      return res.json({
        success: true,
        alreadyShown: true,
        message: 'Prompt already shown'
      });
    }

    // Added prompt message to database
    ticket.messages.push({
      isBot: true,
      content: 'Add User to Ticket',
      type: 'embed',
      embedData: {
        title: 'Add User by pasting User ID in the chat',
        description: 'To proceed with this deal, add the other party to this ticket. Click on their profile picture in the live chat to view and copy their 17-digit User ID, then paste it in the message box below.',
        color: 'green'
      },
      timestamp: new Date()
    });

    ticket.hasShownPrompt = true;
    ticket.promptShownAt = new Date();

    await ticket.save();
    
    // Populates the ticket before sending response
    await ticket.populate('creator', 'username userId avatar');
    await ticket.populate('participants.user', 'username userId avatar');

    res.json({
      success: true,
      message: 'Prompt triggered',
      newMessage: ticket.messages[ticket.messages.length - 1],
      ticket
    });
  } catch (error) {
    console.error('Trigger prompt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger prompt',
      error: error.message
    });
  }
};

// Closes ticket
export const closeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // This check determines whether user has access to this ticket (creator or accepted participant)
    const isCreator = ticket.creator.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to close this ticket'
      });
    }

    const completionReady = ticket.fundsReleased || ['awaiting-close', 'closing', 'completed'].includes(ticket.status);

    if (completionReady) {
      if (ticket.status === 'completed') {
        await ticket.populate('creator', 'username userId avatar');
        await ticket.populate('participants.user', 'username userId avatar');
        return res.json({
          success: true,
          message: 'Ticket already closed',
          ticket
        });
      }

      if (!hasAllPrivacySelections(ticket)) {
        return res.status(400).json({
          success: false,
          message: 'Both users must select privacy options before closing the ticket'
        });
      }

      if (!ticket.closeScheduledAt || ticket.status !== 'closing') {
        ticket.status = 'closing';
        ticket.closeScheduledAt = new Date(Date.now() + 60 * 1000);
        ticket.closeInitiatedBy = userId;

        const hasClosingMessage = ticket.messages.some(
          msg => msg.embedData?.actionType === 'ticket-closing'
        );

        if (!hasClosingMessage) {
          ticket.messages.push({
            isBot: true,
            content: 'Closing Ticket',
            type: 'embed',
            embedData: {
              title: 'Closing Ticket',
              description: 'This ticket will close in 1 minute. You will be redirected to the Trade Hub when it completes.',
              color: 'orange',
              requiresAction: false,
              actionType: 'ticket-closing'
            },
            timestamp: new Date()
          });
        }

        await ticket.save();
      } else {
        await ticket.save();
      }

      scheduleTicketClosure(ticket._id, ticket.closeScheduledAt);

      await ticket.populate('creator', 'username userId avatar');
      await ticket.populate('participants.user', 'username userId avatar');

      return res.json({
        success: true,
        message: 'Ticket will close in 1 minute',
        ticket
      });
    }

    await restoreUnusedFeeBenefit(ticket);
    ticket.status = 'cancelled';
    ticket.closedAt = new Date();
    ticket.closedBy = userId;

    await ticket.save();

    res.json({
      success: true,
      message: 'Ticket closed successfully',
      ticket
    });
  } catch (error) {
    console.error('Close ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close ticket',
      error: error.message
    });
  }
};

// Selects broadcast privacy (anonymous or global)
export const selectPrivacy = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { preference } = req.body;
    const userId = req.user._id;

    if (!['anonymous', 'global'].includes(preference)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid privacy option. Must be anonymous or global.'
      });
    }

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // This check determines whether user has access to this ticket (creator or accepted participant)
    const isCreator = ticket.creator.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update privacy for this ticket'
      });
    }

    if (!ticket.fundsReleased && !['awaiting-close', 'closing', 'completed'].includes(ticket.status)) {
      return res.status(400).json({
        success: false,
        message: 'Ticket is not ready for privacy selection'
      });
    }

    if (!ticket.privacySelections) {
      ticket.privacySelections = new Map();
    }

    if (ticket.privacySelections instanceof Map) {
      ticket.privacySelections.set(userId.toString(), preference);
    } else {
      ticket.privacySelections = {
        ...(ticket.privacySelections || {}),
        [userId.toString()]: preference
      };
    }

    await ticket.save();

    await ticket.populate('creator', 'username userId avatar');
    await ticket.populate('participants.user', 'username userId avatar');

    res.json({
      success: true,
      message: 'Privacy selection saved',
      ticket,
      allSelected: hasAllPrivacySelections(ticket)
    });
  } catch (error) {
    console.error('Select privacy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update privacy selection',
      error: error.message
    });
  }
};

// Selects role (sender or receiver)
export const selectRole = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { role } = req.body; // 'sender' or 'receiver'
    const userId = req.user._id;

    console.log(`\n🎯 SELECT ROLE REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Requested Role: ${role}`);

    if (!['sender', 'receiver'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be sender or receiver'
      });
    }

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();
    
    // This lookup finds THIS user's participant entry (if they're a participant)
    const thisUserParticipant = ticket.participants.find(
      p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );
    
    // This lookup finds the OTHER user's participant entry (the one who is NOT the current user)
    const otherParticipant = ticket.participants.find(
      p => p.user._id.toString() !== userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !thisUserParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Retrieves user info
    const user = await User.findById(userId).select('username');
    const currentUserRole = isCreator ? ticket.creatorRole : thisUserParticipant?.role;
    const otherUserRole = isCreator ? otherParticipant?.role : ticket.creatorRole;
    
    console.log(`📊 CURRENT STATE:`);
    console.log(`   This User (${user.username}): ${currentUserRole || 'null'}`);
    console.log(`   Other User: ${otherUserRole || 'null'}`);
    console.log(`   Wants to select: ${role}`);

    // This check determines whether other user has already selected this role
    if (otherUserRole && otherUserRole === role) {
      console.log(`❌ Cannot select ${role} - already taken by other user`);
      return res.status(400).json({
        success: false,
        message: `The ${role} role has already been selected by the other user. Please select ${role === 'sender' ? 'receiver' : 'sender'}.`,
        error: 'role_taken'
      });
    }

    // This branch handles when selecting same role they already have, just return current state (no changes needed)
    if (currentUserRole === role) {
      console.log(`✅ User already has ${role} selected - no changes needed`);
      return res.json({
        success: true,
        message: 'Role already selected',
        ticket
      });
    }

    // Updated this user's role selection (switching or first-time selection)
    if (isCreator) {
      ticket.creatorRole = role;
    } else {
      // For subdocument modification, we need to explicitly mark as modified
      const participantIndex = ticket.participants.findIndex(
        p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
      );
      if (participantIndex !== -1) {
        ticket.participants[participantIndex].role = role;
        ticket.markModified('participants');
      }
    }

    console.log(`✅ ${user.username} role updated to: ${role}`);

    // Removed this user's previous "selected their role" message if it exists
    const messageCountBefore = ticket.messages.length;
    ticket.messages = ticket.messages.filter(msg => 
      !(msg.embedData?.title?.includes('selected their role') &&
        msg.embedData?.title?.includes(`@${user.username}`))
    );
    
    if (messageCountBefore !== ticket.messages.length) {
      console.log(`🧹 Removed previous role selection message for ${user.username}`);
    }

    // Also remove any old confirmation prompts (user switched roles, so old confirmation is invalid)
    ticket.messages = ticket.messages.filter(msg => 
      !(msg.embedData?.actionType === 'role-confirmation')
    );

    // Added this user's new role selection message
    ticket.messages.push({
      isBot: true,
      content: 'Role Selected',
      type: 'embed',
      embedData: {
        title: `@${user.username} selected their role`,
        description: `@${user.username} will be the <strong>${role}</strong>. Waiting for the other user to select their role.`,
        color: 'green'
      },
      timestamp: new Date()
    });
    console.log(`💬 Added "@${user.username} selected their role" message`);

    // This check determines whether BOTH users have now selected roles AND they're DIFFERENT
    const finalCreatorRole = isCreator ? role : ticket.creatorRole;
    const finalParticipantRole = isCreator ? otherParticipant?.role : role;
    
    console.log(`🔍 Final Role Check:`);
    console.log(`   Creator role: ${finalCreatorRole}`);
    console.log(`   Participant role: ${finalParticipantRole}`);

    if (finalCreatorRole && finalParticipantRole && finalCreatorRole !== finalParticipantRole) {
      console.log(`🎉 BOTH USERS SELECTED DIFFERENT ROLES - Adding confirmation prompt`);
      
      // Removed the "Select Your Role" prompt (no longer needed)
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'role-selection')
      );

      const creatorUser = ticket.creator;
      // Uses the accepted participant (the "other user" if creator is making selection, or thisUserParticipant if participant is making selection)
      const participantUser = isCreator ? otherParticipant.user : thisUserParticipant.user;
      
      const senderUser = finalCreatorRole === 'sender' ? creatorUser : participantUser;
      const receiverUser = finalCreatorRole === 'receiver' ? creatorUser : participantUser;

      // Added confirmation prompt
      ticket.messages.push({
        isBot: true,
        content: 'Role Confirmation',
        type: 'embed',
        embedData: {
          title: 'Confirm Trade Roles',
          description: `<strong>Sender:</strong> @${senderUser.username} (will send ${ticket.cryptocurrency})\n<strong>Receiver:</strong> @${receiverUser.username} (will receive ${ticket.cryptocurrency})\n\nPlease confirm if this is correct.`,
          color: 'blue',
          requiresAction: true,
          actionType: 'role-confirmation'
        },
        timestamp: new Date()
      });
      console.log(`✅ Confirmation prompt added`);
    } else {
      console.log(`⏳ Waiting for other user to select (or both to select different roles)`);
    }

    // This saves ticket.
    await ticket.save();
    
    // Re-populate to ensure fresh data
    await ticket.populate('creator', 'username userId avatar');
    await ticket.populate('participants.user', 'username userId avatar');
    
    console.log(`💾 Ticket saved - ${ticket.messages.length} messages total\n`);

    res.json({
      success: true,
      message: 'Role selected successfully',
      ticket
    });
  } catch (error) {
    console.error('❌ Select role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to select role',
      error: error.message
    });
  }
};

// Confirms or rejects role selection
export const confirmRoles = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed } = req.body; // true or false
    const userId = req.user._id;

    console.log(`\n🎯 CONFIRM ROLES REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Confirmed: ${confirmed}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();

    const acceptedParticipants = ticket.participants.filter(
      p => p.user && p.status === 'accepted'
    );

    // This lookup finds THIS user's participant entry
    const thisUserParticipant = acceptedParticipants.find(
      p => p.user._id.toString() === userId.toString()
    );

    if (!isCreator && !thisUserParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId).select('username');

    if (confirmed) {
      const alreadyConfirmed = ticket.roleConfirmations.get(userId.toString()) === true;
      if (alreadyConfirmed) {
        return res.json({
          success: true,
          message: 'Role already confirmed',
          ticket
        });
      }

      // Marks user as confirmed
      ticket.roleConfirmations.set(userId.toString(), true);
      console.log(`✅ User ${user.username} confirmed roles`);

      // This check determines whether both users confirmed (works regardless of who confirms first)
      const creatorId = ticket.creator._id.toString();
      const participantIds = acceptedParticipants.map(p => p.user._id.toString());
      const creatorConfirmed = ticket.roleConfirmations.get(creatorId);
      const participantConfirmed = participantIds.length > 0
        ? participantIds.every(id => ticket.roleConfirmations.get(id) === true)
        : false;
      
      console.log(`📊 Confirmation status:`);
      console.log(`   Creator confirmed: ${creatorConfirmed}`);
      console.log(`   Participant confirmed: ${participantConfirmed}`);

      if (creatorConfirmed && participantConfirmed) {
        // BOTH CONFIRMED - Finalize roles and save to database
        ticket.rolesConfirmed = true;
        console.log(`🎉 BOTH USERS CONFIRMED! Finalizing roles in database...`);
        console.log(`   Sender: ${ticket.creatorRole === 'sender' ? 'Creator' : 'Participant'}`);
        console.log(`   Receiver: ${ticket.creatorRole === 'receiver' ? 'Creator' : 'Participant'}`);

        // Removed ALL role-related prompts including confirmations
        const messageCountBefore = ticket.messages.length;
        ticket.messages = ticket.messages.filter(msg => 
          !(msg.embedData?.actionType === 'role-confirmation' ||
            msg.embedData?.title?.includes('confirmed their role'))
        );
        console.log(`🧹 Cleaned up ${messageCountBefore - ticket.messages.length} confirmation messages`);

        // Added final success message
        const creatorUser = ticket.creator;
        const participantUser = acceptedParticipants[0]?.user;
        
        const senderUser = ticket.creatorRole === 'sender' ? creatorUser : participantUser;
        const receiverUser = ticket.creatorRole === 'receiver' ? creatorUser : participantUser;

        ticket.messages.push({
          isBot: true,
          content: 'Roles Confirmed',
          type: 'embed',
          embedData: {
            title: 'Trade Roles Confirmed!',
            description: `<strong>Sender:</strong> @${senderUser.username}\n<strong>Receiver:</strong> @${receiverUser.username}\n\nYou may now proceed with your deal.`,
            color: 'green'
          },
          timestamp: new Date()
        });

        await ticket.save();
        console.log(`💾 ✅ ROLES FINALIZED AND SAVED TO DATABASE`);
        console.log(`   Ticket ${ticket.ticketId} - Roles are now permanent\n`);

        // Schedules amount prompt to show after 3-5 seconds
        const delay = 3000 + Math.random() * 2000; // 3-5 seconds
        setTimeout(async () => {
          try {
            const updatedTicket = await TradeTicket.findOne({ ticketId })
              .populate('creator', 'username userId avatar')
              .populate('participants.user', 'username userId avatar');
            
            if (updatedTicket && updatedTicket.rolesConfirmed && !updatedTicket.amountPromptShown) {
              const senderIsCreator = updatedTicket.creatorRole === 'sender';
              const senderUser = senderIsCreator ? updatedTicket.creator : updatedTicket.participants.find(p => p.status === 'accepted')?.user;
              
              updatedTicket.messages.push({
                isBot: true,
                content: 'Enter Deal Amount',
                type: 'embed',
                embedData: {
                  title: 'Enter Deal Amount',
                  description: `@${senderUser.username} (Sender), please type the amount you will be sending to the Handshake BOT.\n\nExample: 100, $100, or 100.00`,
                  color: 'blue',
                  requiresAction: true,
                  actionType: 'amount-entry'
                },
                timestamp: new Date()
              });
              
              updatedTicket.amountPromptShown = true;
              await updatedTicket.save();
              console.log(`💰 Amount prompt shown for ticket ${ticketId}`);
            }
          } catch (error) {
            console.error('Error showing amount prompt:', error);
          }
        }, delay);

        res.json({
          success: true,
          message: 'Roles confirmed! Ready to proceed.',
          ticket
        });
      } else {
        // Waiting for other user to confirm
        console.log(`⏳ Waiting for other user to confirm...`);
        
        // Removed previous "confirmed their role" messages to avoid spam
        ticket.messages = ticket.messages.filter(msg => 
          !msg.embedData?.title?.includes('confirmed their role')
        );
        
        ticket.messages.push({
          isBot: true,
          content: 'Confirmation Received',
          type: 'embed',
          embedData: {
            title: `@${user.username} confirmed their role`,
            description: 'Waiting for the other user to confirm...',
            color: 'blue'
          },
          timestamp: new Date()
        });

        await ticket.save();
        console.log(`💾 Saved confirmation status (waiting for other user)\n`);

        res.json({
          success: true,
          message: 'Waiting for other user to confirm',
          ticket
        });
      }
    } else {
      // REJECTED - Reset everything and start over
      console.log(`❌ User ${user.username} rejected roles - RESETTING EVERYTHING`);
      
      // Resets roles completely
      ticket.creatorRole = null;
      // Resets ALL participant roles (in case there are multiple)
      ticket.participants.forEach(p => {
        if (p.status === 'accepted') {
          p.role = null;
        }
      });
      ticket.markModified('participants');
      ticket.roleConfirmations = new Map();
      ticket.rolesConfirmed = false;

      console.log(`🔄 All roles cleared`);

      // Removed ALL role-related messages (clean slate)
      const messageCountBefore = ticket.messages.length;
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.title?.includes('Select Your Role') || 
          msg.embedData?.title?.includes('selected their role') ||
          msg.embedData?.title?.includes('Confirm Trade Roles') ||
          msg.embedData?.title?.includes('confirmed their role') ||
          msg.embedData?.title?.includes('Role Already Selected') ||
          msg.embedData?.actionType === 'role-confirmation' ||
          msg.embedData?.actionType === 'role-selection')
      );
      console.log(`🧹 Deleted ${messageCountBefore - ticket.messages.length} role-related messages`);

      // Added rejection message
      ticket.messages.push({
        isBot: true,
        content: 'Roles Rejected',
        type: 'embed',
        embedData: {
          title: 'Role Selection Restarted',
          description: `@${user.username} indicated the roles were incorrect. Please select your roles again.`,
          color: 'red'
        },
        timestamp: new Date()
      });

      // Added fresh role selection prompt
      ticket.messages.push({
        isBot: true,
        content: 'Select Your Role',
        type: 'embed',
        embedData: {
          title: 'Select Your Role',
          description: 'Please select whether you are the <strong>Sender</strong> (sending cryptocurrency) or the <strong>Receiver</strong> (receiving cryptocurrency).',
          color: 'blue',
          requiresAction: true,
          actionType: 'role-selection'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Ticket reset complete - starting fresh\n`);

      res.json({
        success: true,
        message: 'Roles reset. Please select again.',
        ticket
      });
    }
  } catch (error) {
    console.error('❌ Confirm roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm roles',
      error: error.message
    });
  }
};

// Triggers role selection prompt
export const triggerRoleSelection = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // This check determines whether user has access
    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // This check determines whether role selection should be shown
    if (ticket.status === 'in-progress' && 
        ticket.roleSelectionTriggeredAt && 
        !ticket.roleSelectionShown &&
        !ticket.rolesConfirmed) {
      
      console.log('🎯 Adding role selection prompt to ticket:', ticketId);
      
      // Added role selection prompt
      ticket.messages.push({
        isBot: true,
        content: 'Select Your Role',
        type: 'embed',
        embedData: {
          title: 'Select Your Role',
          description: 'Please select whether you are the <strong>Sender</strong> (sending cryptocurrency) or the <strong>Receiver</strong> (receiving cryptocurrency).',
          color: 'blue',
          requiresAction: true,
          actionType: 'role-selection'
        },
        timestamp: new Date()
      });

      ticket.roleSelectionShown = true;
      await ticket.save();

      console.log('✅ Role selection prompt added, requiresAction:', true, 'actionType:', 'role-selection');

      res.json({
        success: true,
        message: 'Role selection prompt added',
        newMessage: ticket.messages[ticket.messages.length - 1],
        ticket
      });
    } else {
      res.json({
        success: false,
        message: 'Role selection not needed'
      });
    }
  } catch (error) {
    console.error('Trigger role selection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger role selection',
      error: error.message
    });
  }
};

// Detects and processes amount from sender
export const detectAmount = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    console.log(`\n💰 DETECT AMOUNT REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Message: ${message}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // This check determines whether roles are confirmed but amount not yet confirmed
    if (!ticket.rolesConfirmed || ticket.dealAmountConfirmed) {
      return res.json({
        success: false,
        message: 'Not in amount entry phase'
      });
    }

    // Determines who is the sender
    const senderIsCreator = ticket.creatorRole === 'sender';
    const senderId = senderIsCreator ? ticket.creator._id.toString() : ticket.participants.find(p => p.status === 'accepted')?.user._id.toString();
    
    // This check determines whether this message is from the sender
    if (userId.toString() !== senderId) {
      console.log(`⏭️ Ignoring message - not from sender`);
      return res.json({
        success: false,
        message: 'Only sender can enter amount'
      });
    }

    // Extracts amount from message using regex
    // Matches: 100, $100, 100.00, $100.00, etc.
    const amountRegex = /\$?\s*(\d+(?:[,]\d{3})*(?:\.\d{1,2})?)/;
    const match = message.match(amountRegex);

    if (!match) {
      console.log(`❌ No amount detected in message`);
      return res.json({
        success: false,
        message: 'No amount detected'
      });
    }

    // Parses the amount (remove commas)
    const amountStr = match[1].replace(/,/g, '');
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
      console.log(`❌ Invalid amount: ${amountStr}`);
      return res.json({
        success: false,
        message: 'Invalid amount'
      });
    }

    if (amount < MIN_TRADE_USD) {
      return res.status(400).json({
        success: false,
        code: 'TRADE_AMOUNT_TOO_SMALL',
        message: `Handshake's minimum protected trade is ${formatUsd(MIN_TRADE_USD)}`
      });
    }

    try {
      await assessTradeAmount({ ticketId: ticket.ticketId, userId, amount });
    } catch (riskError) {
      return res.status(riskError.statusCode || 409).json({
        success: false,
        code: riskError.code || 'TRADE_RISK_REJECTED',
        message: riskError.message,
        risk: riskError.details || {}
      });
    }

    console.log(`✅ Amount detected: $${amount.toFixed(2)}`);

    // Updated the amount entry prompt to orange
    const amountPromptIndex = ticket.messages.findIndex(msg => 
      msg.embedData?.actionType === 'amount-entry'
    );
    
    if (amountPromptIndex !== -1) {
      ticket.messages[amountPromptIndex].embedData.color = 'orange';
      ticket.messages[amountPromptIndex].embedData.description += `\n\n✅ Amount detected: **$${amount.toFixed(2)} USD**`;
    }

    // Removed any previous amount confirmation prompts
    ticket.messages = ticket.messages.filter(msg => 
      msg.embedData?.actionType !== 'amount-confirmation'
    );

    // Resets confirmations for new amount
    ticket.amountConfirmations = new Map();
    ticket.dealAmountConfirmed = false;
    ticket.markModified('amountConfirmations');

    // Added confirmation prompt
    ticket.messages.push({
      isBot: true,
      content: 'Confirm Amount',
      type: 'embed',
      embedData: {
        title: 'Confirm Deal Amount',
        description: `The sender will send <strong>$${amount.toFixed(2)} USD</strong> worth of ${ticket.cryptocurrency}.\n\nPlease confirm if this is the correct amount.`,
        color: 'blue',
        requiresAction: true,
        actionType: 'amount-confirmation'
      },
      timestamp: new Date()
    });

    // Stores the amount temporarily (not confirmed yet)
    ticket.dealAmount = amount;
    ticket.markModified('messages');
    await ticket.save();

    console.log(`💾 Amount saved temporarily: $${amount.toFixed(2)}\n`);

    res.json({
      success: true,
      message: 'Amount detected and confirmation requested',
      amount: amount,
      ticket
    });
  } catch (error) {
    console.error('❌ Detect amount error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to detect amount',
      error: error.message
    });
  }
};

// Confirms deal amount
export const confirmAmount = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed } = req.body;
    const userId = req.user._id;

    console.log(`\n💰 CONFIRM AMOUNT REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Confirmed: ${confirmed}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();

    const acceptedParticipants = ticket.participants.filter(
      p => p.user && p.status === 'accepted'
    );

    const thisUserParticipant = acceptedParticipants.find(
      p => p.user._id.toString() === userId.toString()
    );

    if (!isCreator && !thisUserParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId).select('username');

    if (confirmed) {
      if (Number(ticket.dealAmount || 0) < MIN_TRADE_USD) {
        return res.status(400).json({
          success: false,
          code: 'TRADE_AMOUNT_TOO_SMALL',
          message: `Handshake's minimum protected trade is ${formatUsd(MIN_TRADE_USD)}`
        });
      }

      try {
        await assessTradeAmount({
          ticketId: ticket.ticketId,
          userId,
          amount: ticket.dealAmount
        });
      } catch (riskError) {
        return res.status(riskError.statusCode || 409).json({
          success: false,
          code: riskError.code || 'TRADE_RISK_REJECTED',
          message: riskError.message,
          risk: riskError.details || {}
        });
      }

      if (ticket.dealAmountConfirmed) {
        return res.json({
          success: true,
          message: 'Amount already confirmed',
          ticket
        });
      }

      const alreadyConfirmed = ticket.amountConfirmations.get(userId.toString()) === true;
      if (alreadyConfirmed) {
        return res.json({
          success: true,
          message: 'Amount already confirmed',
          ticket
        });
      }

      // Marks user as confirmed
      ticket.amountConfirmations.set(userId.toString(), true);
      console.log(`✅ User ${user.username} confirmed amount`);

      // This check determines whether both users confirmed
      const creatorConfirmed = ticket.amountConfirmations.get(ticket.creator._id.toString());
      const participantIds = acceptedParticipants.map(p => p.user._id.toString());
      const participantConfirmed = participantIds.length > 0
        ? participantIds.every(id => ticket.amountConfirmations.get(id) === true)
        : false;
      
      console.log(`📊 Amount confirmation status:`);
      console.log(`   Creator confirmed: ${creatorConfirmed}`);
      console.log(`   Participant confirmed: ${participantConfirmed}`);

      if (creatorConfirmed && participantConfirmed) {
        // BOTH CONFIRMED
        ticket.dealAmountConfirmed = true;
        console.log(`🎉 BOTH USERS CONFIRMED AMOUNT!`);

        // Removed ALL amount-related prompts including confirmations
        const messageCountBefore = ticket.messages.length;
        ticket.messages = ticket.messages.filter(msg => 
          !(msg.embedData?.actionType === 'amount-entry' ||
            msg.embedData?.actionType === 'amount-confirmation' ||
            msg.embedData?.title?.includes('confirmed the amount'))
        );
        console.log(`🧹 Cleaned up ${messageCountBefore - ticket.messages.length} amount messages`);

        // Added final success message
        ticket.addUniqueMessage({
          isBot: true,
          content: 'Amount Confirmed',
          type: 'embed',
          embedData: {
            title: 'Deal Amount Confirmed!',
            description: `The deal amount of <strong>$${ticket.dealAmount.toFixed(2)} USD</strong> has been confirmed.\n\nYou may now proceed with the transaction.`,
            color: 'green'
          },
          timestamp: new Date()
        });

        if (ticket.safetyReviewRequired) {
          ticket.messages.push({
            isBot: true,
            content: 'Define Deal Protection',
            type: 'embed',
            embedData: {
              title: 'Write the Deal Before Funding It',
              description: 'Use the Safety Copilot panel to record the item or service, delivery proof, deadline, inspection window, acceptance criteria, and refund outcome. Both parties must confirm the same terms before payment options unlock.',
              color: 'blue',
              requiresAction: true,
              actionType: 'deal-agreement-setup'
            },
            timestamp: new Date()
          });
        }

        // Schedules fee prompt to show after 2 seconds for legacy tickets only.
        setTimeout(async () => {
          try {
            const feeTicket = await TradeTicket.findOne({ ticketId })
              .populate('creator', 'username userId avatar')
              .populate('participants.user', 'username userId avatar');
            
            if (feeTicket && !feeTicket.safetyReviewRequired && feeTicket.dealAmountConfirmed && !feeTicket.feesConfirmed) {
              const hasFeePrompt = feeTicket.messages.some(msg => msg.embedData?.actionType === 'fee-selection');
              if (hasFeePrompt) {
                return;
              }

              feeTicket.messages.push({
                isBot: true,
                content: 'Fee Options',
                type: 'embed',
                embedData: {
                  title: 'Apply Handshake Credits?',
                  description: buildFeePromptDescription(feeTicket.dealAmount),
                  color: 'blue',
                  requiresAction: true,
                  actionType: 'fee-selection'
                },
                timestamp: new Date()
              });
              
              await feeTicket.save();
              console.log(`💳 Fee prompt shown for ticket ${ticketId}`);
            }
          } catch (error) {
            console.error('Error showing fee prompt:', error);
          }
        }, 2000);

        await ticket.save();
        console.log(`💾 ✅ AMOUNT FINALIZED AND SAVED TO DATABASE`);
        console.log(`   Ticket ${ticket.ticketId} - Amount: $${ticket.dealAmount.toFixed(2)}\n`);

        res.json({
          success: true,
          message: 'Amount confirmed!',
          ticket
        });
      } else {
        // Waiting for other user to confirm
        console.log(`⏳ Waiting for other user to confirm amount...`);
        
        // Removed previous "confirmed the amount" messages to avoid spam
        ticket.messages = ticket.messages.filter(msg => 
          !msg.embedData?.title?.includes('confirmed the amount')
        );
        
        ticket.messages.push({
          isBot: true,
          content: 'Confirmation Received',
          type: 'embed',
          embedData: {
            title: `@${user.username} confirmed the amount`,
            description: 'Waiting for the other user to confirm...',
            color: 'blue'
          },
          timestamp: new Date()
        });

        await ticket.save();
        console.log(`💾 Saved amount confirmation status (waiting for other user)\n`);

        res.json({
          success: true,
          message: 'Waiting for other user to confirm',
          ticket
        });
      }
    } else {
      // REJECTED - Reset and re-prompt
      console.log(`❌ User ${user.username} rejected amount - RESETTING`);
      
      // Resets amount
      ticket.dealAmount = null;
      ticket.amountConfirmations = new Map();
      ticket.dealAmountConfirmed = false;
      ticket.markModified('amountConfirmations');

      console.log(`🔄 Amount cleared`);

      // Removed ALL amount-related messages
      const messageCountBefore = ticket.messages.length;
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'amount-entry' || 
          msg.embedData?.actionType === 'amount-confirmation' ||
          msg.embedData?.title?.includes('confirmed the amount'))
      );
      console.log(`🧹 Deleted ${messageCountBefore - ticket.messages.length} amount-related messages`);

      // Added rejection message and re-prompt
      const senderIsCreator = ticket.creatorRole === 'sender';
      const senderUser = senderIsCreator
        ? ticket.creator
        : acceptedParticipants[0]?.user;

      ticket.messages.push({
        isBot: true,
        content: 'Amount Rejected',
        type: 'embed',
        embedData: {
          title: 'Amount Entry Restarted',
          description: `@${user.username} indicated the amount was incorrect. Please enter the amount again.`,
          color: 'red'
        },
        timestamp: new Date()
      });

      // Re-add amount entry prompt
      ticket.messages.push({
        isBot: true,
        content: 'Enter Deal Amount',
        type: 'embed',
        embedData: {
          title: 'Enter Deal Amount',
          description: `@${senderUser.username} (Sender), please type the amount you will be sending to the Handshake BOT.\n\nExample: 100, $100, or 100.00`,
          color: 'blue',
          requiresAction: true,
          actionType: 'amount-entry'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Amount entry reset - ready for new amount\n`);

      res.json({
        success: true,
        message: 'Amount rejected, please enter again',
        ticket
      });
    }
  } catch (error) {
    console.error('❌ Confirm amount error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm amount',
      error: error.message
    });
  }
};

// Selects fee option (proceed with fees or apply fee credits)
export const selectFeeOption = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { option } = req.body; // 'with-fees' or 'use-credit'
    const userId = req.user._id;

    console.log(`\n💳 FEE OPTION REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Option: ${option}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar passes feeCredits')
      .populate('participants.user', 'username userId avatar passes feeCredits');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (!hasCompletedSafetyReview(ticket)) {
      return res.status(409).json(buildSafetyGateResponse(ticket));
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();
    const thisUserParticipant = ticket.participants.find(
      p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );
    const otherParticipant = ticket.participants.find(
      p => p.user._id.toString() !== userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !thisUserParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId).select('username passes feeCredits');

    if (option === 'use-credit' || option === 'use-pass') {
      // Show private pass prompt to this user only
      console.log(`🎫 User ${user.username} wants to use a pass. Available passes: ${user.passes}`);
      
      const quote = calculateFeeBreakdown(ticket.dealAmount, user.feeCredits);
      const hasLegacyPass = user.passes > 0;

      if (quote.creditApplied <= 0 && !hasLegacyPass) {
        return res.status(400).json({
          success: false,
          message: 'You do not have any Handshake Credits available'
        });
      }

      res.json({
        success: true,
        showPassPrompt: true,
        availableCredits: Number(user.feeCredits || 0),
        availableLegacyPasses: Number(user.passes || 0),
        availablePasses: user.passes,
        platformFee: quote.platformFee,
        creditToApply: hasLegacyPass && quote.creditApplied <= 0
          ? quote.platformFee
          : quote.creditApplied,
        feeAfterCredit: hasLegacyPass && quote.creditApplied <= 0
          ? 0
          : quote.feeDue,
        message: 'Show credit confirmation to user'
      });
    } else if (option === 'with-fees') {
      // User wants to proceed with fees - need other user to confirm
      console.log(`💰 User ${user.username} selected to proceed with fees`);

      // Removed previous fee-related messages
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'fee-selection' ||
          msg.embedData?.actionType === 'fee-confirmation')
      );

      // Marks this user's choice and track who initiated it
      ticket.feeDecision = 'with-fees';
      ticket.feeInitiatedBy = userId; // Track who clicked "Proceed with Fees"

      // Added confirmation prompt for OTHER user only
      const otherUser = isCreator ? otherParticipant.user : ticket.creator;
      
      ticket.messages.push({
        isBot: true,
        content: 'Confirm Fees',
        type: 'embed',
        embedData: {
          title: 'Confirm Fee Decision',
          description: `@${user.username} has chosen to proceed with fees. @${otherUser.username}, please confirm if this is correct.`,
          color: 'blue',
          requiresAction: true,
          actionType: 'fee-confirmation'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Fee decision saved - awaiting confirmation\n`);

      res.json({
        success: true,
        message: 'Awaiting fee confirmation',
        ticket
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid fee option'
      });
    }
  } catch (error) {
    console.error('❌ Select fee option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to select fee option',
      error: error.message
    });
  }
};

// Confirms applying fee credits. The route name is retained for older clients.
export const confirmPassUse = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    console.log(`\n🎫 CONFIRM PASS USE:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user?._id?.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!hasCompletedSafetyReview(ticket)) {
      return res.status(409).json(buildSafetyGateResponse(ticket));
    }

    if (!ticket.dealAmountConfirmed || ticket.feesConfirmed) {
      return res.status(400).json({
        success: false,
        message: 'Ticket is not in fee selection stage'
      });
    }

    const user = await User.findById(userId).select('username passes feeCredits');

    if (user.feeCredits <= 0 && user.passes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No Handshake Credits available'
      });
    }

    // Race-condition protection for both credits and legacy passes.
    if (ticket.feeCreditUsedBy || ticket.passUsedBy) {
      return res.status(400).json({
        success: false,
        message: 'A fee benefit has already been applied to this transaction'
      });
    }

    const platformFee = calculatePlatformFee(ticket.dealAmount);
    const useLegacyPass = user.feeCredits <= 0 && user.passes > 0;
    const creditApplied = useLegacyPass
      ? platformFee
      : Math.min(Number(user.feeCredits || 0), platformFee);

    if (useLegacyPass) {
      user.passes -= 1;
    } else {
      user.feeCredits = Number((user.feeCredits - creditApplied).toFixed(2));
    }
    await user.save();

    ticket.feeDecision = useLegacyPass ? 'with-pass' : 'with-credit';
    ticket.platformFeeUsd = platformFee;
    ticket.feeCreditAppliedUsd = creditApplied;
    ticket.netPlatformFeeUsd = Number((platformFee - creditApplied).toFixed(2));
    ticket.feeCreditUsedBy = userId;
    ticket.passUsedBy = useLegacyPass ? userId : undefined;
    ticket.legacyPassUsed = useLegacyPass;
    ticket.feesConfirmed = true;

    // Removed all fee-related prompts
    ticket.messages = ticket.messages.filter(msg => 
      !(msg.embedData?.actionType === 'fee-selection' ||
        msg.embedData?.actionType === 'fee-confirmation')
    );

    const remainingFee = Number((platformFee - creditApplied).toFixed(2));

    // Added success message
    ticket.addUniqueMessage({
      isBot: true,
      content: useLegacyPass ? 'Legacy Pass Used' : 'Handshake Credits Applied',
      type: 'embed',
      embedData: {
        title: useLegacyPass ? 'Legacy Pass Applied' : 'Handshake Credits Applied',
        description: useLegacyPass
          ? `@${user.username} used a legacy pass. The ${formatUsd(platformFee)} platform fee is fully covered.`
          : `@${user.username} applied ${formatUsd(creditApplied)} in credits to the ${formatUsd(platformFee)} platform fee. Remaining platform fee: ${formatUsd(remainingFee)}.`,
        color: 'green'
      },
      timestamp: new Date()
    });

    // Added transaction prompt immediately
    const senderUser = ticket.creatorRole === 'sender'
      ? ticket.creator
      : ticket.participants.find(p => p.status === 'accepted' && p.role === 'sender')?.user
        || ticket.participants.find(p => p.status === 'accepted')?.user;

    if (senderUser) {
      const totalAmount = calculateTotalAmount(
        ticket.dealAmount, 
        ticket.cryptocurrency,
        creditApplied
      );
      const { wallet: botWallet, mode: transactionNetworkMode } = await resolveTicketDepositDestination(ticket);
      const exchangeRate = getTicketExchangeRate(ticket, transactionNetworkMode);
      const cryptoAmount = getTicketCryptoAmount(ticket, totalAmount, transactionNetworkMode).toFixed(8);

      if (!botWallet) {
        ticket.messages.push({
          isBot: true,
          content: 'Wallet Not Configured',
          type: 'embed',
          embedData: {
            title: 'Wallet Not Configured',
            description: `Handshake does not have a ${ticket.cryptocurrency?.toUpperCase() || 'crypto'} wallet configured for ${transactionNetworkMode}. Please contact staff.`,
            color: 'red'
          },
          timestamp: new Date()
        });
        await ticket.save();

        return res.status(500).json({
          success: false,
          message: 'Bot wallet not configured for selected cryptocurrency',
          ticket
        });
      }

      ticket.messages.push({
        isBot: true,
        content: 'Send Funds',
        type: 'embed',
        embedData: {
          title: 'Send Funds to Handshake',
          description: `@${senderUser.username} (Sender), please send the <strong>EXACT</strong> amount to the Handshake bot wallet address below.\n\n<strong>Amount to Send:</strong> ${cryptoAmount} ${ticket.cryptocurrency.toUpperCase()}\n<strong>USD Value:</strong> $${totalAmount.toFixed(2)}\n\n<strong>Bot Wallet Address:</strong>\n${botWallet}\n\n⚠️ <strong>Important:</strong> Send the EXACT amount to ensure the bot can detect your transaction. If you experience issues, type /ping in chat to alert staff.`,
          color: 'blue',
          requiresAction: true,
          actionType: 'transaction-send',
          metadata: {
            botWallet,
            cryptoAmount,
            totalAmount,
            exchangeRate: `1 ${ticket.cryptocurrency.toUpperCase()} = $${exchangeRate.toLocaleString()} USD`,
            exchangeNetworkMode: transactionNetworkMode
          }
        },
        timestamp: new Date()
      });

      ticket.transactionPromptShown = true;
      ticket.awaitingTransaction = true;
      ticket.botWalletAddress = botWallet;
      ticket.transactionNetworkMode = transactionNetworkMode;
      ticket.expectedAmount = totalAmount;
      ticket.expectedCryptoAmount = Number(cryptoAmount);
      ticket.exchangeRateUsed = exchangeRate;
      console.log(`📤 Transaction prompt added for ${senderUser.username}`);
    }

    await ticket.save();
    console.log(`✅ Pass used by ${user.username}. Fees confirmed.\n`);

    res.json({
      success: true,
      message: useLegacyPass ? 'Legacy pass used successfully' : 'Handshake Credits applied successfully',
      remainingCredits: Number(user.feeCredits || 0),
      remainingPasses: user.passes,
      feeBreakdown: getTicketFeeBreakdown(ticket),
      ticket
    });
  } catch (error) {
    console.error('❌ Confirm pass use error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to use pass',
      error: error.message
    });
  }
};

// Confirms fee decision
export const confirmFees = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed } = req.body;
    const userId = req.user._id;

    console.log(`\n💳 CONFIRM FEES REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Confirmed: ${confirmed}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user?._id?.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!hasCompletedSafetyReview(ticket)) {
      return res.status(409).json(buildSafetyGateResponse(ticket));
    }

    if (ticket.feeDecision !== 'with-fees' || !ticket.feeInitiatedBy) {
      return res.status(400).json({
        success: false,
        message: 'No pending fee decision to confirm'
      });
    }

    const user = await User.findById(userId).select('username');

    // This check determines whether this user is allowed to confirm (must be the OTHER user, not the one who clicked "Proceed with Fees")
    if (ticket.feeInitiatedBy && ticket.feeInitiatedBy.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot confirm your own fee decision. Waiting for the other user to confirm.'
      });
    }

    if (confirmed) {
      // Confirmed - finalize with fees
      const feeQuote = calculateFeeBreakdown(ticket.dealAmount);
      ticket.feesConfirmed = true;
      ticket.platformFeeUsd = feeQuote.platformFee;
      ticket.feeCreditAppliedUsd = 0;
      ticket.netPlatformFeeUsd = feeQuote.feeDue;
      console.log(`✅ Fees confirmed`);

      // Removed fee prompts
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'fee-selection' ||
          msg.embedData?.actionType === 'fee-confirmation')
      );

      // Added confirmation message
      ticket.addUniqueMessage({
        isBot: true,
        content: 'Fees Confirmed',
        type: 'embed',
        embedData: {
          title: 'Transaction with Fees Confirmed!',
          description: `Both users have agreed to proceed with standard fees.\n\nYou can now proceed with the transaction.`,
          color: 'green'
        },
        timestamp: new Date()
      });

    // Added transaction prompt immediately
    const senderUser = ticket.creatorRole === 'sender'
      ? ticket.creator
      : ticket.participants.find(p => p.status === 'accepted' && p.role === 'sender')?.user
        || ticket.participants.find(p => p.status === 'accepted')?.user;

      if (senderUser) {
        const totalAmount = calculateTotalAmount(
          ticket.dealAmount, 
          ticket.cryptocurrency,
          0
        );
        const { wallet: botWallet, mode: transactionNetworkMode } = await resolveTicketDepositDestination(ticket);
        const exchangeRate = getTicketExchangeRate(ticket, transactionNetworkMode);
        const cryptoAmount = getTicketCryptoAmount(ticket, totalAmount, transactionNetworkMode).toFixed(8);

        if (!botWallet) {
          ticket.messages.push({
            isBot: true,
            content: 'Wallet Not Configured',
            type: 'embed',
            embedData: {
              title: 'Wallet Not Configured',
              description: `Handshake does not have a ${ticket.cryptocurrency?.toUpperCase() || 'crypto'} wallet configured for ${transactionNetworkMode}. Please contact staff.`,
              color: 'red'
            },
            timestamp: new Date()
          });
          await ticket.save();

          return res.status(500).json({
            success: false,
            message: 'Bot wallet not configured for selected cryptocurrency',
            ticket
          });
        }

        ticket.messages.push({
          isBot: true,
          content: 'Send Funds',
          type: 'embed',
          embedData: {
            title: 'Send Funds to Handshake',
            description: `@${senderUser.username} (Sender), please send the <strong>EXACT</strong> amount to the Handshake bot wallet address below.\n\n<strong>Amount to Send:</strong> ${cryptoAmount} ${ticket.cryptocurrency.toUpperCase()}\n<strong>USD Value:</strong> $${totalAmount.toFixed(2)}\n\n<strong>Bot Wallet Address:</strong>\n${botWallet}\n\n⚠️ <strong>Important:</strong> Send the EXACT amount to ensure the bot can detect your transaction. If you experience issues, type /ping in chat to alert staff.`,
            color: 'blue',
            requiresAction: true,
            actionType: 'transaction-send',
            metadata: {
              botWallet,
              cryptoAmount,
              totalAmount,
              exchangeRate: `1 ${ticket.cryptocurrency.toUpperCase()} = $${exchangeRate.toLocaleString()} USD`,
              exchangeNetworkMode: transactionNetworkMode
            }
          },
          timestamp: new Date()
        });

        ticket.transactionPromptShown = true;
        ticket.awaitingTransaction = true;
        ticket.botWalletAddress = botWallet;
        ticket.transactionNetworkMode = transactionNetworkMode;
        ticket.expectedAmount = totalAmount;
        ticket.expectedCryptoAmount = Number(cryptoAmount);
        ticket.exchangeRateUsed = exchangeRate;
        console.log(`📤 Transaction prompt added for ${senderUser.username}`);
      }

      await ticket.save();
      console.log(`💾 Fees confirmed for ticket ${ticketId}\n`);

      res.json({
        success: true,
        message: 'Fees confirmed',
        ticket
      });
    } else {
      // Rejected - re-prompt
      console.log(`❌ User ${user.username} rejected fee decision - RESETTING`);
      
      ticket.feeDecision = null;
      ticket.feeInitiatedBy = null;

      // Removed fee messages
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'fee-selection' ||
          msg.embedData?.actionType === 'fee-confirmation')
      );

      // Added rejection message
      ticket.messages.push({
        isBot: true,
        content: 'Fee Decision Restarted',
        type: 'embed',
        embedData: {
          title: 'Fee Selection Restarted',
          description: `@${user.username} indicated this was incorrect. Please select your fee option again.`,
          color: 'red'
        },
        timestamp: new Date()
      });

      // Re-add fee prompt
      ticket.messages.push({
        isBot: true,
        content: 'Fee Options',
        type: 'embed',
        embedData: {
          title: 'Apply Handshake Credits?',
          description: buildFeePromptDescription(ticket.dealAmount),
          color: 'blue',
          requiresAction: true,
          actionType: 'fee-selection'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Fee selection reset\n`);

      res.json({
        success: true,
        message: 'Fee selection restarted',
        ticket
      });
    }
  } catch (error) {
    console.error('❌ Confirm fees error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm fees',
      error: error.message
    });
  }
};

// Copies transaction details to chat (limited to 3 times)
export const copyTransactionDetails = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    console.log(`\n📋 COPY TRANSACTION DETAILS:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // This check determines whether user has access
    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // This check determines whether the copy limit has been reached
    if (ticket.copyDetailsClickCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Copy limit reached (3 times maximum)'
      });
    }

    // Retrieves transaction details
    const { wallet: botWallet } = await resolveTicketDepositDestination(ticket);

    if (!botWallet) {
      return res.status(500).json({
        success: false,
        message: 'Bot wallet not configured for selected cryptocurrency'
      });
    }

    // This increments copy count.
    ticket.copyDetailsClickCount += 1;

    // Added wallet address message to chat only
    ticket.messages.push({
      isBot: true,
      content: `${botWallet}`,
      type: 'text',
      embedData: null,
      timestamp: new Date()
    });

    await ticket.save();
    console.log(`✅ Transaction details copied (${ticket.copyDetailsClickCount}/3)\n`);

    res.json({
      success: true,
      message: 'Transaction details copied to chat',
      copyCount: ticket.copyDetailsClickCount,
      ticket
    });
  } catch (error) {
    console.error('❌ Copy transaction details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to copy transaction details',
      error: error.message
    });
  }
};

// Releases funds (sender only)
export const releaseFunds = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    console.log(`\n💰 RELEASE FUNDS REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (!hasCompletedSafetyReview(ticket)) {
      return res.status(409).json(buildSafetyGateResponse(ticket));
    }

    // This check determines whether transaction is confirmed
    if (!ticket.transactionConfirmed) {
      return res.status(400).json({
        success: false,
        message: 'Transaction not yet confirmed'
      });
    }

    // This check determines whether funds are already released
    if (ticket.fundsReleased) {
      return res.status(400).json({
        success: false,
        message: 'Funds have already been released'
      });
    }

    if (ticket.releaseInitiated || ticket.awaitingPayoutAddress || ticket.awaitingPayoutConfirmation) {
      return res.status(400).json({
        success: false,
        message: 'Release already initiated. Waiting for receiver address.'
      });
    }

    // This lookup finds sender participant
    const senderParticipant = ticket.participants.find(p => p.role === 'sender');
    if (!senderParticipant && ticket.creatorRole !== 'sender') {
      return res.status(400).json({
        success: false,
        message: 'Sender not found'
      });
    }

    const isSender = ticket.creatorRole === 'sender'
      ? ticket.creator._id.toString() === userId.toString()
      : senderParticipant?.user?._id?.toString() === userId.toString();

    if (!isSender) {
      return res.status(403).json({
        success: false,
        message: 'Only the sender can release funds'
      });
    }

    const user = await User.findById(userId).select('username');
    const receiverParticipant = ticket.participants.find(p => p.role === 'receiver');
    let receiverUser = null;

    if (ticket.creatorRole === 'receiver') {
      receiverUser = ticket.creator;
    } else if (receiverParticipant) {
      receiverUser = (ticket.creator._id.toString() === receiverParticipant.user._id.toString()
        ? ticket.creator
        : receiverParticipant.user);
    }

    const senderUser = ticket.creatorRole === 'sender'
      ? ticket.creator
      : senderParticipant?.user || ticket.creator;
    const runtimeConfig = await getRuntimeConfig();
    const payoutNetworkMode = ticket.payoutNetworkMode
      || ticket.transactionNetworkMode
      || getActiveNetworkModeForCoin(ticket.cryptocurrency, runtimeConfig);
    const payoutFamily = getPayoutAddressFamily(ticket.cryptocurrency);
    const payoutLabel = ticket.cryptocurrency?.toUpperCase() || 'crypto';
    const addressTip = payoutFamily === 'ethereum'
      ? 'Use a standard 0x... Ethereum address.'
      : payoutFamily === 'solana'
        ? 'Use a standard Solana wallet address.'
        : `Use a valid ${payoutLabel} wallet address.`;

    ticket.releaseInitiated = true;
    ticket.releaseInitiatedBy = userId;
    ticket.awaitingPayoutAddress = true;
    ticket.awaitingPayoutConfirmation = false;
    ticket.pendingPayoutAddress = null;
    ticket.payoutNetworkMode = payoutNetworkMode;
    const releaseAuthorizedAt = new Date();
    const releasePayload = {
      ticketId: ticket.ticketId,
      dealAmount: Number(ticket.dealAmount),
      cryptocurrency: ticket.cryptocurrency,
      depositTransactionHash: ticket.senderTransactionHash || ticket.transactionHash || null,
      senderId: String(userId),
      receiverId: String(receiverUser?._id || ''),
      authorizedAt: releaseAuthorizedAt.toISOString()
    };
    ticket.releaseAuthorization = {
      ...releasePayload,
      digest: buildAuthorizationDigest(releasePayload)
    };

    // Removed release button message
    ticket.messages = ticket.messages.filter(msg => 
      msg.embedData?.actionType !== 'release-funds'
    );

    ticket.messages.push({
      isBot: true,
      content: 'Release Initiated',
      type: 'embed',
        embedData: {
          title: 'Release Initiated',
          description: `@${senderUser?.username || 'Sender'} has confirmed to release the funds.\n\n@${receiverUser?.username || 'Receiver'}, please paste your ${payoutLabel} payout address in the chat below so we can send your payout.\n\n<strong>Tip:</strong> ${addressTip}`,
        color: 'blue',
        requiresAction: true,
        actionType: 'payout-address'
      },
      timestamp: new Date()
    });

    await ticket.save();
    console.log(`✅ Release initiated for ticket ${ticketId} by ${user.username}\n`);

    res.json({
      success: true,
      message: 'Release initiated successfully',
      ticket
    });
  } catch (error) {
    console.error('❌ Release funds error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to release funds',
      error: error.message
    });
  }
};

// Submits receiver payout address
export const submitPayoutAddress = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { address } = req.body;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (!ticket.awaitingPayoutAddress) {
      return res.status(400).json({
        success: false,
        message: 'Not awaiting a payout address'
      });
    }

    const receiverParticipant = ticket.participants.find(p => p.role === 'receiver');
    const isReceiver = ticket.creatorRole === 'receiver'
      ? ticket.creator._id.toString() === userId.toString()
      : receiverParticipant?.user?._id?.toString() === userId.toString();

    if (!isReceiver) {
      return res.status(403).json({
        success: false,
        message: 'Only the receiver can submit the payout address'
      });
    }

    const checksumAddress = normalizePayoutAddress(address, ticket.cryptocurrency);

    if (!checksumAddress) {
      const payoutLabel = ticket.cryptocurrency?.toUpperCase() || 'crypto';
      ticket.messages.push({
        isBot: true,
        content: 'Invalid Address',
        type: 'embed',
        embedData: {
          title: `Invalid ${payoutLabel} Address`,
          description: `That does not look like a valid ${payoutLabel} address. Please paste a correct address and try again.`,
          color: 'red'
        },
        timestamp: new Date()
      });

      await ticket.save();
      return res.json({
        success: false,
        message: `Invalid ${payoutLabel} address`,
        ticket
      });
    }

    ticket.pendingPayoutAddress = checksumAddress;
    ticket.awaitingPayoutAddress = false;
    ticket.awaitingPayoutConfirmation = true;

    ticket.messages = ticket.messages.filter(msg =>
      msg.embedData?.actionType !== 'payout-address'
    );

    ticket.messages.push({
      isBot: true,
      content: 'Confirm Payout Address',
      type: 'embed',
      embedData: {
        title: 'Confirm Payout Address',
        description: `Please confirm this address is correct:\\n\\n<strong>${checksumAddress}</strong>\\n\\nIf this is correct, click <strong>This is Correct</strong>. If not, click <strong>This is Wrong</strong> and you can paste it again.`,
        color: 'blue',
        requiresAction: true,
        actionType: 'payout-address-confirmation',
        metadata: {
          address: checksumAddress
        }
      },
      timestamp: new Date()
    });

    await ticket.save();

    res.json({
      success: true,
      message: 'Payout address submitted',
      ticket
    });
  } catch (error) {
    console.error('❌ Submit payout address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit payout address',
      error: error.message
    });
  }
};

// Confirms payout address and sends funds
export const confirmPayoutAddress = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed } = req.body;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (!ticket.awaitingPayoutConfirmation || !ticket.pendingPayoutAddress) {
      return res.status(400).json({
        success: false,
        message: 'No payout address awaiting confirmation'
      });
    }

    const receiverParticipant = ticket.participants.find(p => p.role === 'receiver');
    const isReceiver = ticket.creatorRole === 'receiver'
      ? ticket.creator._id.toString() === userId.toString()
      : receiverParticipant?.user?._id?.toString() === userId.toString();

    if (!isReceiver) {
      return res.status(403).json({
        success: false,
        message: 'Only the receiver can confirm the payout address'
      });
    }

    // Removed existing confirmation prompt
    ticket.messages = ticket.messages.filter(msg => 
      msg.embedData?.actionType !== 'payout-address-confirmation'
    );

    if (!confirmed) {
      ticket.pendingPayoutAddress = null;
      ticket.awaitingPayoutConfirmation = false;
      ticket.awaitingPayoutAddress = true;

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'payout-address'
      );

      ticket.messages.push({
        isBot: true,
        content: 'Address Rejected',
        type: 'embed',
        embedData: {
          title: 'Address Rejected',
          description: `No problem. Please paste the correct ${ticket.cryptocurrency?.toUpperCase() || 'crypto'} payout address below when you are ready.`,
          color: 'orange',
          requiresAction: true,
          actionType: 'payout-address'
        },
        timestamp: new Date()
      });

      await ticket.save();
      return res.json({
        success: true,
        message: 'Address rejected',
        ticket
      });
    }

    try {
      const payoutAddress = ticket.pendingPayoutAddress;
      const runtimeConfig = await getRuntimeConfig();
      const payoutNetworkMode = ticket.payoutNetworkMode
        || ticket.transactionNetworkMode
        || getActiveNetworkModeForCoin(ticket.cryptocurrency, runtimeConfig);
      const { payoutCrypto, payoutUsd } = buildPayoutDetails(ticket, payoutNetworkMode);
      const payoutAuthorizedAt = new Date();
      const payoutAuthorizationPayload = {
        ticketId: ticket.ticketId,
        payoutAddress,
        payoutCrypto,
        payoutUsd,
        cryptocurrency: ticket.cryptocurrency,
        receiverId: String(userId),
        releaseDigest: ticket.releaseAuthorization?.digest || null,
        authorizedAt: payoutAuthorizedAt.toISOString()
      };
      ticket.payoutAuthorization = {
        ...payoutAuthorizationPayload,
        digest: buildAuthorizationDigest(payoutAuthorizationPayload)
      };
      ticket.markModified('payoutAuthorization');
      await ticket.save();

      const payoutResult = await sendTicketPayout({
        ticket,
        toAddress: payoutAddress,
        amountCrypto: payoutCrypto,
        amountUsd: payoutUsd,
        networkMode: payoutNetworkMode,
        purpose: 'ticket_payout',
        sourceType: 'ticket',
        sourceId: ticket.ticketId,
        actor: userId,
        idempotencyKey: `ticket-payout:${ticket.ticketId}:${payoutAddress}:${payoutCrypto}`
      });
      const { txHash, unit, confirmationNetwork } = payoutResult;
      const transferId = payoutResult.transfer?.transferId || null;
      const isQueued = !txHash;

      ticket.payoutAddress = payoutAddress;
      ticket.payoutAddressConfirmed = true;
      ticket.payoutTransactionHash = txHash || null;
      ticket.payoutNetworkMode = payoutNetworkMode;
      ticket.pendingPayoutAddress = null;
      ticket.awaitingPayoutConfirmation = false;
      ticket.awaitingPayoutAddress = false;

      const requiredConfirmations = getPayoutRequiredConfirmations(confirmationNetwork, payoutNetworkMode);

      ticket.messages.push({
        isBot: true,
        content: 'Payout Processing',
        type: 'embed',
        embedData: {
          title: 'Payout Sent',
          description: isQueued
            ? `Your payout has been queued for the signing service.\\n\\n<strong>Amount:</strong> <strong>${payoutCrypto} ${unit}</strong> (~$${Number(payoutUsd).toFixed(2)} USD)\\n<strong>To:</strong> <strong>${payoutAddress}</strong>\\n\\n<strong>Transfer ID:</strong> <strong>${transferId || 'pending'}</strong>`
            : `Your payout is on the way!\\n\\n<strong>Amount:</strong> <strong>${payoutCrypto} ${unit}</strong> (~$${Number(payoutUsd).toFixed(2)} USD)\\n<strong>To:</strong> <strong>${payoutAddress}</strong>\\n\\n<strong>Transaction:</strong> <strong>${txHash.substring(0, 16)}...</strong>`,
          color: 'blue',
          requiresAction: true,
          actionType: 'payout-confirming',
          metadata: {
            txHash,
            transferId,
            confirmations: 0,
            requiredConfirmations
          }
        },
        timestamp: new Date()
      });

      await ticket.save();

      const receiverName = ticket.creatorRole === 'receiver'
        ? ticket.creator?.username
        : receiverParticipant?.user?.username;

      if (txHash && confirmationNetwork === 'ethereum') {
        startPayoutConfirmationWatcher({
          ticketId,
          txHash,
          receiverName,
          networkMode: payoutNetworkMode
        });
      } else if (txHash && confirmationNetwork === 'solana') {
        startPayoutCompletionFinalizer({ ticketId, receiverName });
      } else if (txHash && (confirmationNetwork === 'bitcoin' || confirmationNetwork === 'litecoin')) {
        startUtxoPayoutConfirmationWatcher({
          ticketId,
          txHash,
          receiverName,
          coin: confirmationNetwork,
          networkMode: payoutNetworkMode
        });
      }

      return res.json({
        success: true,
        message: 'Payout sent',
        ticket
      });
    } catch (error) {
      console.error('❌ Payout send error:', error);
      ticket.pendingPayoutAddress = null;
      ticket.awaitingPayoutConfirmation = false;
      ticket.awaitingPayoutAddress = true;

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'payout-address'
      );

      ticket.messages.push({
        isBot: true,
        content: 'Payout Failed',
        type: 'embed',
        embedData: {
          title: 'Payout Failed',
          description: error.code === 'AUTOMATIC_PAYOUT_UNSUPPORTED'
            ? `${error.message} Staff must process this payout through the ticket admin refund/payout workflow.`
            : 'We could not send the payout. Please paste your address again or contact staff for help.',
          color: 'red',
          requiresAction: true,
          actionType: 'payout-address'
        },
        timestamp: new Date()
      });

      await ticket.save();
      return res.status(500).json({
        success: false,
        message: 'Failed to send payout',
        ticket
      });
    }
  } catch (error) {
    console.error('❌ Confirm payout address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payout address',
      error: error.message
    });
  }
};

// Rescans for transaction
export const rescanTransaction = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;
    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user?._id?.toString() === userId.toString() && p.status === 'accepted'
    );
    const isStaff = isStaffUser(req.user);

    if (!isCreator && !isParticipant && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { maxAttemptsReached } = applyRescanTransaction(ticket);
    await ticket.save();

    res.json({ success: true, ticket, maxAttemptsReached });
  } catch (error) {
    console.error('Error rescanning transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancels transaction
export const cancelTransaction = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;
    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user?._id?.toString() === userId.toString() && p.status === 'accepted'
    );
    const isStaff = isStaffUser(req.user);

    if (!isCreator && !isParticipant && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    applyCancelTransaction(ticket);

    await ticket.save();

    res.json({ success: true, ticket });
  } catch (error) {
    console.error('Error cancelling transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    User or admin cancels an entire ticket (not just the awaiting transaction).
//          Allowed before any funds have been confirmed into escrow. If funds are
//          already detected, the user must request a refund via an admin instead.
// @route   POST /api/tickets/:ticketId/cancel-ticket
// @access  Private (ticket creator, accepted participant, or staff)
export const cancelTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const reason = String(req.body?.reason || '').trim();
    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const userId = req.user._id.toString();
    const isCreator = ticket.creator?.toString() === userId;
    const isParticipant = ticket.participants.some(
      p => p.user?.toString() === userId && p.status === 'accepted'
    );
    const isStaff = isStaffUser(req.user);

    if (!isCreator && !isParticipant && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to cancel this ticket'
      });
    }

    if (['completed', 'cancelled', 'refunded'].includes(ticket.status)) {
      return res.status(400).json({
        success: false,
        message: `Ticket is already ${ticket.status}.`
      });
    }

    // Funds already locked in escrow → only admins can refund, regular users cannot cancel.
    const fundsLocked = Boolean(
      ticket.transactionConfirmed
      || ticket.fundsReleased
      || ticket.releaseInitiated
      || ['awaiting-close', 'closing'].includes(ticket.status)
    );
    if (fundsLocked && !isStaff) {
      return res.status(409).json({
        success: false,
        code: 'TICKET_HAS_ESCROWED_FUNDS',
        message: 'Funds have already been received. Contact staff to request a refund.'
      });
    }

    await restoreUnusedFeeBenefit(ticket);
    ticket.status = 'cancelled';
    ticket.awaitingTransaction = false;
    ticket.closeInitiatedBy = req.user._id;
    ticket.closedAt = new Date();
    ticket.closedBy = req.user._id;

    ticket.messages.push({
      isBot: true,
      content: 'Ticket Cancelled',
      type: 'embed',
      embedData: {
        title: 'Ticket Cancelled',
        description: isStaff
          ? `This ticket was cancelled by staff.${reason ? `\n\nReason: ${reason}` : ''}`
          : `This ticket was cancelled by the user.${reason ? `\n\nReason: ${reason}` : ''}`,
        color: 'red'
      },
      timestamp: new Date()
    });

    await ticket.save();

    res.json({
      success: true,
      message: 'Ticket cancelled.',
      ticket: {
        ticketId: ticket.ticketId,
        status: ticket.status,
        closedAt: ticket.closedAt
      }
    });
  } catch (error) {
    console.error('Cancel ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel ticket' });
  }
};

// @desc    Admin/staff issue a refund for a ticket. Records the destination and
//          reason. Actual on-chain transfer is performed manually (BTC/LTC sign
//          via Sparrow, ETH/SOL via the mnemonic-signed payout flow). This
//          endpoint marks the ticket as refunded once the admin confirms the
//          payout tx hash.
// @route   POST /api/tickets/:ticketId/admin-refund
// @access  Private (staff only)
export const adminRefundTicket = async (req, res) => {
  try {
    if (!isStaffUser(req.user)) {
      return res.status(403).json({
        success: false,
        code: 'STAFF_ONLY',
        message: 'Only staff can issue refunds.'
      });
    }

    const { ticketId } = req.params;
    const refundTransactionHash = String(req.body?.refundTransactionHash || '').trim();
    const refundReason = String(req.body?.refundReason || '').trim();
    const refundTargetRole = String(req.body?.refundTargetRole || '').trim();

    const ticket = await TradeTicket.findOne({ ticketId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const normalizedRefundAddress = normalizePayoutAddress(req.body?.refundAddress, ticket.cryptocurrency);
    if (!normalizedRefundAddress) {
      return res.status(400).json({
        success: false,
        message: `A valid ${ticket.cryptocurrency?.toUpperCase() || 'crypto'} refundAddress is required.`
      });
    }

    if (ticket.status === 'refunded') {
      return res.status(400).json({
        success: false,
        message: 'Ticket has already been refunded.'
      });
    }

    const runtimeConfig = await getRuntimeConfig();
    const refundNetworkMode = ticket.payoutNetworkMode
      || ticket.transactionNetworkMode
      || getActiveNetworkModeForCoin(ticket.cryptocurrency, runtimeConfig);
    const refundUsd = Number(ticket.expectedAmount || ticket.dealAmount || 0);
    const storedRefundCrypto = Number(ticket.expectedCryptoAmount);
    const refundCrypto = Number.isFinite(storedRefundCrypto) && storedRefundCrypto > 0
      ? storedRefundCrypto.toFixed(8)
      : getTicketCryptoAmount(ticket, refundUsd, refundNetworkMode).toFixed(8);

    let transferResult = null;
    if (!refundTransactionHash) {
      try {
        transferResult = await sendTicketPayout({
          ticket,
          toAddress: normalizedRefundAddress,
          amountCrypto: refundCrypto,
          amountUsd: refundUsd,
          networkMode: refundNetworkMode,
          purpose: 'ticket_refund',
          sourceType: 'ticket',
          sourceId: ticket.ticketId,
          actor: req.user._id,
          idempotencyKey: `ticket-refund:${ticket.ticketId}:${normalizedRefundAddress}:${refundCrypto}`
        });
      } catch (error) {
        if (!error.transfer || !['manual_required', 'queued', 'pending'].includes(error.transfer.status)) {
          throw error;
        }
        transferResult = {
          txHash: error.transfer.txHash || null,
          transfer: error.transfer,
          signerStatus: error.transfer.status,
          errorCode: error.code,
          errorMessage: error.message
        };
      }
    }

    const resolvedRefundHash = refundTransactionHash || transferResult?.txHash || null;
    const transferId = transferResult?.transfer?.transferId || null;

    ticket.status = resolvedRefundHash ? 'refunded' : 'disputed';
    ticket.awaitingTransaction = false;
    ticket.refundedAt = resolvedRefundHash ? new Date() : null;
    ticket.refundedBy = req.user._id;
    ticket.refundReason = refundReason || ticket.refundReason || null;
    if (refundTargetRole === 'sender' || refundTargetRole === 'receiver') {
      ticket.refundTargetRole = refundTargetRole;
    }
    ticket.payoutAddress = normalizedRefundAddress;
    ticket.payoutNetworkMode = refundNetworkMode;
    if (resolvedRefundHash) {
      ticket.payoutTransactionHash = resolvedRefundHash;
    }

    ticket.messages.push({
      isBot: true,
      content: 'Refund Issued',
      type: 'embed',
      embedData: {
        title: 'Refund Issued',
        description: resolvedRefundHash
          ? `Refund sent to ${normalizedRefundAddress}.\n\nAmount: ${refundCrypto} ${ticket.cryptocurrency.toUpperCase()}\nTx: ${resolvedRefundHash}${refundReason ? `\n\nReason: ${refundReason}` : ''}`
          : `Refund queued to ${normalizedRefundAddress}.\n\nAmount: ${refundCrypto} ${ticket.cryptocurrency.toUpperCase()}\nTransfer ID: ${transferId || 'pending'}${refundReason ? `\n\nReason: ${refundReason}` : ''}`,
        color: 'purple'
      },
      timestamp: new Date()
    });

    await ticket.save();

    res.json({
      success: true,
      message: resolvedRefundHash ? 'Refund sent.' : 'Refund queued.',
      ticket: {
        ticketId: ticket.ticketId,
        status: ticket.status,
        refundedAt: ticket.refundedAt,
        refundAddress: normalizedRefundAddress,
        refundTransactionHash: resolvedRefundHash,
        transferId
      },
      transfer: transferResult?.transfer || null
    });
  } catch (error) {
    console.error('Admin refund ticket error:', error);
    res.status(500).json({
      success: false,
      message: error.code === 'TRANSFER_REQUIRES_APPROVAL' || error.code === 'TRANSFER_MANUAL_REQUIRED'
        ? error.message
        : 'Failed to process refund',
      transfer: error.transfer || null
    });
  }
};




