// Pass-order lifecycle helpers shared by every per-chain monitor. Kept in its
// own module so that solanaMonitor / erc20Monitor / transactionMonitor can
// all import from here without creating a circular dependency.

const TERMINAL_PASS_STATUSES = new Set([
  'cancelled', 'refunded', 'returned', 'completed', 'timedout', 'expired', 'failed'
]);

/**
 * Pass-order auto-timeout. Pass purchases auto-cancel after 10 minutes of
 * inactivity to free monitor cycles for active orders. Tickets do NOT use
 * this — they live indefinitely while warranty conditions play out.
 *
 * Returns:
 *   - true  -> order was already terminal, or just transitioned to 'timedout'
 *              (caller should stop processing this tick)
 *   - false -> order is still within the window or already had a tx detected;
 *              caller should continue scanning
 *
 * Idempotent: if the order is already in a terminal state it returns true
 * without making changes.
 */
export const expirePassOrderIfTimedOut = async (order, io = null) => {
  if (!order) return true;
  if (TERMINAL_PASS_STATUSES.has(order.status)) return true;

  // Never time out an order that's already had a payment detected — let it
  // complete confirmation even if it goes past the 10 min window.
  if (order.transactionHash) return false;

  const timeoutAt = order.timeoutDetails?.timeoutAt
    ? new Date(order.timeoutDetails.timeoutAt).getTime()
    : null;
  if (!timeoutAt || Date.now() < timeoutAt) {
    return false;
  }

  console.log(`[pass-timeout] order=${order.orderId} cryptocurrency=${order.cryptocurrency} marking timedout`);
  order.status = 'timedout';
  order.timeoutDetails = {
    ...(order.timeoutDetails || {}),
    timedOut: true,
    paymentNotes: 'No transaction detected within the 10-minute window.'
  };
  await order.save();

  if (io) {
    io.emit(`pass_order_update:${order.orderId}`, {
      orderId: order.orderId,
      status: 'timedout',
      message: 'Payment window expired. If you sent funds, please contact staff.'
    });
  }

  return true;
};

export const isTerminalPassStatus = (status) => TERMINAL_PASS_STATUSES.has(String(status || ''));
