import axios from 'axios';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

const COIN_DISPLAY_META = {
  BTC: {
    label: 'Bitcoin',
    iconUrl: 'https://cryptoicons.org/api/icon/btc/200'
  },
  ETH: {
    label: 'Ethereum',
    iconUrl: 'https://cryptoicons.org/api/icon/eth/200'
  },
  LTC: {
    label: 'Litecoin',
    iconUrl: 'https://cryptoicons.org/api/icon/ltc/200'
  },
  SOL: {
    label: 'Solana',
    iconUrl: 'https://cryptoicons.org/api/icon/sol/200'
  },
  USDT: {
    label: 'USDT',
    iconUrl: 'https://cryptoicons.org/api/icon/usdt/200'
  },
  USDC: {
    label: 'USDC',
    iconUrl: 'https://cryptoicons.org/api/icon/usdc/200'
  }
};

const BLOCKCHAIN_TO_SYMBOL = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  litecoin: 'LTC',
  solana: 'SOL',
  'usdt-erc20': 'USDT',
  'usdc-erc20': 'USDC'
};

const getDiscordBotToken = () => String(process.env.DISCORD_BOT_TOKEN || '').trim();
const getCompletedTicketChannelId = () => (
  String(process.env.DISCORD_COMPLETED_TICKET_CHANNEL_ID || '').trim()
);

const getPrimaryClientUrl = () => {
  const configuredUrls = String(process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  return configuredUrls[0] || 'http://localhost:5173';
};

const formatAmount = (value, fallback = '0.00000000') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed.toFixed(8);
};

const formatUsd = (value, fallback = '0.00') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed.toFixed(2);
};

const formatTransactionHash = (value, head = 6, tail = 6) => {
  const hash = String(value || '').trim();
  if (!hash) {
    return 'N/A';
  }
  if (hash.length <= head + tail + 3) {
    return hash;
  }
  return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
};

const normalizeBlockchainForExplorer = (value) => {
  const blockchain = String(value || '').trim().toLowerCase();
  if (blockchain === 'usdt-erc20' || blockchain === 'usdc-erc20') {
    return 'ethereum';
  }
  return blockchain;
};

const normalizeNetworkMode = (value, fallback = 'mainnet') => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'mainnet' || normalized === 'testnet' ? normalized : fallback;
};

const getExplorerMeta = ({ blockchain, transactionId, networkMode }) => {
  const hash = String(transactionId || '').trim();
  if (!hash) {
    return null;
  }

  const normalizedBlockchain = normalizeBlockchainForExplorer(blockchain);
  const mode = normalizeNetworkMode(networkMode, normalizedBlockchain === 'bitcoin' ? 'testnet' : 'mainnet');

  if (normalizedBlockchain === 'bitcoin') {
    const explorerBase = mode === 'mainnet'
      ? 'https://live.blockcypher.com/btc'
      : 'https://live.blockcypher.com/btc-testnet';
    return {
      label: 'BlockCypher',
      url: `${explorerBase}/tx/${hash}/`
    };
  }

  if (normalizedBlockchain === 'litecoin') {
    const explorerBase = 'https://live.blockcypher.com/ltc';
    return {
      label: 'BlockCypher',
      url: `${explorerBase}/tx/${hash}/`
    };
  }

  if (normalizedBlockchain === 'ethereum') {
    const explorerBase = mode === 'mainnet'
      ? 'https://etherscan.io'
      : 'https://sepolia.etherscan.io';
    return {
      label: 'Etherscan',
      url: `${explorerBase}/tx/${hash}`
    };
  }

  if (normalizedBlockchain === 'solana') {
    return {
      label: 'Solscan',
      url: `https://solscan.io/tx/${hash}`
    };
  }

  return null;
};

const buildHandshakeTransactionsUrl = ({ ticketId, transactionId }) => {
  const base = `${getPrimaryClientUrl().replace(/\/$/, '')}/transactions`;
  const searchTerm = String(transactionId || ticketId || '').trim();
  if (!searchTerm) {
    return base;
  }

  const url = new URL(base);
  url.searchParams.set('search', searchTerm);
  return url.toString();
};

const resolveCoinMeta = ({ coinSymbol, blockchain }) => {
  const symbol = String(coinSymbol || '').trim().toUpperCase() || BLOCKCHAIN_TO_SYMBOL[String(blockchain || '').trim().toLowerCase()] || 'CRYPTO';
  return {
    symbol,
    meta: COIN_DISPLAY_META[symbol] || {
      label: symbol,
      iconUrl: null
    }
  };
};

const buildCompletedTicketEmbedPayload = ({ ticket, transaction }) => {
  const transactionId = String(transaction?.transactionId || '').trim();
  const blockchain = String(transaction?.blockchain || ticket?.cryptocurrency || '').trim().toLowerCase();
  const explorerMeta = getExplorerMeta({
    blockchain,
    transactionId,
    networkMode: transaction?.networkMode
  });
  const handshakeUrl = buildHandshakeTransactionsUrl({
    ticketId: transaction?.ticketId || ticket?.ticketId,
    transactionId
  });
  const { symbol, meta } = resolveCoinMeta({
    coinSymbol: transaction?.coinReceived,
    blockchain
  });

  const amountDisplay = formatAmount(transaction?.amount);
  const usdDisplay = formatUsd(transaction?.usdValue);
  const sender = String(transaction?.sender || 'Anonymous').trim() || 'Anonymous';
  const receiver = String(transaction?.receiver || 'Anonymous').trim() || 'Anonymous';
  const txDisplay = formatTransactionHash(transactionId);
  const txFieldValue = explorerMeta?.url
    ? `${txDisplay} ([View Transaction](${explorerMeta.url}))`
    : txDisplay;

  const embed = {
    title: `${meta.label} Deal Complete`,
    color: 0x22c55e,
    fields: [
      {
        name: 'Amount',
        value: `${amountDisplay} ${symbol} ($${usdDisplay} USD)`,
        inline: false
      },
      {
        name: 'Sender',
        value: sender,
        inline: true
      },
      {
        name: 'Receiver',
        value: receiver,
        inline: true
      },
      {
        name: 'Transaction',
        value: txFieldValue,
        inline: false
      }
    ],
    timestamp: new Date(transaction?.completedAt || ticket?.transactionCompletedAt || ticket?.closedAt || Date.now()).toISOString()
  };

  if (meta.iconUrl) {
    embed.thumbnail = { url: meta.iconUrl };
  }

  if (ticket?.ticketId) {
    embed.footer = {
      text: `Ticket ${ticket.ticketId}`
    };
  }

  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'View on Handshake',
            url: handshakeUrl
          }
        ]
      }
    ],
    allowed_mentions: {
      parse: []
    }
  };
};

export const postCompletedTicketDiscordEmbed = async ({ ticket, transaction }) => {
  const botToken = getDiscordBotToken();
  const channelId = getCompletedTicketChannelId();

  if (!botToken || !channelId) {
    return {
      success: false,
      skipped: true,
      message: 'Completed ticket Discord post skipped (missing DISCORD_BOT_TOKEN or DISCORD_COMPLETED_TICKET_CHANNEL_ID).'
    };
  }

  if (!transaction) {
    return {
      success: false,
      skipped: true,
      message: 'Completed ticket Discord post skipped (missing transaction payload).'
    };
  }

  const payload = buildCompletedTicketEmbedPayload({ ticket, transaction });

  try {
    await axios.post(
      `${DISCORD_API_BASE}/channels/${channelId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      skipped: false,
      message: `Posted completed ticket embed to Discord channel ${channelId}.`
    };
  } catch (error) {
    const status = error?.response?.status;
    const apiMessage = error?.response?.data?.message || error?.message || 'Unknown Discord API error';
    const message = status
      ? `Completed ticket Discord post failed (${status}): ${apiMessage}`
      : `Completed ticket Discord post failed: ${apiMessage}`;
    console.error(message);
    return {
      success: false,
      skipped: false,
      message
    };
  }
};
