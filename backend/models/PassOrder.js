import mongoose from 'mongoose';

const passOrderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  passId: {
    type: String,
    required: true
  },
  passType: {
    type: String,
    required: true // Single, Premium, Rhino
  },
  passCount: {
    type: Number,
    default: 0,
    min: 0
  },
  creditAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  priceUSD: {
    type: Number,
    required: true
  },
  cryptocurrency: {
    type: String,
    required: true,
    enum: ['bitcoin', 'ethereum', 'litecoin', 'solana', 'usdt-erc20', 'usdc-erc20', 'usdt-spl', 'usdc-spl']
  },
  depositChain: {
    type: String,
    enum: ['bitcoin', 'litecoin', 'ethereum', 'solana', null],
    default: null
  },
  depositToken: {
    type: String,
    enum: ['native', 'usdt-erc20', 'usdc-erc20', 'usdt-spl', 'usdc-spl', null],
    default: null
  },
  depositIndex: {
    type: Number,
    default: null,
    min: 0
  },
  networkMode: {
    type: String,
    enum: ['mainnet', 'testnet', 'devnet'],
    default: 'mainnet'
  },
  cryptoAmount: {
    type: Number,
    required: true
  },
  paymentAddress: {
    type: String,
    required: true
  },
  transactionHash: {
    type: String,
    default: null
  },
  // Detailed transaction tracking for business records
  transactionDetails: {
    detectedAt: Date,
    confirmedAt: Date,
    actualAmountReceived: mongoose.Schema.Types.Mixed, // Actual satoshis/wei received (Number or String for large values)
    actualAmountReceivedCrypto: Number, // Actual crypto amount (e.g., 0.3333 LTC or 0.00142857 ETH)
    expectedAmount: Number, // Expected crypto amount
    amountDifference: Number, // Difference from expected
    percentageDifference: Number, // Percentage variance
    networkFee: Number, // Network fee if applicable (gas fee for Ethereum)
    confirmationTime: Number, // Time taken to get required confirmations (in minutes)
    blockHeight: Number, // Block number where transaction was included
    fromAddress: String, // Sender's address
    balanceBefore: Number, // User fee-credit balance before purchase
    balanceAfter: Number, // User fee-credit balance after purchase
    isOverpayment: { type: Boolean, default: false },
    isUnderpayment: { type: Boolean, default: false },
    paymentNotes: String // Any special notes about the payment (includes Etherscan/BlockCypher links)
  },
  // Timeout tracking
  timeoutDetails: {
    timeoutAt: Date, // When the 10-minute timeout expires
    timedOut: { type: Boolean, default: false },
    staffContactRequested: { type: Boolean, default: false },
    manualVerification: { type: Boolean, default: false },
    staffNotes: String
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'expired', 'failed', 'timedout', 'awaiting-staff', 'refunded', 'returned', 'cancelled'],
    default: 'pending'
  },
  confirmations: {
    type: Number,
    default: 0
  },
  expiresAt: {
    type: Date,
    required: true
  },
  completedAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  cancelReason: {
    type: String
  },
  returnedAt: {
    type: Date
  },
  returnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  returnReason: {
    type: String
  },
  refundedAt: {
    type: Date
  },
  refundedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  refundAddress: {
    type: String
  },
  refundCoin: {
    type: String
  },
  refundMessage: {
    type: String
  },
  refundTransactionHash: {
    type: String
  },
  adminActions: [{
    action: {
      type: String,
      enum: ['return', 'force-complete', 'refund']
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    details: {
      type: String
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for faster queries
passOrderSchema.index({ user: 1, status: 1 });
passOrderSchema.index({ paymentAddress: 1 });
passOrderSchema.index({ status: 1, expiresAt: 1 });
// Hot monitor path: every 3s the transactionMonitor cron does
//   PassOrder.find({ cryptocurrency: X, status: { $in: [...] } })
// per chain. Compound index keeps that query cheap even with thousands
// of historical (terminal) orders sitting in the collection.
passOrderSchema.index({ cryptocurrency: 1, status: 1 });
// Pass-order timeout sweep filter — quickly finds orders nearing their
// 10-min deadline without scanning terminal-state rows.
passOrderSchema.index({ status: 1, 'timeoutDetails.timeoutAt': 1 });

export default mongoose.model('PassOrder', passOrderSchema);
