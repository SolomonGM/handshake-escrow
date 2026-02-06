import TradeTicket from '../models/TradeTicket.js';
import { buildTransactionFeedItem, ensureMinimumTransactions } from '../services/transactionFeedService.js';

const parseBoolean = (value) => value === 'true' || value === '1';

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
