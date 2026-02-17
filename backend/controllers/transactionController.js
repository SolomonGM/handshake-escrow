import TradeTicket from '../models/TradeTicket.js';
import { buildTransactionFeedItem, ensureMinimumTransactions } from '../services/transactionFeedService.js';

const parseBoolean = (value) => value === 'true' || value === '1';
const SUPPORTED_COIN_FILTERS = new Set([
  'bitcoin',
  'ethereum',
  'litecoin',
  'solana',
  'usdt-erc20',
  'usdc-erc20'
]);
const COIN_ALIASES = {
  btc: 'bitcoin',
  eth: 'ethereum',
  ltc: 'litecoin',
  sol: 'solana',
  usdt: 'usdt-erc20',
  usdc: 'usdc-erc20'
};

const resolveCoinFilter = (value) => {
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'all') {
    return null;
  }

  if (COIN_ALIASES[normalized]) {
    return COIN_ALIASES[normalized];
  }

  if (SUPPORTED_COIN_FILTERS.has(normalized)) {
    return normalized;
  }

  return null;
};

const buildSearchableText = (transaction) => {
  const fields = [
    transaction.coinReceived,
    transaction.sender,
    transaction.receiver,
    transaction.transactionId,
    transaction.ticketId,
    transaction.blockchain
  ];

  return fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

export const getRecentTransactions = async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
    const includePlaceholders = parseBoolean(req.query.includePlaceholders);
    const minItemsRaw = Number(req.query.minItems);
    const minItems = Number.isFinite(minItemsRaw) ? Math.max(minItemsRaw, 0) : 0;

    const tickets = await TradeTicket.find({ status: 'completed' })
      .sort({ transactionCompletedAt: -1, closedAt: -1, updatedAt: -1 })
      .limit(limit)
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    const transactions = tickets
      .map(buildTransactionFeedItem)
      .filter(Boolean);

    const result = includePlaceholders
      ? ensureMinimumTransactions(transactions, minItems)
      : transactions;

    res.json({
      success: true,
      transactions: result,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
};

export const getAllTransactions = async (req, res) => {
  try {
    const pageRaw = Number(req.query.page);
    const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
    const pageSizeRaw = Number(req.query.pageSize);
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.min(Math.max(pageSizeRaw, 5), 25)
      : 12;
    const search = String(req.query.search || '').trim().toLowerCase();
    const coinFilter = resolveCoinFilter(req.query.coin);

    const baseQuery = { status: 'completed' };
    if (coinFilter) {
      baseQuery.cryptocurrency = coinFilter;
    }

    const sortCriteria = { transactionCompletedAt: -1, closedAt: -1, updatedAt: -1 };
    let transactions = [];
    let total = 0;

    if (search) {
      const matchingTickets = await TradeTicket.find(baseQuery)
        .sort(sortCriteria)
        .populate('creator', 'username userId avatar')
        .populate('participants.user', 'username userId avatar');

      const filtered = matchingTickets
        .map(buildTransactionFeedItem)
        .filter(Boolean)
        .filter((transaction) => buildSearchableText(transaction).includes(search));

      total = filtered.length;
      const startIndex = (page - 1) * pageSize;
      transactions = filtered.slice(startIndex, startIndex + pageSize);
    } else {
      total = await TradeTicket.countDocuments(baseQuery);
      const tickets = await TradeTicket.find(baseQuery)
        .sort(sortCriteria)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate('creator', 'username userId avatar')
        .populate('participants.user', 'username userId avatar');

      transactions = tickets
        .map(buildTransactionFeedItem)
        .filter(Boolean);
    }

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1)
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all transactions'
    });
  }
};
