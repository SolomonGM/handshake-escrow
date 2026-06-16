// Solana monitor for native SOL + SPL tokens (USDT-SPL, USDC-SPL). Per-address
// scanning, matches by destination — never by amount — so multiple concurrent
// deposits cannot collide.
//
// Watches:
//   - Pass orders with cryptocurrency in { 'solana', 'usdt-spl', 'usdc-spl' }
//   - Trade tickets with depositChain === 'solana' and awaitingTransaction = true
//
// RPC: defaults to the public Solana devnet/mainnet endpoint. For production
// volume swap SOL_RPC_URL to a Helius/QuickNode/Triton URL. The public endpoint
// is rate-limited and will drop requests under load.

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import TradeTicket from '../models/TradeTicket.js';
import PassOrder from '../models/PassOrder.js';
import { completePassOrder } from '../controllers/passController.js';
import { upsertPassTransactionHistory } from './passTransactionHistory.js';
import { expirePassOrderIfTimedOut } from './passOrderLifecycle.js';
import { updateTicketTransactionConfirmations } from './ticketDepositLifecycle.js';

const SOL_NETWORK_MODE = (String(process.env.HD_SOL_NETWORK || 'devnet').trim().toLowerCase() === 'mainnet')
  ? 'mainnet'
  : 'devnet';

const SOL_RPC_URL = String(process.env.SOL_RPC_URL || '').trim() || (
  SOL_NETWORK_MODE === 'mainnet'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com'
);

// SPL token mint addresses. Mainnet uses the canonical issuer mints. Devnet
// uses test mints — see README.solana-devnet-mints for how to obtain them
// from a faucet. For now, set these via env if you want SPL on devnet.
const SPL_MINTS = {
  mainnet: {
    'usdt-spl': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    'usdc-spl': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  devnet: {
    'usdt-spl': String(process.env.SOL_DEVNET_USDT_MINT || '').trim() || null,
    'usdc-spl': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
  }
};

const SOL_CONFIRMATIONS_REQUIRED = 1;
const SOL_SIGNATURE_FETCH_LIMIT = 25;
const SOL_LAMPORT_DUST = 1_000n; // ignore <0.000001 SOL deposits as dust
// Match the 2% slippage tolerance the BTC/LTC/ETH monitors use so that price
// movements between order creation and on-chain settlement don't bounce a
// near-correct deposit into manual-review.
const PAYMENT_SLIPPAGE_TOLERANCE = 0.02;
const SOLSCAN_URL_BY_MODE = {
  mainnet: 'https://solscan.io/tx',
  devnet: 'https://solscan.io/tx',
  testnet: 'https://solscan.io/tx'
};
const buildSolscanUrl = (signature) => {
  const base = SOLSCAN_URL_BY_MODE[SOL_NETWORK_MODE] || SOLSCAN_URL_BY_MODE.mainnet;
  const query = SOL_NETWORK_MODE === 'mainnet' ? '' : `?cluster=${SOL_NETWORK_MODE}`;
  return `${base}/${signature}${query}`;
};
const isWithinSlippage = (received, expected) => {
  if (!Number.isFinite(received) || !Number.isFinite(expected) || expected <= 0) {
    return false;
  }
  const tolerance = expected * PAYMENT_SLIPPAGE_TOLERANCE;
  return received >= expected - tolerance;
};

let cachedConnection = null;
const getConnection = () => {
  if (!cachedConnection) {
    cachedConnection = new Connection(SOL_RPC_URL, 'confirmed');
  }
  return cachedConnection;
};

const getSplMint = (currency) => {
  const mint = SPL_MINTS[SOL_NETWORK_MODE]?.[currency];
  if (!mint) {
    return null;
  }
  try {
    return new PublicKey(mint);
  } catch (error) {
    console.warn(`[solana-monitor] Invalid mint for ${currency}: ${mint}`);
    return null;
  }
};

// ============================================================================
// Native SOL — match by lamports delta into the deposit address.
// ============================================================================

const scanNativeSolDeposit = async ({ depositAddress, expectedSol }) => {
  const connection = getConnection();
  const pubkey = new PublicKey(depositAddress);

  const signatures = await connection.getSignaturesForAddress(pubkey, {
    limit: SOL_SIGNATURE_FETCH_LIMIT
  });
  if (!signatures || signatures.length === 0) {
    return null;
  }

  for (const sigInfo of signatures) {
    if (sigInfo.err) continue;
    const tx = await connection.getTransaction(sigInfo.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    if (!tx || !tx.meta) continue;

    const accountKeys = tx.transaction.message.staticAccountKeys
      || tx.transaction.message.accountKeys;
    const accountIndex = accountKeys.findIndex((key) => key.equals(pubkey));
    if (accountIndex === -1) continue;

    const preBalance = BigInt(tx.meta.preBalances[accountIndex] || 0);
    const postBalance = BigInt(tx.meta.postBalances[accountIndex] || 0);
    const delta = postBalance - preBalance;
    if (delta <= SOL_LAMPORT_DUST) continue;

    const receivedSol = Number(delta) / LAMPORTS_PER_SOL;
    if (!isWithinSlippage(receivedSol, expectedSol)) {
      // Underpaid beyond the 2% slippage window — skip and let admin reconcile.
      continue;
    }

    return {
      signature: sigInfo.signature,
      slot: sigInfo.slot,
      blockTime: sigInfo.blockTime,
      lamportsReceived: delta.toString(),
      solReceived: receivedSol,
      explorerUrl: buildSolscanUrl(sigInfo.signature),
      confirmations: sigInfo.confirmationStatus === 'finalized' ? 32 : (sigInfo.confirmationStatus === 'confirmed' ? 1 : 0)
    };
  }

  return null;
};

// ============================================================================
// SPL token — match by token balance delta on the deposit address' ATA.
// ============================================================================

const scanSplDeposit = async ({ depositAddress, currency, expectedAmount }) => {
  const mint = getSplMint(currency);
  if (!mint) {
    return { skipped: true, reason: 'mint_not_configured' };
  }

  const connection = getConnection();
  const owner = new PublicKey(depositAddress);
  const ata = await getAssociatedTokenAddress(mint, owner);

  const signatures = await connection.getSignaturesForAddress(ata, {
    limit: SOL_SIGNATURE_FETCH_LIMIT
  });
  if (!signatures || signatures.length === 0) {
    return null;
  }

  for (const sigInfo of signatures) {
    if (sigInfo.err) continue;
    const tx = await connection.getTransaction(sigInfo.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    if (!tx || !tx.meta) continue;

    const preTokenBalances = tx.meta.preTokenBalances || [];
    const postTokenBalances = tx.meta.postTokenBalances || [];
    const ownerBase58 = owner.toBase58();
    const mintBase58 = mint.toBase58();

    const findBalanceFor = (entries) => entries.find(
      (entry) => entry.owner === ownerBase58 && entry.mint === mintBase58
    );

    const pre = findBalanceFor(preTokenBalances);
    const post = findBalanceFor(postTokenBalances);
    if (!post) continue;

    const preAmount = BigInt(pre?.uiTokenAmount?.amount || 0);
    const postAmount = BigInt(post.uiTokenAmount?.amount || 0);
    const delta = postAmount - preAmount;
    if (delta <= 0n) continue;

    const decimals = post.uiTokenAmount?.decimals ?? 6;
    const received = Number(delta) / 10 ** decimals;
    // Stablecoins typically don't move much, but the 2% slippage keeps the
    // behaviour consistent across all chains and absorbs minor rounding /
    // bridge-fee variance.
    if (!isWithinSlippage(received, expectedAmount)) {
      continue;
    }

    return {
      signature: sigInfo.signature,
      slot: sigInfo.slot,
      blockTime: sigInfo.blockTime,
      tokenAmountRaw: delta.toString(),
      tokenAmount: received,
      decimals,
      explorerUrl: buildSolscanUrl(sigInfo.signature),
      confirmations: sigInfo.confirmationStatus === 'finalized' ? 32 : (sigInfo.confirmationStatus === 'confirmed' ? 1 : 0)
    };
  }

  return null;
};

// ============================================================================
// Order monitor entry point — used by the existing cron loop.
// ============================================================================

const persistOrderConfirmation = async (order, hit) => {
  order.transactionHash = hit.signature;
  order.confirmations = hit.confirmations;
  order.status = 'confirmed';
  order.transactionDetails = {
    ...(order.transactionDetails || {}),
    detectedAt: order.transactionDetails?.detectedAt || new Date(),
    actualAmountReceived: hit.lamportsReceived || hit.tokenAmountRaw,
    actualAmountReceivedCrypto: hit.solReceived || hit.tokenAmount,
    expectedAmount: order.cryptoAmount,
    paymentNotes: `Solana ${SOL_NETWORK_MODE} - ${hit.explorerUrl || hit.signature}`
  };
  await order.save();

  if (hit.confirmations >= SOL_CONFIRMATIONS_REQUIRED) {
    await completePassOrder(order.orderId);
    await upsertPassTransactionHistory(order);
  }
};

export const monitorSolanaPassOrder = async (orderId, io) => {
  const order = await PassOrder.findOne({ orderId });
  if (!order) return;

  // 10-min no-detection timeout (passes only).
  if (await expirePassOrderIfTimedOut(order, io)) return;
  if (!order.paymentAddress) return;

  const currency = String(order.cryptocurrency || '').toLowerCase();
  try {
    const hit = currency === 'solana'
      ? await scanNativeSolDeposit({
          depositAddress: order.paymentAddress,
          expectedSol: Number(order.cryptoAmount)
        })
      : await scanSplDeposit({
          depositAddress: order.paymentAddress,
          currency,
          expectedAmount: Number(order.cryptoAmount)
        });

    if (!hit || hit.skipped) return;

    await persistOrderConfirmation(order, hit);

    if (io) {
      io.emit(`pass_order_update:${orderId}`, {
        orderId,
        status: order.status,
        transactionHash: hit.signature,
        confirmations: hit.confirmations
      });
    }
  } catch (error) {
    console.error(`[solana-monitor] order ${orderId} (${currency}) error: ${error.message}`);
  }
};

export const monitorSolanaTicket = async (ticketId) => {
  const ticket = await TradeTicket.findOne({ ticketId })
    .populate('creator', 'username userId avatar')
    .populate('participants.user', 'username userId avatar');
  if (!ticket) return;
  if (ticket.depositChain !== 'solana') return;
  if (!ticket.awaitingTransaction || ticket.transactionConfirmed) return;
  if (!ticket.depositAddress) return;

  const currency = String(ticket.cryptocurrency || '').toLowerCase();
  try {
    const hit = currency === 'solana'
      ? await scanNativeSolDeposit({
          depositAddress: ticket.depositAddress,
          expectedSol: Number(ticket.expectedCryptoAmount || 0)
        })
      : await scanSplDeposit({
          depositAddress: ticket.depositAddress,
          currency,
          expectedAmount: Number(ticket.expectedCryptoAmount || 0)
        });

    if (!hit || hit.skipped) return;

    await updateTicketTransactionConfirmations(
      ticket,
      hit.signature,
      hit.confirmations,
      SOL_CONFIRMATIONS_REQUIRED
    );
  } catch (error) {
    console.error(`[solana-monitor] ticket ${ticketId} (${currency}) error: ${error.message}`);
  }
};

export const getSolanaMonitorStatus = () => ({
  network: SOL_NETWORK_MODE,
  rpc: SOL_RPC_URL,
  splMintsConfigured: Object.entries(SPL_MINTS[SOL_NETWORK_MODE] || {})
    .reduce((acc, [token, mint]) => ({ ...acc, [token]: Boolean(mint) }), {})
});
