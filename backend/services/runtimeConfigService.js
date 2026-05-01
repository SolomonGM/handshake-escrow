import SystemConfig from '../models/SystemConfig.js';
import {
  BTC_NETWORK_MODE,
  ETH_NETWORK_MODE,
  ETH_RPC_CONFIG,
  LTC_NETWORK_MODE,
  UTXO_NETWORKS
} from '../config/wallets.js';

const CONFIG_KEY = 'runtime';
const CACHE_TTL_MS = 5000;
const NETWORK_MODES = ['mainnet', 'testnet'];
const WALLET_COIN_KEYS = ['bitcoin', 'litecoin', 'ethereum', 'solana', 'usdt-erc20', 'usdc-erc20'];
const TICKET_COIN_KEYS = ['bitcoin', 'litecoin', 'ethereum', 'solana', 'usdt-erc20', 'usdc-erc20'];

const DEFAULT_NETWORK_MODES = {
  bitcoin: normalizeNetworkMode(BTC_NETWORK_MODE, 'testnet'),
  litecoin: normalizeNetworkMode(LTC_NETWORK_MODE, 'mainnet'),
  ethereum: normalizeNetworkMode(ETH_NETWORK_MODE, 'testnet'),
  solana: normalizeNetworkMode(process.env.SOL_NETWORK_MODE || 'mainnet', 'mainnet')
};

const DEFAULT_WALLETS = {
  bitcoin: {
    mainnet: String(process.env.BTC_MAINNET_WALLET || '').trim(),
    testnet: String(process.env.BTC_TESTNET_WALLET || '').trim()
  },
  litecoin: {
    mainnet: String(process.env.LTC_MAINNET_WALLET || '').trim(),
    testnet: String(process.env.LTC_TESTNET_WALLET || '').trim()
  },
  ethereum: {
    mainnet: String(process.env.ETH_MAINNET_WALLET || '').trim(),
    testnet: String(process.env.ETH_TESTNET_WALLET || '').trim()
  },
  solana: {
    mainnet: String(process.env.SOL_MAINNET_WALLET || '').trim(),
    testnet: String(process.env.SOL_TESTNET_WALLET || '').trim()
  },
  'usdt-erc20': {
    mainnet: String(process.env.USDT_MAINNET_WALLET || process.env.ETH_MAINNET_WALLET || '').trim(),
    testnet: String(process.env.USDT_TESTNET_WALLET || process.env.ETH_TESTNET_WALLET || '').trim()
  },
  'usdc-erc20': {
    mainnet: String(process.env.USDC_MAINNET_WALLET || process.env.ETH_MAINNET_WALLET || '').trim(),
    testnet: String(process.env.USDC_TESTNET_WALLET || process.env.ETH_TESTNET_WALLET || '').trim()
  }
};

const DEFAULT_TICKET_AVAILABILITY = {
  bitcoin: false,
  litecoin: false,
  ethereum: true,
  solana: false,
  'usdt-erc20': false,
  'usdc-erc20': false
};

let cachedRuntimeConfig = null;
let cachedAt = 0;

function normalizeNetworkMode(value, fallback = 'mainnet') {
  const mode = String(value || '').trim().toLowerCase();
  if (NETWORK_MODES.includes(mode)) {
    return mode;
  }
  return fallback;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

const toObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  return value;
};

const normalizeWallets = (rawWallets = {}) => {
  const source = toObject(rawWallets);
  return WALLET_COIN_KEYS.reduce((acc, coin) => {
    const walletEntry = toObject(source[coin] || {});
    const fallback = DEFAULT_WALLETS[coin] || { mainnet: '', testnet: '' };
    acc[coin] = {
      mainnet: String(walletEntry.mainnet ?? fallback.mainnet ?? '').trim(),
      testnet: String(walletEntry.testnet ?? fallback.testnet ?? '').trim()
    };
    return acc;
  }, {});
};

const normalizeNetworkModes = (rawModes = {}) => {
  const source = toObject(rawModes);
  return {
    bitcoin: normalizeNetworkMode(source.bitcoin, DEFAULT_NETWORK_MODES.bitcoin),
    litecoin: normalizeNetworkMode(source.litecoin, DEFAULT_NETWORK_MODES.litecoin),
    ethereum: normalizeNetworkMode(source.ethereum, DEFAULT_NETWORK_MODES.ethereum),
    solana: normalizeNetworkMode(source.solana, DEFAULT_NETWORK_MODES.solana)
  };
};

const normalizeTicketAvailability = (rawAvailability = {}) => {
  const source = toObject(rawAvailability);
  return TICKET_COIN_KEYS.reduce((acc, coin) => {
    const configured = source[coin];
    if (typeof configured === 'boolean') {
      acc[coin] = configured;
      return acc;
    }

    acc[coin] = DEFAULT_TICKET_AVAILABILITY[coin] ?? false;
    return acc;
  }, {});
};

const buildDefaultDocumentShape = () => ({
  key: CONFIG_KEY,
  ticketWorkflowPaused: false,
  pauseReason: null,
  pauseChangedAt: null,
  pauseChangedBy: null,
  networkModes: clone(DEFAULT_NETWORK_MODES),
  wallets: clone(DEFAULT_WALLETS),
  ticketAvailability: clone(DEFAULT_TICKET_AVAILABILITY)
});

const hasRequiredWallets = (networkModes, wallets, ticketAvailability = DEFAULT_TICKET_AVAILABILITY) => {
  const missing = [];

  WALLET_COIN_KEYS.forEach((coin) => {
    if (!ticketAvailability?.[coin]) {
      return;
    }

    const mode = getActiveNetworkModeForCoin(coin, { networkModes });
    const wallet = wallets?.[coin]?.[mode];
    if (!wallet) {
      missing.push(`${coin}:${mode}`);
    }
  });

  return missing;
};

const BTC_MAINNET_REGEX = /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const BTC_TESTNET_REGEX = /^(tb1[ac-hj-np-z02-9]{11,71}|[mn2][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const LTC_MAINNET_REGEX = /^(ltc1[ac-hj-np-z02-9]{11,71}|[LM3][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const LTC_TESTNET_REGEX = /^(tltc1[ac-hj-np-z02-9]{11,71}|[mn2Q][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const isWalletFormatValid = (coin, mode, wallet) => {
  const value = String(wallet || '').trim();
  if (!value) {
    return false;
  }

  if (coin === 'bitcoin') {
    return mode === 'mainnet'
      ? BTC_MAINNET_REGEX.test(value)
      : BTC_TESTNET_REGEX.test(value);
  }

  if (coin === 'litecoin') {
    return mode === 'mainnet'
      ? LTC_MAINNET_REGEX.test(value)
      : LTC_TESTNET_REGEX.test(value);
  }

  if (coin === 'ethereum' || coin === 'usdt-erc20' || coin === 'usdc-erc20') {
    return ETH_ADDRESS_REGEX.test(value);
  }

  if (coin === 'solana') {
    return SOL_ADDRESS_REGEX.test(value);
  }

  return true;
};

const validateWalletFormats = (networkModes, wallets, ticketAvailability = DEFAULT_TICKET_AVAILABILITY) => {
  const invalid = [];

  WALLET_COIN_KEYS.forEach((coin) => {
    if (!ticketAvailability?.[coin]) {
      return;
    }

    const mode = getActiveNetworkModeForCoin(coin, { networkModes });
    const wallet = wallets?.[coin]?.[mode];
    if (!wallet) {
      return;
    }
    if (!isWalletFormatValid(coin, mode, wallet)) {
      invalid.push(`${coin}:${mode}`);
    }
  });

  return invalid;
};

const toPublicRuntimeConfig = (docLike) => {
  const config = normalizeRuntimeConfig(docLike);
  return {
    ticketWorkflowPaused: Boolean(config.ticketWorkflowPaused),
    pauseReason: config.pauseReason || null,
    pauseChangedAt: config.pauseChangedAt || null,
    pauseChangedBy: config.pauseChangedBy || null,
    networkModes: config.networkModes,
    wallets: config.wallets,
    ticketAvailability: config.ticketAvailability,
    updatedAt: config.updatedAt || null
  };
};

const normalizeRuntimeConfig = (docLike) => {
  const raw = toObject(docLike);

  return {
    key: raw.key || CONFIG_KEY,
    ticketWorkflowPaused: Boolean(raw.ticketWorkflowPaused),
    pauseReason: raw.pauseReason || null,
    pauseChangedAt: raw.pauseChangedAt || null,
    pauseChangedBy: raw.pauseChangedBy || null,
    updatedAt: raw.updatedAt || null,
    networkModes: normalizeNetworkModes(raw.networkModes),
    wallets: normalizeWallets(raw.wallets),
    ticketAvailability: normalizeTicketAvailability(raw.ticketAvailability)
  };
};

const refreshCache = (nextConfig) => {
  cachedRuntimeConfig = normalizeRuntimeConfig(nextConfig);
  cachedAt = Date.now();
};

const clearCache = () => {
  cachedRuntimeConfig = null;
  cachedAt = 0;
};

export const ensureRuntimeConfig = async () => {
  let configDoc = await SystemConfig.findOne({ key: CONFIG_KEY });

  if (!configDoc) {
    configDoc = await SystemConfig.create(buildDefaultDocumentShape());
    refreshCache(configDoc);
    return configDoc;
  }

  let shouldSave = false;
  const rawModes = toObject(configDoc.networkModes);
  const mergedModes = normalizeNetworkModes(rawModes);
  const hasAllModeKeys = ['bitcoin', 'litecoin', 'ethereum', 'solana'].every((key) =>
    NETWORK_MODES.includes(String(rawModes?.[key] || '').trim().toLowerCase())
  );
  if (!hasAllModeKeys || JSON.stringify(rawModes) !== JSON.stringify(mergedModes)) {
    configDoc.networkModes = mergedModes;
    shouldSave = true;
  }

  const rawWallets = toObject(configDoc.wallets);
  const mergedWallets = normalizeWallets(rawWallets);
  const hasAllWalletKeys = WALLET_COIN_KEYS.every((coin) => {
    const entry = toObject(rawWallets?.[coin]);
    return typeof entry.mainnet === 'string' && typeof entry.testnet === 'string';
  });
  if (!hasAllWalletKeys) {
    configDoc.wallets = mergedWallets;
    shouldSave = true;
  }

  const rawAvailability = toObject(configDoc.ticketAvailability);
  const mergedAvailability = normalizeTicketAvailability(rawAvailability);
  const hasAllAvailabilityKeys = TICKET_COIN_KEYS.every((coin) => typeof rawAvailability?.[coin] === 'boolean');
  if (!hasAllAvailabilityKeys || JSON.stringify(rawAvailability) !== JSON.stringify(mergedAvailability)) {
    configDoc.ticketAvailability = mergedAvailability;
    shouldSave = true;
  }

  if (shouldSave) {
    await configDoc.save();
  }

  refreshCache(configDoc);
  return configDoc;
};

export const getRuntimeConfig = async ({ force = false } = {}) => {
  const cacheIsFresh = cachedRuntimeConfig && Date.now() - cachedAt < CACHE_TTL_MS;
  if (!force && cacheIsFresh) {
    return clone(cachedRuntimeConfig);
  }

  const configDoc = await ensureRuntimeConfig();
  const normalized = normalizeRuntimeConfig(configDoc);
  refreshCache(normalized);
  return clone(normalized);
};

export const getPublicRuntimeConfig = async () => {
  const config = await getRuntimeConfig();
  return toPublicRuntimeConfig(config);
};

export const getActiveNetworkModeForCoin = (coin, runtimeConfig) => {
  const normalizedCoin = String(coin || '').trim().toLowerCase();
  const modes = runtimeConfig?.networkModes || DEFAULT_NETWORK_MODES;

  if (normalizedCoin === 'bitcoin') {
    return normalizeNetworkMode(modes.bitcoin, DEFAULT_NETWORK_MODES.bitcoin);
  }
  if (normalizedCoin === 'litecoin') {
    return normalizeNetworkMode(modes.litecoin, DEFAULT_NETWORK_MODES.litecoin);
  }
  if (normalizedCoin === 'solana') {
    return normalizeNetworkMode(modes.solana, DEFAULT_NETWORK_MODES.solana);
  }
  if (
    normalizedCoin === 'ethereum' ||
    normalizedCoin === 'usdt-erc20' ||
    normalizedCoin === 'usdc-erc20'
  ) {
    return normalizeNetworkMode(modes.ethereum, DEFAULT_NETWORK_MODES.ethereum);
  }

  return 'mainnet';
};

export const getBotWalletForCoin = (coin, runtimeConfig) => {
  const normalizedCoin = String(coin || '').trim().toLowerCase();
  const mode = getActiveNetworkModeForCoin(normalizedCoin, runtimeConfig);
  const wallets = runtimeConfig?.wallets || DEFAULT_WALLETS;
  const coinWallets = wallets[normalizedCoin] || { mainnet: '', testnet: '' };
  return {
    mode,
    wallet: String(coinWallets[mode] || '').trim()
  };
};

export const getUtxoRuntimeNetwork = (coin, runtimeConfig) => {
  const normalizedCoin = String(coin || '').trim().toLowerCase();
  const networks = UTXO_NETWORKS[normalizedCoin];
  if (!networks) {
    return null;
  }

  const requestedMode = getActiveNetworkModeForCoin(normalizedCoin, runtimeConfig);
  let mode = requestedMode;

  if (normalizedCoin === 'litecoin' && requestedMode === 'testnet' && !networks.testnet) {
    mode = 'mainnet';
  }

  return {
    mode,
    requestedMode,
    config: networks[mode] || networks.mainnet || networks.testnet || null
  };
};

export const getEthereumRuntimeConfig = (runtimeConfig) => {
  const mode = getActiveNetworkModeForCoin('ethereum', runtimeConfig);
  return {
    mode,
    config: ETH_RPC_CONFIG[mode] || ETH_RPC_CONFIG.mainnet
  };
};

export const getTicketAvailabilityForCoin = (coin, runtimeConfig) => {
  const normalizedCoin = String(coin || '').trim().toLowerCase();
  if (!normalizedCoin || !TICKET_COIN_KEYS.includes(normalizedCoin)) {
    return false;
  }

  const availability = runtimeConfig?.ticketAvailability || DEFAULT_TICKET_AVAILABILITY;
  if (typeof availability[normalizedCoin] === 'boolean') {
    return availability[normalizedCoin];
  }

  return DEFAULT_TICKET_AVAILABILITY[normalizedCoin] ?? false;
};

export const getTicketAvailabilityMatrix = (runtimeConfig) => {
  const availability = runtimeConfig?.ticketAvailability || DEFAULT_TICKET_AVAILABILITY;
  return normalizeTicketAvailability(availability);
};

export const isTicketWorkflowPaused = async () => {
  const runtime = await getRuntimeConfig();
  return Boolean(runtime.ticketWorkflowPaused);
};

export const setTicketWorkflowPaused = async ({ paused, reason = null, actorId = null }) => {
  const configDoc = await ensureRuntimeConfig();
  configDoc.ticketWorkflowPaused = Boolean(paused);
  configDoc.pauseReason = reason ? String(reason).trim() : null;
  configDoc.pauseChangedAt = new Date();
  configDoc.pauseChangedBy = actorId || null;
  configDoc.updatedBy = actorId || configDoc.updatedBy || null;
  await configDoc.save();
  clearCache();
  return getPublicRuntimeConfig();
};

export const updateRuntimeConfig = async ({ networkModes, wallets, ticketAvailability, actorId = null }) => {
  const configDoc = await ensureRuntimeConfig();
  const current = normalizeRuntimeConfig(configDoc);
  const nextModes = normalizeNetworkModes(networkModes || current.networkModes);
  const nextWallets = normalizeWallets(wallets || current.wallets);
  const nextTicketAvailability = normalizeTicketAvailability(ticketAvailability || current.ticketAvailability);

  if (nextModes.litecoin === 'testnet' && !UTXO_NETWORKS.litecoin?.testnet) {
    const error = new Error('Litecoin testnet is not supported by the current monitor provider.');
    error.statusCode = 400;
    throw error;
  }

  const missingWallets = hasRequiredWallets(nextModes, nextWallets, nextTicketAvailability);
  if (missingWallets.length > 0) {
    const error = new Error(`Missing active wallet configuration for: ${missingWallets.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const invalidWallets = validateWalletFormats(nextModes, nextWallets, nextTicketAvailability);
  if (invalidWallets.length > 0) {
    const error = new Error(`Invalid wallet format for: ${invalidWallets.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  configDoc.networkModes = nextModes;
  configDoc.wallets = nextWallets;
  configDoc.ticketAvailability = nextTicketAvailability;
  configDoc.updatedBy = actorId || configDoc.updatedBy || null;
  await configDoc.save();
  clearCache();
  return getPublicRuntimeConfig();
};

export const getTicketPauseMetadata = async () => {
  const runtime = await getPublicRuntimeConfig();
  return {
    paused: runtime.ticketWorkflowPaused,
    pauseReason: runtime.pauseReason,
    pauseChangedAt: runtime.pauseChangedAt
  };
};
