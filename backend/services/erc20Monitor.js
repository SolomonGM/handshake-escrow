// ERC-20 monitor for USDT and USDC on Ethereum (mainnet + Sepolia). Watches
// per-address Transfer events into the deposit address. Address-matched, never
// amount-matched — same anti-collision guarantee as native chains.
//
// On Sepolia testnet you need to point USDT_SEPOLIA_CONTRACT / USDC_SEPOLIA_CONTRACT
// at faucet-issued test tokens. Pre-set defaults are the most widely used
// circle/tether testnet mints. Override via env if those change.

import { ethers } from 'ethers';
import { ETH_RPC_CONFIG, ETH_NETWORK_MODE } from '../config/wallets.js';
import TradeTicket from '../models/TradeTicket.js';
import PassOrder from '../models/PassOrder.js';
import { completePassOrder } from '../controllers/passController.js';
import { upsertPassTransactionHistory } from './passTransactionHistory.js';
import { expirePassOrderIfTimedOut } from './passOrderLifecycle.js';
import { updateTicketTransactionConfirmations } from './ticketDepositLifecycle.js';

const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)'
];

const TOKEN_CONTRACTS = {
  mainnet: {
    'usdt-erc20': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    'usdc-erc20': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  },
  testnet: {
    // Common Sepolia test mints. Override if these stop being honored by faucets.
    'usdt-erc20': String(process.env.USDT_SEPOLIA_CONTRACT || '').trim() || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    'usdc-erc20': String(process.env.USDC_SEPOLIA_CONTRACT || '').trim() || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
  }
};

const DECIMALS_FALLBACK = { 'usdt-erc20': 6, 'usdc-erc20': 6 };
const SCAN_BACK_BLOCKS = 1500; // ~5 hours on Ethereum, plenty for fresh orders
const CONFIRMATIONS_REQUIRED = ETH_RPC_CONFIG[ETH_NETWORK_MODE]?.confirmationsRequired ?? 2;
// 2% slippage tolerance — same as the native ETH + UTXO monitors so price
// fluctuations between order creation and settlement don't bounce a
// near-correct deposit into manual review.
const PAYMENT_SLIPPAGE_TOLERANCE = 0.02;
const isWithinSlippage = (received, expected) => {
  if (!Number.isFinite(received) || !Number.isFinite(expected) || expected <= 0) {
    return false;
  }
  return received >= expected - expected * PAYMENT_SLIPPAGE_TOLERANCE;
};
const buildEtherscanTxUrl = (txHash) => {
  const explorer = ETH_RPC_CONFIG[ETH_NETWORK_MODE]?.blockExplorer || 'https://etherscan.io';
  return `${explorer.replace(/\/$/, '')}/tx/${txHash}`;
};

let cachedProvider = null;
const getProvider = () => {
  if (cachedProvider) return cachedProvider;
  const rpcUrl = ETH_RPC_CONFIG[ETH_NETWORK_MODE]?.rpcUrl;
  if (!rpcUrl) {
    throw new Error(`No ETH RPC URL configured for ${ETH_NETWORK_MODE}`);
  }
  cachedProvider = new ethers.JsonRpcProvider(rpcUrl);
  return cachedProvider;
};

const cachedContracts = new Map();
const cachedDecimals = new Map();

const getContract = (currency) => {
  if (cachedContracts.has(currency)) return cachedContracts.get(currency);
  const address = TOKEN_CONTRACTS[ETH_NETWORK_MODE]?.[currency];
  if (!address) return null;
  const contract = new ethers.Contract(address, ERC20_ABI, getProvider());
  cachedContracts.set(currency, contract);
  return contract;
};

const getDecimals = async (currency) => {
  if (cachedDecimals.has(currency)) return cachedDecimals.get(currency);
  const contract = getContract(currency);
  if (!contract) return DECIMALS_FALLBACK[currency] ?? 6;
  try {
    const d = await contract.decimals();
    const value = Number(d);
    cachedDecimals.set(currency, value);
    return value;
  } catch (error) {
    cachedDecimals.set(currency, DECIMALS_FALLBACK[currency] ?? 6);
    return cachedDecimals.get(currency);
  }
};

const scanErc20Deposit = async ({ currency, depositAddress, expectedAmount }) => {
  const contract = getContract(currency);
  if (!contract) {
    return { skipped: true, reason: 'contract_not_configured' };
  }

  const provider = getProvider();
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - SCAN_BACK_BLOCKS);

  const filter = contract.filters.Transfer(null, depositAddress);
  const events = await contract.queryFilter(filter, fromBlock, latest);
  if (!events || events.length === 0) return null;

  const decimals = await getDecimals(currency);

  for (const event of events) {
    const value = event.args?.value ?? event.args?.[2];
    if (!value) continue;
    const received = Number(ethers.formatUnits(value, decimals));
    if (!isWithinSlippage(received, expectedAmount)) continue;

    const txHash = event.transactionHash;
    const blockNumber = event.blockNumber;
    const confirmations = Math.max(0, latest - blockNumber);

    return {
      txHash,
      blockNumber,
      confirmations,
      tokenAmount: received,
      tokenAmountRaw: value.toString(),
      decimals,
      from: event.args?.from || null,
      contractAddress: contract.target,
      explorerUrl: buildEtherscanTxUrl(txHash)
    };
  }

  return null;
};

const persistOrderConfirmation = async (order, hit) => {
  order.transactionHash = hit.txHash;
  order.confirmations = hit.confirmations;
  order.status = hit.confirmations >= CONFIRMATIONS_REQUIRED ? 'confirmed' : 'pending';
  order.transactionDetails = {
    ...(order.transactionDetails || {}),
    detectedAt: order.transactionDetails?.detectedAt || new Date(),
    actualAmountReceived: hit.tokenAmountRaw,
    actualAmountReceivedCrypto: hit.tokenAmount,
    expectedAmount: order.cryptoAmount,
    fromAddress: hit.from,
    blockHeight: hit.blockNumber,
    paymentNotes: `${order.cryptocurrency} via ${hit.contractAddress} - ${hit.explorerUrl}`
  };
  await order.save();

  if (hit.confirmations >= CONFIRMATIONS_REQUIRED) {
    await completePassOrder(order.orderId);
    await upsertPassTransactionHistory(order);
  }
};

export const monitorErc20PassOrder = async (orderId, io) => {
  const order = await PassOrder.findOne({ orderId });
  if (!order) return;
  if (await expirePassOrderIfTimedOut(order, io)) return;
  if (!order.paymentAddress) return;

  const currency = String(order.cryptocurrency || '').toLowerCase();
  if (currency !== 'usdt-erc20' && currency !== 'usdc-erc20') return;

  try {
    const hit = await scanErc20Deposit({
      currency,
      depositAddress: order.paymentAddress,
      expectedAmount: Number(order.cryptoAmount)
    });
    if (!hit || hit.skipped) return;

    await persistOrderConfirmation(order, hit);
    if (io) {
      io.emit(`pass_order_update:${orderId}`, {
        orderId,
        status: order.status,
        transactionHash: hit.txHash,
        confirmations: hit.confirmations
      });
    }
  } catch (error) {
    console.error(`[erc20-monitor] order ${orderId} (${currency}) error: ${error.message}`);
  }
};

export const monitorErc20Ticket = async (ticketId) => {
  const ticket = await TradeTicket.findOne({ ticketId })
    .populate('creator', 'username userId avatar')
    .populate('participants.user', 'username userId avatar');
  if (!ticket) return;
  if (ticket.depositChain !== 'ethereum') return;
  const currency = String(ticket.cryptocurrency || '').toLowerCase();
  if (currency !== 'usdt-erc20' && currency !== 'usdc-erc20') return;
  if (!ticket.awaitingTransaction || ticket.transactionConfirmed) return;
  if (!ticket.depositAddress) return;

  try {
    const hit = await scanErc20Deposit({
      currency,
      depositAddress: ticket.depositAddress,
      expectedAmount: Number(ticket.expectedCryptoAmount || 0)
    });
    if (!hit || hit.skipped) return;

    await updateTicketTransactionConfirmations(
      ticket,
      hit.txHash,
      hit.confirmations,
      CONFIRMATIONS_REQUIRED
    );
  } catch (error) {
    console.error(`[erc20-monitor] ticket ${ticketId} (${currency}) error: ${error.message}`);
  }
};

export const getErc20MonitorStatus = () => ({
  network: ETH_NETWORK_MODE,
  contracts: TOKEN_CONTRACTS[ETH_NETWORK_MODE] || {}
});
