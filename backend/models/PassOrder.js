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
    required: true
  },
  priceUSD: {
    type: Number,
    required: true
  },
  cryptocurrency: {
    type: String,
    required: true,
    enum: ['bitcoin', 'ethereum', 'litecoin', 'solana', 'usdt-erc20', 'usdc-erc20']
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
    balanceBefore: Number, // User pass balance before credit
    balanceAfter: Number, // User pass balance after credit
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
    enum: ['pending', 'confirmed', 'completed', 'expired', 'failed', 'timedout', 'awaiting-staff', 'refunded'],
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
  }
}, {
  timestamps: true
});

// Index for faster queries
passOrderSchema.index({ user: 1, status: 1 });
passOrderSchema.index({ paymentAddress: 1 });
passOrderSchema.index({ status: 1, expiresAt: 1 });

export default mongoose.model('PassOrder', passOrderSchema);
