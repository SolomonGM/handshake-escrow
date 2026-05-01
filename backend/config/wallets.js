const normalizeNetworkMode = (value, fallback = 'mainnet') => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'mainnet' || mode === 'testnet') {
    return mode;
  }
  return fallback;
};

// BTC/LTC network mode (aligns BlockCypher usage with explorer links)
export const BTC_NETWORK_MODE = normalizeNetworkMode(process.env.BTC_NETWORK_MODE || 'testnet', 'testnet');
export const LTC_NETWORK_MODE = normalizeNetworkMode(process.env.LTC_NETWORK_MODE || 'mainnet', 'mainnet');

const BTC_WALLETS = {
  mainnet: process.env.BTC_MAINNET_WALLET || '',
  testnet: process.env.BTC_TESTNET_WALLET || ''
};

const LTC_WALLETS = {
  mainnet: process.env.LTC_MAINNET_WALLET || '',
  testnet: process.env.LTC_TESTNET_WALLET || ''
};

const resolveUtxoWallet = (crypto, mode, wallets) => {
  const resolved = wallets?.[mode] || '';
  if (resolved) {
    return resolved;
  }
  console.warn(`⚠️  ${crypto.toUpperCase()} wallet not configured for ${mode}.`);
  return '';
};

// Bot wallet addresses for each cryptocurrency
export const BOT_WALLETS = {
  bitcoin: resolveUtxoWallet('bitcoin', BTC_NETWORK_MODE, BTC_WALLETS),
  ethereum: String(process.env.ETH_TESTNET_WALLET || process.env.ETH_MAINNET_WALLET || '').trim(),
  litecoin: resolveUtxoWallet('litecoin', LTC_NETWORK_MODE, LTC_WALLETS),
  solana: String(process.env.SOL_MAINNET_WALLET || process.env.SOL_TESTNET_WALLET || '').trim(),
  'usdt-erc20': String(process.env.USDT_MAINNET_WALLET || process.env.USDT_TESTNET_WALLET || process.env.ETH_MAINNET_WALLET || process.env.ETH_TESTNET_WALLET || '').trim(),
  'usdc-erc20': String(process.env.USDC_MAINNET_WALLET || process.env.USDC_TESTNET_WALLET || process.env.ETH_MAINNET_WALLET || process.env.ETH_TESTNET_WALLET || '').trim()
};

// BlockCypher UTXO network configuration (BTC + LTC)
export const UTXO_NETWORKS = {
  bitcoin: {
    mainnet: {
      apiBase: 'https://api.blockcypher.com/v1/btc/main',
      explorer: 'https://live.blockcypher.com/btc',
      symbol: 'BTC',
      confirmationsRequired: 2
    },
    testnet: {
      apiBase: 'https://api.blockcypher.com/v1/btc/test3',
      explorer: 'https://live.blockcypher.com/btc-testnet',
      symbol: 'BTC',
      confirmationsRequired: 2
    }
  },
  litecoin: {
    mainnet: {
      apiBase: 'https://api.blockcypher.com/v1/ltc/main',
      explorer: 'https://live.blockcypher.com/ltc',
      symbol: 'LTC',
      confirmationsRequired: 2
    }
  }
};

export const getUtxoNetworkMode = (crypto) => {
  if (crypto === 'bitcoin') return BTC_NETWORK_MODE;
  if (crypto === 'litecoin') return LTC_NETWORK_MODE;
  return 'mainnet';
};

export const getUtxoNetwork = (crypto) => {
  const networks = UTXO_NETWORKS[crypto];
  if (!networks) {
    return null;
  }

  const mode = getUtxoNetworkMode(crypto);

  if (crypto === 'litecoin' && mode === 'testnet' && !networks.testnet) {
    console.warn('⚠️  Litecoin testnet is not supported by BlockCypher. Falling back to mainnet.');
    return networks.mainnet;
  }

  return networks[mode] || networks.mainnet || networks.testnet || null;
};

// Ethereum RPC endpoints (Sepolia testnet for testing, mainnet for production)
// Note: RPC URLs are loaded at runtime to ensure environment variables are available
export const ETH_RPC_CONFIG = {
  // For testing: Use Sepolia testnet
  testnet: {
    name: 'sepolia',
    get rpcUrl() {
      return process.env.SEPOLIA_RPC_URL || '';
    },
    chainId: 11155111,
    blockExplorer: 'https://sepolia.etherscan.io',
    confirmationsRequired: 2
  },
  // For production: Use Ethereum mainnet
  mainnet: {
    name: 'mainnet',
    rpcUrl: process.env.ETH_MAINNET_RPC_URL || '',
    chainId: 1,
    blockExplorer: 'https://etherscan.io',
    confirmationsRequired: 3 // Require more confirmations on mainnet for security
  }
};

// Current network mode (change to 'mainnet' when going to production)
export const ETH_NETWORK_MODE = process.env.ETH_NETWORK_MODE || 'testnet';

// This calculates total amount to send (deal amount + fees).
export const calculateTotalAmount = (dealAmount, cryptocurrency, usedPass) => {
  if (usedPass) {
    return dealAmount; // No fees with pass
  }

  let fee = 0;
  
  // Base fee structure
  if (dealAmount >= 250) {
    fee = dealAmount * 0.01; // 1%
  } else if (dealAmount >= 50) {
    fee = 2; // $2 flat fee
  } else if (dealAmount >= 10) {
    fee = 0.50; // $0.50 flat fee
  } else {
    fee = 0; // FREE for under $10
  }

  // USDT/USDC surcharge
  if (cryptocurrency === 'usdt-erc20' || cryptocurrency === 'usdc-erc20') {
    fee += 1; // $1 surcharge
  }

  return dealAmount + fee;
};

// This gets exchange rate placeholder (this will be replaced with real API later).
// WARNING: These are EXAMPLE rates. In production, use a live API like CoinGecko
// TESTING: Set ETH = $240 so Rhino Pass ($12) costs exactly 0.05 ETH
export const EXCHANGE_RATES = {
  bitcoin: 42000, // 1 BTC = $42,000 USD
  ethereum: 240, // 1 ETH = $240 USD (TESTING: allows 0.05 ETH for all passes)
  litecoin: 75, // 1 LTC = $75 USD (TESTNET uses same rate for simplicity)
  solana: 100, // 1 SOL = $100 USD
  'usdt-erc20': 1, // 1 USDT = $1 USD
  'usdc-erc20': 1  // 1 USDC = $1 USD
};
