import { ethers } from 'ethers';
import {
  Connection,
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
import { deriveEthereumWallet, deriveSolanaKeypair } from './hdWalletService.js';

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
  }

  txRequest.gasLimit = await wallet.estimateGas(txRequest).catch(() => 21000n);
  const tx = await wallet.sendTransaction(txRequest);
  return { txHash: tx.hash, amountCrypto, unit: 'ETH', confirmationNetwork: 'ethereum' };
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
  const tx = await contract.transfer(toAddress, value);
  return {
    txHash: tx.hash,
    amountCrypto,
    unit: ticket.cryptocurrency.toUpperCase(),
    confirmationNetwork: 'ethereum'
  };
};

const sendSolanaNativePayout = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const connection = getSolanaConnection(networkMode);
  const keypair = deriveSolanaKeypair(requireDepositIndex(ticket));
  const lamports = parseDecimalUnits(amountCrypto, 9);
  if (lamports <= 0n) {
    throw new Error('Invalid SOL payout amount');
  }

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

  return { txHash: signature, amountCrypto, unit: 'SOL', confirmationNetwork: 'solana' };
};

const sendSplPayout = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const mintAddress = SPL_MINTS[networkMode]?.[ticket.cryptocurrency];
  if (!mintAddress) {
    throw new Error(`${ticket.cryptocurrency.toUpperCase()} mint is not configured for ${networkMode}`);
  }

  const connection = getSolanaConnection(networkMode);
  const keypair = deriveSolanaKeypair(requireDepositIndex(ticket));
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
    confirmationNetwork: 'solana'
  };
};

export const sendTicketPayout = async ({ ticket, toAddress, amountCrypto, networkMode }) => {
  const currency = String(ticket?.cryptocurrency || '').toLowerCase();

  if (currency === 'bitcoin' || currency === 'litecoin') {
    const error = new Error(`${currency.toUpperCase()} automatic payout needs a secure UTXO signer. Current configuration is xpub/watch-only.`);
    error.code = 'AUTOMATIC_PAYOUT_UNSUPPORTED';
    throw error;
  }

  if (currency === 'ethereum') {
    return sendEthereumNativePayout({ ticket, toAddress, amountCrypto, networkMode });
  }

  if (currency === 'usdt-erc20' || currency === 'usdc-erc20') {
    return sendErc20Payout({ ticket, toAddress, amountCrypto, networkMode });
  }

  if (currency === 'solana') {
    return sendSolanaNativePayout({ ticket, toAddress, amountCrypto, networkMode });
  }

  if (currency === 'usdt-spl' || currency === 'usdc-spl') {
    return sendSplPayout({ ticket, toAddress, amountCrypto, networkMode });
  }

  throw new Error(`Unsupported payout currency: ${currency}`);
};

export const getPayoutConfirmationNetwork = (currency) => {
  const normalized = String(currency || '').toLowerCase();
  if (normalized === 'ethereum' || normalized.endsWith('-erc20')) {
    return 'ethereum';
  }
  if (normalized === 'solana' || normalized.endsWith('-spl')) {
    return 'solana';
  }
  return 'manual';
};
