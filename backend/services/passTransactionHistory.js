import PassTransaction from '../models/PassTransaction.js';

const getHistoryStatus = (order, overrideStatus) => {
  if (overrideStatus) return overrideStatus;
  if (order?.status === 'completed') return 'completed';
  if (order?.status === 'refunded') return 'refunded';
  return 'pending';
};

const getPurchasedAt = (order, status) => {
  if (status === 'completed' && order?.completedAt) return order.completedAt;
  return order?.transactionDetails?.detectedAt || order?.createdAt || new Date();
};

export const upsertPassTransactionHistory = async (order, overrideStatus = null) => {
  if (!order?.transactionHash) {
    return null;
  }

  const userId = order.user?._id || order.user;
  const status = getHistoryStatus(order, overrideStatus);
  const purchasedAt = getPurchasedAt(order, status);

  const update = {
    orderId: order.orderId,
    user: userId,
    outgoingTxnId: order.transactionHash,
    incomingTxnId: 'NaN',
    counterparty: 'Handshake',
    cryptocurrency: order.cryptocurrency?.toUpperCase() || 'UNKNOWN',
    amountUSD: order.priceUSD,
    status,
    purchasedAt
  };

  return PassTransaction.findOneAndUpdate(
    { orderId: order.orderId, user: userId },
    { $set: update },
    { new: true, upsert: true }
  );
};

// TODO: When refund support is added, call upsertPassTransactionHistory(order, 'refunded') after processing.
