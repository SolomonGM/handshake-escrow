// Per-ticket HD wallet derivation. Pure functions over xpubs/mnemonics held in
// env vars; never holds private keys for BTC/LTC (watch-only via xpub). For
// ETH/SOL we keep a derivation mnemonic in env so we can also produce signing
// keys later for admin refund flows — addresses themselves are derived from
// the public side only.

import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import bs58check from 'bs58check';
import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import HdAddressCounter from '../models/HdAddressCounter.js';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// ============================================================================
// Network parameters for each UTXO chain. BIP84 (native SegWit / bech32) only.
// ============================================================================

const BITCOIN_NETWORKS = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet
};

// Litecoin needs a custom network object because bitcoinjs-lib does not ship
// with one. Values are the canonical bip84 zpub/vpub prefixes for LTC.
const LITECOIN_NETWORKS = {
  mainnet: {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bech32: 'ltc',
    bip32: { public: 0x019da462, private: 0x019d9cfe },
    pubKeyHash: 0x30,
    scriptHash: 0x32,
    wif: 0xb0
  },
  testnet: {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bech32: 'tltc',
    bip32: { public: 0x043587cf, private: 0x04358394 },
    pubKeyHash: 0x6f,
    scriptHash: 0x3a,
    wif: 0xef
  }
};

// Many wallets export native SegWit xpubs with the SLIP-132 prefix family
// (zpub, ypub, vpub, upub, tpub...). bitcoinjs-lib / bip32 only understand the
// classic xpub/tpub prefixes, so we re-encode the version bytes before parsing.
const VERSION_BYTE_PREFIXES = {
  // Mainnet
  xpub: '0488b21e',
  ypub: '049d7cb2',
  zpub: '04b24746',
  Ltub: '019da462',
  Mtub: '01b26ef6',
  // Testnet
  tpub: '043587cf',
  upub: '044a5262',
  vpub: '045f1cf6',
  ttub: '0436f6e1'
};

const reencodeAsClassic = (extendedKey, targetClassic /* 'xpub' or 'tpub' */) => {
  const trimmed = String(extendedKey || '').trim();
  if (!trimmed) {
    throw new Error('Empty extended key');
  }

  const prefix = trimmed.slice(0, 4);
  if (prefix === targetClassic) {
    return trimmed;
  }

  if (!VERSION_BYTE_PREFIXES[prefix]) {
    throw new Error(`Unsupported extended-key prefix: ${prefix}`);
  }

  const decoded = bs58check.decode(trimmed);
  const targetVersionHex = VERSION_BYTE_PREFIXES[targetClassic];
  if (!targetVersionHex) {
    throw new Error(`Unknown target classic prefix: ${targetClassic}`);
  }

  const reencoded = Buffer.concat([
    Buffer.from(targetVersionHex, 'hex'),
    Buffer.from(decoded.slice(4))
  ]);

  return bs58check.encode(reencoded);
};

// ============================================================================
// Config loaders. Throw early & loudly if a required env var is missing — we
// would rather fail at ticket-creation time than silently route funds to a
// dev placeholder address.
// ============================================================================

const requireEnv = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    const error = new Error(`Missing required env: ${name}`);
    error.code = 'HD_CONFIG_MISSING';
    error.envKey = name;
    throw error;
  }
  return value;
};

const optionalEnv = (name) => String(process.env[name] || '').trim();

const getUtxoNetworkMode = (chain) => {
  if (chain === 'bitcoin') {
    return optionalEnv('HD_BTC_NETWORK') === 'mainnet' ? 'mainnet' : 'testnet';
  }
  if (chain === 'litecoin') {
    return optionalEnv('HD_LTC_NETWORK') === 'mainnet' ? 'mainnet' : 'testnet';
  }
  throw new Error(`getUtxoNetworkMode: not a UTXO chain: ${chain}`);
};

const getEthereumNetworkMode = () => (
  optionalEnv('HD_ETH_NETWORK') === 'mainnet' ? 'mainnet' : 'testnet'
);

const getSolanaNetworkMode = () => (
  optionalEnv('HD_SOL_NETWORK') === 'mainnet' ? 'mainnet' : 'devnet'
);

// ============================================================================
// Address derivation per chain
// ============================================================================

const deriveUtxoAddress = (chain, index) => {
  const networkMode = getUtxoNetworkMode(chain);
  const network = chain === 'bitcoin'
    ? BITCOIN_NETWORKS[networkMode]
    : LITECOIN_NETWORKS[networkMode];

  const rawXpub = chain === 'bitcoin'
    ? requireEnv('HD_BTC_XPUB')
    : requireEnv('HD_LTC_XPUB');

  // Normalize to classic prefix for the active network so bip32 can parse it.
  const targetClassic = networkMode === 'mainnet' ? 'xpub' : 'tpub';
  const normalized = reencodeAsClassic(rawXpub, targetClassic);

  // The xpub is expected to be at the account level (m/84'/coin'/0'). From
  // there we use the standard `0/index` path for receive addresses.
  const node = bip32.fromBase58(normalized, network);
  const child = node.derive(0).derive(index);

  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network
  });

  if (!address) {
    throw new Error(`Failed to derive ${chain} address at index ${index}`);
  }

  return address;
};

const deriveEthereumAddress = (index) => {
  // We accept either a mnemonic (preferred) or an xpub.
  const mnemonic = optionalEnv('HD_ETH_MNEMONIC');
  if (mnemonic) {
    const path = `m/44'/60'/0'/0/${index}`;
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
    return ethers.getAddress(wallet.address);
  }

  const xpub = requireEnv('HD_ETH_XPUB');
  const node = ethers.HDNodeWallet.fromExtendedKey(xpub);
  const child = node.derivePath(`0/${index}`);
  return ethers.getAddress(child.address);
};

const deriveSolanaAddress = (index) => {
  // Solana uses ed25519, not secp256k1, so we use Solana's standard
  // SLIP-0010 derivation. Mnemonic is required (no xpub equivalent for ed25519).
  const mnemonic = requireEnv('HD_SOL_MNEMONIC');
  const seed = mnemonicToSeedSync(mnemonic, '');
  const path = `m/44'/501'/${index}'/0'`;
  const { key } = derivePath(path, seed.toString('hex'));
  const keypair = Keypair.fromSeed(key);
  return keypair.publicKey.toBase58();
};

// ============================================================================
// Public API
// ============================================================================

export const SUPPORTED_DEPOSIT_TOKENS = {
  bitcoin: { chain: 'bitcoin', token: 'native' },
  litecoin: { chain: 'litecoin', token: 'native' },
  ethereum: { chain: 'ethereum', token: 'native' },
  solana: { chain: 'solana', token: 'native' },
  'usdt-erc20': { chain: 'ethereum', token: 'usdt-erc20' },
  'usdc-erc20': { chain: 'ethereum', token: 'usdc-erc20' },
  'usdt-spl': { chain: 'solana', token: 'usdt-spl' },
  'usdc-spl': { chain: 'solana', token: 'usdc-spl' }
};

// Resolve which on-chain wallet to derive for a given user-facing currency.
// USDT/USDC live on the underlying chain (ETH or SOL) — same address is used
// to receive both the native coin and the SPL/ERC-20 token.
export const resolveDepositChain = (currency) => {
  const normalized = String(currency || '').trim().toLowerCase();
  const entry = SUPPORTED_DEPOSIT_TOKENS[normalized];
  if (!entry) {
    throw new Error(`Unsupported deposit currency: ${currency}`);
  }
  return entry;
};

export const deriveAddressForChain = (chain, index) => {
  switch (chain) {
    case 'bitcoin':
    case 'litecoin':
      return deriveUtxoAddress(chain, index);
    case 'ethereum':
      return deriveEthereumAddress(index);
    case 'solana':
      return deriveSolanaAddress(index);
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
};

// Allocate the next unique address for a deposit. Atomic against concurrent
// ticket creation thanks to the $inc-backed counter.
export const allocateDepositAddress = async (currency) => {
  const { chain, token } = resolveDepositChain(currency);
  const index = await HdAddressCounter.consumeNextIndex(chain);
  const address = deriveAddressForChain(chain, index);
  return {
    address,
    chain,
    token,
    derivationIndex: index,
    networkMode: chain === 'bitcoin' || chain === 'litecoin'
      ? getUtxoNetworkMode(chain)
      : chain === 'ethereum'
        ? getEthereumNetworkMode()
        : getSolanaNetworkMode()
  };
};

// Self-test helper — used by a CLI script to confirm env is wired correctly
// before any tickets are created. Results are cached for SELF_TEST_TTL_MS
// because runtimeConfigService calls this on every admin write to gate the
// HD-aware validator path; recomputing from env + re-deriving addresses on
// every call would burn CPU + log noise unnecessarily. Pass `force: true`
// to bypass the cache (used by the admin "Reload" button).
const SELF_TEST_TTL_MS = 60_000;
let cachedSelfTest = null;
let cachedSelfTestAt = 0;

export const selfTest = ({ force = false } = {}) => {
  if (!force && cachedSelfTest && Date.now() - cachedSelfTestAt < SELF_TEST_TTL_MS) {
    return cachedSelfTest;
  }

  const results = {};
  for (const chain of ['bitcoin', 'litecoin', 'ethereum', 'solana']) {
    try {
      const address = deriveAddressForChain(chain, 0);
      results[chain] = { ok: true, addressAtIndex0: address };
    } catch (error) {
      results[chain] = { ok: false, error: error.message, code: error.code || null };
    }
  }

  cachedSelfTest = results;
  cachedSelfTestAt = Date.now();
  return results;
};

export const invalidateSelfTestCache = () => {
  cachedSelfTest = null;
  cachedSelfTestAt = 0;
};
