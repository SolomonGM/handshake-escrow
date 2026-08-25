import { ethers } from 'ethers';
import crypto from 'crypto';
import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint
} from '@solana/spl-token';
import { ETH_RPC_CONFIG } from '../config/wallets.js';
import {
  deriveEthereumWallet,
  deriveSolanaKeypair,
  deriveUtxoSigner
} from './hdWalletService.js';
import WalletTransfer from '../models/WalletTransfer.js';
import { buildSignerAuthHeaders } from '../utils/signerAuth.js';

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 value) returns (bool)'
];

const TOKEN_CONTRACTS = {
  mainnet: {
    'usdt-erc20': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    'usdc-erc20': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  },
  testnet: {
    'usdt-erc20': String(process.env.USDT_SEPOLIA_CONTRACT || '').trim() || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    'usdc-erc20': String(process.env.USDC_SEPOLIA_CONTRACT || '').trim() || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
  }
};

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

const SOL_RPC_URL = String(process.env.SOL_RPC_URL || '').trim();
const BLOCKCYPHER_TOKEN = String(process.env.BLOCKCYPHER_TOKEN || '').trim();
const UTXO_FEE_SATS_PER_VBYTE = Math.max(1, Number(process.env.UTXO_FEE_SATS_PER_VBYTE || 12));
const UTXO_DUST_SATS = 546n;
const MIN_SPL_GAS_LAMPORTS = BigInt(Math.max(5000, Number(process.env.MIN_SPL_GAS_LAMPORTS || 10_000_000)));
const ETH_GAS_BUFFER_WEI = ethers.parseEther(String(process.env.ETH_GAS_BUFFER_ETH || '0.00015'));
const ETH_FALLBACK_GAS_PRICE_WEI = ethers.parseUnits(String(process.env.ETH_FALLBACK_GAS_PRICE_GWEI || '20'), 'gwei');
const SOL_GAS_BUFFER_LAMPORTS = BigInt(Math.max(5000, Number(process.env.SOL_GAS_BUFFER_LAMPORTS || 10_000_000)));

const UTXO_API = {
  bitcoin: {
    mainnet: 'https://api.blockcypher.com/v1/btc/main',
    testnet: 'https://api.blockcypher.com/v1/btc/test3'
  },
  litecoin: {
    mainnet: 'https://api.blockcypher.com/v1/ltc/main'
  }
};

const TRANSFER_LIMITS_USD = {
  ticket_payout: Number(process.env.MAX_TICKET_PAYOUT_USD || 2500),
  ticket_refund: Number(process.env.MAX_TICKET_REFUND_USD || 2500),
  pass_refund: Number(process.env.MAX_PASS_REFUND_USD || 500)
};

const getSignerMode = () => {
  const configured = String(process.env.WALLET_SIGNER_MODE || '').trim().toLowerCase();
  if (['external', 'local', 'manual', 'disabled'].includes(configured)) {
    return configured;
  }
  return process.env.NODE_ENV === 'production' ? 'external' : 'local';
};

const isLocalSigningAllowed = () => (
  String(process.env.ALLOW_APP_PROCESS_SIGNING || '').trim().toLowerCase() === 'true'
  || process.env.NODE_ENV !== 'production'
);

const isTokenDepositAddressPayoutAllowed = () => (
  String(process.env.ALLOW_TOKEN_DEPOSIT_ADDRESS_PAYOUTS || '').trim().toLowerCase() === 'true'
  || process.env.NODE_ENV !== 'production'
);

const isAutoFundDepositGasAllowed = () => (
  String(process.env.AUTO_FUND_DEPOSIT_GAS || '').trim().toLowerCase() === 'true'
);

const generateTransferId = () => `WTR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const buildDefaultIdempotencyKey = ({ purpose, sourceType, sourceId, toAddress, amountCrypto }) => (
  [purpose, sourceType, sourceId, toAddress, amountCrypto].map((part) => String(part || '').trim()).join(':')
);

const getPolicyDecision = ({ purpose, amountUsd }) => {
  const numericUsd = Number(amountUsd);
  const maxUsd = TRANSFER_LIMITS_USD[purpose] || 0;
  const requiresApproval = Number.isFinite(numericUsd)
    && numericUsd > 0
    && Number.isFinite(maxUsd)
    && maxUsd > 0
    && numericUsd > maxUsd;

  return {
    maxUsd,
    requiresApproval,
    checkedAt: new Date().toISOString()
  };
};

const normalizeTransferError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const getEthProvider = (networkMode = 'mainnet') => {
  const config = ETH_RPC_CONFIG[networkMode] || ETH_RPC_CONFIG.mainnet;
  if (!config?.rpcUrl) {
    throw new Error(`Ethereum RPC URL is not configured for ${networkMode}`);
  }
  return new ethers.JsonRpcProvider(config.rpcUrl);
};

const getSolanaConnection = (networkMode = 'devnet') => {
  const fallback = networkMode === 'mainnet'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
  return new Connection(SOL_RPC_URL || fallback, 'confirmed');
};

const getTreasuryEthWallet = (provider) => {
  const privateKey = String(process.env.TREASURY_ETH_PRIVATE_KEY || '').trim();
  if (!privateKey) {
    throw normalizeTransferError('TREASURY_ETH_PRIVATE_KEY is required to auto-fund ETH gas.', 'TREASURY_GAS_UNCONFIGURED');
  }
  return new ethers.Wallet(privateKey, provider);
};

const getTreasurySolanaKeypair = () => {
  const secret = String(process.env.TREASURY_SOL_PRIVATE_KEY || '').trim();
  if (!secret) {
    throw normalizeTransferError('TREASURY_SOL_PRIVATE_KEY is required to auto-fund SOL gas.', 'TREASURY_GAS_UNCONFIGURED');
  }

  try {
    if (secret.startsWith('[')) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
    }
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch (error) {
    throw normalizeTransferError(`Invalid TREASURY_SOL_PRIVATE_KEY: ${error.message}`, 'TREASURY_GAS_UNCONFIGURED');
  }
};

const ensureEthereumGas = async ({ provider, address, requiredWei }) => {
  if (requiredWei <= 0n) {
    return null;
  }

  const balance = await provider.getBalance(address);
  if (balance >= requiredWei) {
    return null;
  }
  if (!isAutoFundDepositGasAllowed()) {
    throw normalizeTransferError(
      'Deposit wallet needs ETH gas. Configure AUTO_FUND_DEPOSIT_GAS=true with TREASURY_ETH_PRIVATE_KEY, or process manually.',
      'DEPOSIT_GAS_REQUIRED'
    );
  }

  const treasury = getTreasuryEthWallet(provider);
  const topUpValue = requiredWei - balance + ETH_GAS_BUFFER_WEI;
  const tx = await treasury.sendTransaction({ to: address, value: topUpValue });
  await tx.wait(1);
  return {
    txHash: tx.hash,
    amountWei: topUpValue.toString(),
    fundedAddress: address
  };
};

const ensureSolanaGas = async ({ connection, publicKey, requiredLamports }) => {
  if (requiredLamports <= 0n) {
    return null;
  }

  const balance = BigInt(await connection.getBalance(publicKey, 'confirmed'));
  if (balance >= requiredLamports) {
    return null;
  }
  if (!isAutoFundDepositGasAllowed()) {
    throw normalizeTransferError(
      'Deposit wallet needs SOL gas. Configure AUTO_FUND_DEPOSIT_GAS=true with TREASURY_SOL_PRIVATE_KEY, or process manually.',
      'DEPOSIT_GAS_REQUIRED'
    );
  }

  const treasury = getTreasurySolanaKeypair();
  const topUpLamports = requiredLamports - balance + SOL_GAS_BUFFER_LAMPORTS;
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: publicKey,
      lamports: Number(topUpLamports)
    })
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [treasury], {
    commitment: 'confirmed'
  });
  return {
    txHash: signature,
    amountLamports: topUpLamports.toString(),
    fundedAddress: publicKey.toBase58()
  };
};

const requireDepositIndex = (ticket) => {
  const index = Number(ticket?.depositIndex);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Ticket deposit index is missing; automatic payout cannot sign from the deposit wallet.');
  }
  return index;
};

const parseDecimalUnits = (amount, decimals) => {
  const normalized = String(amount || '0').trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Invalid payout amount');
  }

  const [whole, fraction = ''] = normalized.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(paddedFraction || '0');
};

const sendEthereumNativePayout = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const provider = getEthProvider(networkMode);
  const wallet = deriveEthereumWallet(requireDepositIndex(ticket), provider);
  const value = ethers.parseEther(String(amountCrypto));
  const txRequest = { to: toAddress, value };
  const feeData = await provider.getFeeData();

  if (feeData?.maxFeePerGas && feeData?.maxPriorityFeePerGas) {
    txRequest.maxFeePerGas = feeData.maxFeePerGas;
    txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData?.gasPrice) {
    txRequest.gasPrice = feeData.gasPrice;
  } else {
    txRequest.gasPrice = ETH_FALLBACK_GAS_PRICE_WEI;
  }

  txRequest.gasLimit = await wallet.estimateGas(txRequest).catch(() => 21000n);
  const gasPrice = txRequest.maxFeePerGas || txRequest.gasPrice || ETH_FALLBACK_GAS_PRICE_WEI;
  const gasRequired = gasPrice > 0n ? txRequest.gasLimit * gasPrice : 0n;
  const balance = await provider.getBalance(wallet.address);
  if (balance < value) {
    throw normalizeTransferError('Escrow deposit wallet does not contain enough ETH principal for payout.', 'ESCROW_BALANCE_INSUFFICIENT');
  }
  const gasFunding = await ensureEthereumGas({
    provider,
    address: wallet.address,
    requiredWei: value + gasRequired
  });

  const tx = await wallet.sendTransaction(txRequest);
  return { txHash: tx.hash, amountCrypto, unit: 'ETH', confirmationNetwork: 'ethereum', gasFunding };
};

const sendErc20Payout = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const contractAddress = TOKEN_CONTRACTS[networkMode]?.[ticket.cryptocurrency];
  if (!contractAddress) {
    throw new Error(`${ticket.cryptocurrency.toUpperCase()} contract is not configured for ${networkMode}`);
  }

  const provider = getEthProvider(networkMode);
  const wallet = deriveEthereumWallet(requireDepositIndex(ticket), provider);
  const contract = new ethers.Contract(contractAddress, ERC20_ABI, wallet);
  const decimals = Number(await contract.decimals());
  const value = parseDecimalUnits(amountCrypto, decimals);
  const gasLimit = await contract.transfer.estimateGas(toAddress, value).catch(() => 80_000n);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData?.maxFeePerGas || feeData?.gasPrice || ETH_FALLBACK_GAS_PRICE_WEI;
  const requiredGas = gasPrice > 0n ? gasLimit * gasPrice : 0n;
  const gasFunding = await ensureEthereumGas({
    provider,
    address: wallet.address,
    requiredWei: requiredGas
  });

  const txOptions = {};
  if (feeData?.maxFeePerGas && feeData?.maxPriorityFeePerGas) {
    txOptions.maxFeePerGas = feeData.maxFeePerGas;
    txOptions.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData?.gasPrice) {
    txOptions.gasPrice = feeData.gasPrice;
  } else {
    txOptions.gasPrice = ETH_FALLBACK_GAS_PRICE_WEI;
  }
  txOptions.gasLimit = gasLimit;

  const tx = await contract.transfer(toAddress, value, txOptions);
  return {
    txHash: tx.hash,
    amountCrypto,
    unit: ticket.cryptocurrency.toUpperCase(),
    confirmationNetwork: 'ethereum',
    gasFunding
  };
};

const sendSolanaNativePayout = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const connection = getSolanaConnection(networkMode);
  const keypair = deriveSolanaKeypair(requireDepositIndex(ticket));
  const lamports = parseDecimalUnits(amountCrypto, 9);
  if (lamports <= 0n) {
    throw new Error('Invalid SOL payout amount');
  }
  const balance = BigInt(await connection.getBalance(keypair.publicKey, 'confirmed'));
  if (balance < lamports) {
    throw normalizeTransferError('Escrow deposit wallet does not contain enough SOL principal for payout.', 'ESCROW_BALANCE_INSUFFICIENT');
  }
  const gasFunding = await ensureSolanaGas({
    connection,
    publicKey: keypair.publicKey,
    requiredLamports: lamports + SOL_GAS_BUFFER_LAMPORTS
  });

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(toAddress),
      lamports: Number(lamports)
    })
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: 'confirmed'
  });

  return { txHash: signature, amountCrypto, unit: 'SOL', confirmationNetwork: 'solana', gasFunding };
};

const sendSplPayout = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const mintAddress = SPL_MINTS[networkMode]?.[ticket.cryptocurrency];
  if (!mintAddress) {
    throw new Error(`${ticket.cryptocurrency.toUpperCase()} mint is not configured for ${networkMode}`);
  }

  const connection = getSolanaConnection(networkMode);
  const keypair = deriveSolanaKeypair(requireDepositIndex(ticket));
  const gasFunding = await ensureSolanaGas({
    connection,
    publicKey: keypair.publicKey,
    requiredLamports: MIN_SPL_GAS_LAMPORTS
  });

  const mint = new PublicKey(mintAddress);
  const receiver = new PublicKey(toAddress);
  const senderAta = await getAssociatedTokenAddress(mint, keypair.publicKey);
  const receiverAta = await getAssociatedTokenAddress(mint, receiver);
  const mintInfo = await getMint(connection, mint);
  const amount = parseDecimalUnits(amountCrypto, mintInfo.decimals);

  const tx = new Transaction();
  const receiverAtaExists = await getAccount(connection, receiverAta).then(() => true).catch(() => false);
  if (!receiverAtaExists) {
    tx.add(createAssociatedTokenAccountInstruction(
      keypair.publicKey,
      receiverAta,
      receiver,
      mint
    ));
  }

  tx.add(createTransferCheckedInstruction(
    senderAta,
    mint,
    receiverAta,
    keypair.publicKey,
    amount,
    mintInfo.decimals
  ));

  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: 'confirmed'
  });

  return {
    txHash: signature,
    amountCrypto,
    unit: ticket.cryptocurrency.toUpperCase(),
    confirmationNetwork: 'solana',
    gasFunding
  };
};

const toSatoshis = (amountCrypto) => {
  const normalized = String(amountCrypto || '0').trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Invalid UTXO payout amount');
  }
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0').slice(0, 8) || '0');
};

const getUtxoApiBase = (chain, networkMode) => {
  const base = UTXO_API[chain]?.[networkMode] || UTXO_API[chain]?.mainnet || UTXO_API[chain]?.testnet;
  if (!base) {
    throw new Error(`${chain.toUpperCase()} network is not configured for ${networkMode}`);
  }
  return base;
};

const withBlockCypherToken = (url) => (
  BLOCKCYPHER_TOKEN
    ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(BLOCKCYPHER_TOKEN)}`
    : url
);

const estimateSegwitVbytes = (inputCount, outputCount) => (
  10 + inputCount * 68 + outputCount * 31
);

const fetchUtxos = async ({ chain, networkMode, address }) => {
  const base = getUtxoApiBase(chain, networkMode);
  const url = withBlockCypherToken(`${base}/addrs/${encodeURIComponent(address)}?unspentOnly=true&includeScript=true`);
  const { data } = await axios.get(url, { timeout: 10_000 });
  return [
    ...(data?.txrefs || []),
    ...(data?.unconfirmed_txrefs || [])
  ].filter((utxo) => Number(utxo?.value) > 0 && utxo.tx_hash && Number.isInteger(Number(utxo.tx_output_n)));
};

const broadcastUtxoTx = async ({ chain, networkMode, txHex }) => {
  const base = getUtxoApiBase(chain, networkMode);
  const url = withBlockCypherToken(`${base}/txs/push`);
  const { data } = await axios.post(url, { tx: txHex }, { timeout: 15_000 });
  return data?.tx?.hash || data?.hash || data?.tx_hash || null;
};

const sendUtxoPayout = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const chain = String(ticket?.cryptocurrency || '').toLowerCase();
  const signer = deriveUtxoSigner(chain, requireDepositIndex(ticket));
  const resolvedNetworkMode = networkMode || signer.networkMode;
  const amountSats = toSatoshis(amountCrypto);
  if (amountSats <= UTXO_DUST_SATS) {
    throw new Error(`${chain.toUpperCase()} payout amount is below dust threshold`);
  }

  bitcoin.address.toOutputScript(toAddress, signer.network);
  const utxos = await fetchUtxos({
    chain,
    networkMode: resolvedNetworkMode,
    address: signer.address
  });
  if (!utxos.length) {
    throw new Error(`No spendable ${chain.toUpperCase()} UTXOs found for escrow address.`);
  }

  const selected = [];
  let selectedValue = 0n;
  let feeSats = 0n;
  for (const utxo of utxos.sort((a, b) => Number(b.value) - Number(a.value))) {
    selected.push(utxo);
    selectedValue += BigInt(utxo.value);
    feeSats = BigInt(Math.ceil(estimateSegwitVbytes(selected.length, 2) * UTXO_FEE_SATS_PER_VBYTE));
    if (selectedValue >= amountSats + feeSats) {
      break;
    }
  }

  if (selectedValue < amountSats + feeSats) {
    throw new Error(`Insufficient ${chain.toUpperCase()} escrow balance for payout plus network fee.`);
  }

  let changeSats = selectedValue - amountSats - feeSats;
  const outputCount = changeSats > UTXO_DUST_SATS ? 2 : 1;
  feeSats = BigInt(Math.ceil(estimateSegwitVbytes(selected.length, outputCount) * UTXO_FEE_SATS_PER_VBYTE));
  changeSats = selectedValue - amountSats - feeSats;
  if (changeSats < 0n) {
    throw new Error(`Insufficient ${chain.toUpperCase()} escrow balance after fee recalculation.`);
  }

  const psbt = new bitcoin.Psbt({ network: signer.network });
  selected.forEach((utxo) => {
    psbt.addInput({
      hash: utxo.tx_hash,
      index: Number(utxo.tx_output_n),
      witnessUtxo: {
        script: signer.output,
        value: BigInt(utxo.value)
      }
    });
  });

  psbt.addOutput({
    address: toAddress,
    value: amountSats
  });
  if (changeSats > UTXO_DUST_SATS) {
    psbt.addOutput({
      address: signer.address,
      value: changeSats
    });
  }

  selected.forEach((_, index) => {
    psbt.signInput(index, {
      publicKey: Buffer.from(signer.keyPair.publicKey),
      sign: (hash) => Buffer.from(signer.keyPair.sign(hash))
    });
  });
  psbt.finalizeAllInputs();
  const txHex = psbt.extractTransaction().toHex();
  const txHash = await broadcastUtxoTx({ chain, networkMode: resolvedNetworkMode, txHex });
  if (!txHash) {
    throw new Error(`${chain.toUpperCase()} broadcast did not return a transaction hash.`);
  }

  return {
    txHash,
    amountCrypto,
    unit: chain === 'bitcoin' ? 'BTC' : 'LTC',
    confirmationNetwork: chain,
    feeSats: feeSats.toString(),
    changeSats: changeSats > UTXO_DUST_SATS ? changeSats.toString() : '0'
  };
};

export const executeLocalTransfer = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const currency = String(ticket?.cryptocurrency || '').toLowerCase();

  if (currency === 'bitcoin' || currency === 'litecoin') {
    return sendUtxoPayout({ ticket, toAddress, amountCrypto, networkMode });
  }

  if (currency === 'ethereum') {
    return sendEthereumNativePayout({ ticket, toAddress, amountCrypto, networkMode });
  }

  if (currency === 'usdt-erc20' || currency === 'usdc-erc20') {
    if (!isTokenDepositAddressPayoutAllowed()) {
      throw normalizeTransferError(
        'Automatic ERC-20 payout from per-ticket deposit addresses is disabled in production until gas funding or treasury sweeping is configured.',
        'AUTOMATIC_PAYOUT_UNSUPPORTED'
      );
    }
    return sendErc20Payout({ ticket, toAddress, amountCrypto, networkMode });
  }

  if (currency === 'solana') {
    return sendSolanaNativePayout({ ticket, toAddress, amountCrypto, networkMode });
  }

  if (currency === 'usdt-spl' || currency === 'usdc-spl') {
    if (!isTokenDepositAddressPayoutAllowed()) {
      throw normalizeTransferError(
        'Automatic SPL payout from per-ticket deposit addresses is disabled in production until SOL gas funding or treasury sweeping is configured.',
        'AUTOMATIC_PAYOUT_UNSUPPORTED'
      );
    }
    return sendSplPayout({ ticket, toAddress, amountCrypto, networkMode });
  }

  throw new Error(`Unsupported payout currency: ${currency}`);
};

const callExternalSigner = async ({ transfer, ticket }) => {
  const signerUrl = String(process.env.SIGNER_SERVICE_URL || '').trim().replace(/\/$/, '');
  if (!signerUrl) {
    throw normalizeTransferError('SIGNER_SERVICE_URL is required when WALLET_SIGNER_MODE=external.', 'SIGNER_UNCONFIGURED');
  }

  const token = String(process.env.SIGNER_SERVICE_TOKEN || '').trim();
  if (!token) {
    throw normalizeTransferError('SIGNER_SERVICE_TOKEN is required when WALLET_SIGNER_MODE=external.', 'SIGNER_UNCONFIGURED');
  }

  const path = '/transfers';
  const requestBody = JSON.stringify({
    transferId: transfer.transferId,
    purpose: transfer.purpose,
    currency: transfer.currency,
    chain: transfer.chain,
    token: transfer.token,
    networkMode: transfer.networkMode,
    fromAddress: transfer.fromAddress,
    derivationIndex: transfer.derivationIndex,
    toAddress: transfer.toAddress,
    amountCrypto: transfer.amountCrypto,
    amountUsd: transfer.amountUsd,
    sourceType: transfer.sourceType,
    sourceId: transfer.sourceId,
    depositAddress: ticket?.depositAddress || ticket?.paymentAddress || null
  });
  const signerAuthHeaders = buildSignerAuthHeaders({
    secret: token,
    method: 'POST',
    path,
    body: requestBody
  });

  const response = await fetch(`${signerUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': transfer.idempotencyKey,
      ...signerAuthHeaders
    },
    body: requestBody
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw normalizeTransferError(
      payload?.message || `External signer failed with ${response.status}`,
      payload?.code || 'SIGNER_REQUEST_FAILED'
    );
  }

  if (!payload?.txHash && payload?.status !== 'queued') {
    throw normalizeTransferError('External signer did not return txHash or queued status.', 'SIGNER_INVALID_RESPONSE');
  }

  return {
    txHash: payload.txHash || null,
    status: payload.status || 'broadcasted',
    amountCrypto: transfer.amountCrypto,
    unit: String(transfer.currency || '').toUpperCase(),
    confirmationNetwork: payload.confirmationNetwork || getPayoutConfirmationNetwork(transfer.currency),
    signerResponse: payload
  };
};

export const sendTicketPayout = async ({
  ticket,
  toAddress,
  amountCrypto,
  amountUsd = null,
  networkMode,
  purpose = 'ticket_payout',
  sourceType = 'ticket',
  sourceId = null,
  actor = null,
  idempotencyKey = null
}) => {
  const currency = String(ticket?.cryptocurrency || '').toLowerCase();
  const chain = ticket?.depositChain || (currency.endsWith('-erc20') || currency === 'ethereum'
    ? 'ethereum'
    : currency.endsWith('-spl') || currency === 'solana'
      ? 'solana'
      : currency);
  const token = ticket?.depositToken || (currency.includes('-') ? currency : 'native');
  const resolvedSourceId = sourceId || ticket?.ticketId || ticket?.orderId || String(ticket?._id || '');
  const resolvedIdempotencyKey = idempotencyKey || buildDefaultIdempotencyKey({
    purpose,
    sourceType,
    sourceId: resolvedSourceId,
    toAddress,
    amountCrypto
  });

  const existingTransfer = await WalletTransfer.findOne({ idempotencyKey: resolvedIdempotencyKey });
  if (existingTransfer?.txHash) {
    return {
      txHash: existingTransfer.txHash,
      amountCrypto: existingTransfer.amountCrypto,
      unit: existingTransfer.currency.toUpperCase(),
      confirmationNetwork: existingTransfer.confirmationNetwork || getPayoutConfirmationNetwork(existingTransfer.currency),
      transfer: existingTransfer,
      signerStatus: existingTransfer.status
    };
  }
  if (existingTransfer && ['queued', 'manual_required'].includes(existingTransfer.status)) {
    const error = normalizeTransferError(`Transfer ${existingTransfer.transferId} is already ${existingTransfer.status}.`, 'TRANSFER_ALREADY_PENDING');
    error.transfer = existingTransfer;
    throw error;
  }

  const signerMode = getSignerMode();
  const policy = getPolicyDecision({ purpose, amountUsd });
  const transfer = existingTransfer || await WalletTransfer.create({
    transferId: generateTransferId(),
    idempotencyKey: resolvedIdempotencyKey,
    purpose,
    status: 'pending',
    signerMode,
    sourceType,
    sourceId: resolvedSourceId,
    actor,
    currency,
    chain,
    token,
    networkMode,
    fromAddress: ticket?.depositAddress || ticket?.paymentAddress || ticket?.botWalletAddress || null,
    derivationIndex: ticket?.depositIndex ?? null,
    toAddress,
    amountCrypto: String(amountCrypto),
    amountUsd: Number.isFinite(Number(amountUsd)) ? Number(amountUsd) : null,
    confirmationNetwork: getPayoutConfirmationNetwork(currency),
    policy
  });

  if (policy.requiresApproval) {
    transfer.status = 'manual_required';
    transfer.errorCode = 'TRANSFER_REQUIRES_APPROVAL';
    transfer.errorMessage = `Transfer exceeds automatic ${purpose} limit of $${policy.maxUsd}.`;
    await transfer.save();
    const error = normalizeTransferError(transfer.errorMessage, 'TRANSFER_REQUIRES_APPROVAL');
    error.transfer = transfer;
    throw error;
  }

  try {
    let result;
    if (signerMode === 'external') {
      result = await callExternalSigner({ transfer, ticket });
    } else if (signerMode === 'local') {
      if (!isLocalSigningAllowed()) {
        throw normalizeTransferError('Local app-process signing is disabled. Configure external signer or set ALLOW_APP_PROCESS_SIGNING=true intentionally.', 'LOCAL_SIGNING_DISABLED');
      }
      result = await executeLocalTransfer({ ticket, toAddress, amountCrypto, networkMode });
    } else if (signerMode === 'manual') {
      throw normalizeTransferError('Wallet signer is in manual mode; transfer has been queued for staff execution.', 'TRANSFER_MANUAL_REQUIRED');
    } else {
      throw normalizeTransferError('Wallet signer is disabled.', 'SIGNER_DISABLED');
    }

    transfer.txHash = result.txHash || null;
    transfer.signerResponse = result.signerResponse || result;
    transfer.confirmationNetwork = result.confirmationNetwork || transfer.confirmationNetwork;
    transfer.status = result.txHash ? 'broadcasted' : (result.status || 'queued');
    transfer.broadcastedAt = result.txHash ? new Date() : null;
    await transfer.save();

    return {
      ...result,
      transfer,
      signerStatus: transfer.status
    };
  } catch (error) {
    transfer.status = ['TRANSFER_MANUAL_REQUIRED', 'SIGNER_UNCONFIGURED', 'AUTOMATIC_PAYOUT_UNSUPPORTED', 'DEPOSIT_GAS_REQUIRED', 'TREASURY_GAS_UNCONFIGURED', 'ESCROW_BALANCE_INSUFFICIENT'].includes(error.code)
      ? 'manual_required'
      : 'failed';
    transfer.errorCode = error.code || 'TRANSFER_FAILED';
    transfer.errorMessage = error.message;
    await transfer.save();
    error.transfer = transfer;
    throw error;
  }
};

export const getPayoutConfirmationNetwork = (currency) => {
  const normalized = String(currency || '').toLowerCase();
  if (normalized === 'bitcoin' || normalized === 'litecoin') {
    return normalized;
  }
  if (normalized === 'ethereum' || normalized.endsWith('-erc20')) {
    return 'ethereum';
  }
  if (normalized === 'solana' || normalized.endsWith('-spl')) {
    return 'solana';
  }
  return 'manual';
};
