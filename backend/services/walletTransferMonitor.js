import axios from 'axios';
import cron from 'node-cron';
import { ethers } from 'ethers';
import { Connection } from '@solana/web3.js';
import PassOrder from '../models/PassOrder.js';
import TradeTicket from '../models/TradeTicket.js';
import WalletTransfer from '../models/WalletTransfer.js';
import { ETH_RPC_CONFIG, UTXO_NETWORKS } from '../config/wallets.js';
import { upsertPassTransactionHistory } from './passTransactionHistory.js';

const BLOCKCYPHER_TOKEN = String(process.env.BLOCKCYPHER_TOKEN || '').trim();
const SOL_RPC_URL = String(process.env.SOL_RPC_URL || '').trim();
const TRANSFER_CONFIRMATION_CRON = process.env.WALLET_TRANSFER_CONFIRMATION_CRON || '*/30 * * * * *';
const TRANSFER_MONITOR_BATCH_SIZE = Math.max(1, Number(process.env.WALLET_TRANSFER_MONITOR_BATCH_SIZE || 50));

const withBlockCypherToken = (url) => (
  BLOCKCYPHER_TOKEN
    ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(BLOCKCYPHER_TOKEN)}`
    : url
);

const getUtxoNetwork = (coin, networkMode) => {
  const networks = UTXO_NETWORKS[String(coin || '').toLowerCase()] || {};
  return networks[networkMode] || networks.mainnet || networks.testnet || null;
};

const getEthProvider = (networkMode) => {
  const config = ETH_RPC_CONFIG[networkMode] || ETH_RPC_CONFIG.mainnet;
  if (!config?.rpcUrl) {
    return null;
  }
  return new ethers.JsonRpcProvider(config.rpcUrl);
};

const getSolanaConnection = (networkMode) => {
  const fallback = networkMode === 'mainnet'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
  return new Connection(SOL_RPC_URL || fallback, 'confirmed');
};

const getRequiredConfirmations = (transfer) => {
  const network = String(transfer.confirmationNetwork || '').toLowerCase();
  if (network === 'bitcoin' || network === 'litecoin') {
    return getUtxoNetwork(network, transfer.networkMode)?.confirmationsRequired || 2;
  }
  if (network === 'ethereum') {
    const config = ETH_RPC_CONFIG[transfer.networkMode] || ETH_RPC_CONFIG.mainnet;
    return config?.confirmationsRequired || 2;
  }
  if (network === 'solana') {
    return 1;
  }
  return null;
};

const readUtxoConfirmations = async (transfer) => {
  const network = getUtxoNetwork(transfer.confirmationNetwork, transfer.networkMode);
  if (!network?.apiBase) {
    return null;
  }

  const url = withBlockCypherToken(`${network.apiBase}/txs/${encodeURIComponent(transfer.txHash)}`);
  const { data } = await axios.get(url, { timeout: 10_000 });
  return Math.max(0, Number(data?.confirmations || 0));
};

const readEthereumConfirmations = async (transfer) => {
  const provider = getEthProvider(transfer.networkMode);
  if (!provider) {
    return null;
  }

  const receipt = await provider.getTransactionReceipt(transfer.txHash);
  if (!receipt?.blockNumber || receipt.status !== 1) {
    return 0;
  }

  const currentBlock = await provider.getBlockNumber();
  return Math.max(0, currentBlock - receipt.blockNumber + 1);
};

const readSolanaConfirmations = async (transfer) => {
  const connection = getSolanaConnection(transfer.networkMode);
  const result = await connection.getSignatureStatuses([transfer.txHash], {
    searchTransactionHistory: true
  });
  const status = result?.value?.[0];
  if (!status || status.err) {
    return 0;
  }
  if (status.confirmationStatus === 'finalized') {
    return 32;
  }
  if (status.confirmationStatus === 'confirmed') {
    return 1;
  }
  return Number(status.confirmations || 0);
};

const readConfirmations = async (transfer) => {
  const network = String(transfer.confirmationNetwork || '').toLowerCase();
  if (network === 'bitcoin' || network === 'litecoin') {
    return readUtxoConfirmations(transfer);
  }
  if (network === 'ethereum') {
    return readEthereumConfirmations(transfer);
  }
  if (network === 'solana') {
    return readSolanaConfirmations(transfer);
  }
  return null;
};

const findTicketReceiverName = async (ticket) => {
  await ticket.populate('creator', 'username');
  await ticket.populate('participants.user', 'username');

  if (ticket.creatorRole === 'receiver') {
    return ticket.creator?.username || 'Receiver';
  }

  const receiverParticipant = ticket.participants?.find((participant) => participant.role === 'receiver');
  const acceptedParticipant = ticket.participants?.find((participant) => participant.status === 'accepted');
  return receiverParticipant?.user?.username || acceptedParticipant?.user?.username || 'Receiver';
};

const addTicketPrivacyPrompt = (ticket) => {
  const hasPrivacyPrompt = ticket.messages?.some(
    (message) => message.embedData?.actionType === 'privacy-selection'
  );
  if (hasPrivacyPrompt) {
    return;
  }

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
  ticket.privacyPromptShownAt = ticket.privacyPromptShownAt || new Date();
};

const reconcileTicketPayout = async (transfer) => {
  const ticket = await TradeTicket.findOne({ ticketId: transfer.sourceId });
  if (!ticket) {
    return;
  }

  const receiverName = await findTicketReceiverName(ticket);
  ticket.messages = (ticket.messages || []).filter(
    (message) => message.embedData?.actionType !== 'payout-confirming'
  );
  ticket.fundsReleased = true;
  ticket.transactionCompletedAt = ticket.transactionCompletedAt || transfer.completedAt || new Date();
  ticket.status = ['completed', 'closing'].includes(ticket.status) ? ticket.status : 'awaiting-close';
  ticket.payoutTransactionHash = ticket.payoutTransactionHash || transfer.txHash;

  const hasCompleteMessage = ticket.messages.some(
    (message) => message.embedData?.title === 'Complete'
  );
  if (!hasCompleteMessage) {
    ticket.messages.push({
      isBot: true,
      content: 'Complete',
      type: 'embed',
      embedData: {
        title: 'Complete',
        description: `@${receiverName} has received their funds.\n\nThank you for using Handshake!`,
        color: 'blurple'
      },
      timestamp: new Date()
    });
  }

  addTicketPrivacyPrompt(ticket);
  await ticket.save();
};

const reconcileTicketRefund = async (transfer) => {
  const ticket = await TradeTicket.findOne({ ticketId: transfer.sourceId });
  if (!ticket) {
    return;
  }

  ticket.status = 'refunded';
  ticket.awaitingTransaction = false;
  ticket.refundedAt = ticket.refundedAt || transfer.completedAt || new Date();
  ticket.payoutTransactionHash = ticket.payoutTransactionHash || transfer.txHash;

  const hasConfirmedMessage = ticket.messages?.some(
    (message) => message.embedData?.actionType === 'refund-confirmed'
  );
  if (!hasConfirmedMessage) {
    ticket.messages.push({
      isBot: true,
      content: 'Refund Confirmed',
      type: 'embed',
      embedData: {
        title: 'Refund Confirmed',
        description: `Refund transaction confirmed on-chain.\n\nTx: ${transfer.txHash}`,
        color: 'purple',
        actionType: 'refund-confirmed'
      },
      timestamp: new Date()
    });
  }

  await ticket.save();
};

const reconcilePassRefund = async (transfer) => {
  const order = await PassOrder.findOne({ orderId: transfer.sourceId });
  if (!order) {
    return;
  }

  order.status = 'refunded';
  order.refundedAt = order.refundedAt || transfer.completedAt || new Date();
  order.refundTransactionHash = order.refundTransactionHash || transfer.txHash;

  order.adminActions = order.adminActions || [];
  const hasConfirmedAction = order.adminActions.some(
    (action) => action.action === 'refund' && action.metadata?.walletTransferConfirmedAt
  );
  if (!hasConfirmedAction) {
    order.adminActions.push({
      action: 'refund',
      details: 'Refund transaction confirmed on-chain.',
      metadata: {
        transferId: transfer.transferId,
        refundTransactionHash: transfer.txHash,
        walletTransferConfirmedAt: new Date()
      }
    });
  }

  await order.save();
  await upsertPassTransactionHistory(order, 'refunded');
};

const reconcileConfirmedTransfer = async (transfer) => {
  if (transfer.sourceType === 'ticket' && transfer.purpose === 'ticket_payout') {
    await reconcileTicketPayout(transfer);
    return;
  }
  if (transfer.sourceType === 'ticket' && transfer.purpose === 'ticket_refund') {
    await reconcileTicketRefund(transfer);
    return;
  }
  if (transfer.sourceType === 'pass-order' && transfer.purpose === 'pass_refund') {
    await reconcilePassRefund(transfer);
  }
};

export const refreshWalletTransferConfirmation = async (transfer) => {
  if (!transfer?.txHash || transfer.status !== 'broadcasted') {
    return transfer;
  }

  const requiredConfirmations = getRequiredConfirmations(transfer);
  if (!requiredConfirmations) {
    transfer.requiredConfirmations = requiredConfirmations;
    transfer.lastConfirmationCheckAt = new Date();
    await transfer.save();
    return transfer;
  }

  const confirmations = await readConfirmations(transfer);
  if (confirmations === null) {
    transfer.requiredConfirmations = requiredConfirmations;
    transfer.lastConfirmationCheckAt = new Date();
    await transfer.save();
    return transfer;
  }

  transfer.confirmations = confirmations;
  transfer.requiredConfirmations = requiredConfirmations;
  transfer.lastConfirmationCheckAt = new Date();

  if (confirmations >= requiredConfirmations) {
    transfer.status = 'confirmed';
    transfer.completedAt = transfer.completedAt || new Date();
  }

  await transfer.save();
  if (transfer.status === 'confirmed') {
    await reconcileConfirmedTransfer(transfer);
  }
  return transfer;
};

export const monitorWalletTransfersOnce = async () => {
  const transfers = await WalletTransfer.find({
    status: 'broadcasted',
    txHash: { $nin: [null, ''] },
    confirmationNetwork: { $in: ['bitcoin', 'litecoin', 'ethereum', 'solana'] }
  })
    .sort({ broadcastedAt: 1, createdAt: 1 })
    .limit(TRANSFER_MONITOR_BATCH_SIZE);

  for (const transfer of transfers) {
    try {
      await refreshWalletTransferConfirmation(transfer);
    } catch (error) {
      transfer.lastConfirmationCheckAt = new Date();
      transfer.errorCode = transfer.errorCode || 'CONFIRMATION_CHECK_FAILED';
      transfer.errorMessage = error.message;
      await transfer.save();
      console.error(`Wallet transfer confirmation check failed for ${transfer.transferId}:`, error.message);
    }
  }

  return transfers.length;
};

export const startWalletTransferMonitor = () => {
  console.log(`Wallet transfer confirmation monitor scheduled: ${TRANSFER_CONFIRMATION_CRON}`);
  return cron.schedule(TRANSFER_CONFIRMATION_CRON, async () => {
    await monitorWalletTransfersOnce();
  });
};
