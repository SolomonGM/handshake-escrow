import mongoose from 'mongoose';

const walletTransferSchema = new mongoose.Schema({
  transferId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  purpose: {
    type: String,
    required: true,
    enum: ['ticket_payout', 'ticket_refund', 'pass_refund']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'queued', 'broadcasted', 'confirmed', 'failed', 'manual_required'],
    default: 'pending',
    index: true
  },
  signerMode: {
    type: String,
    enum: ['external', 'local', 'manual', 'disabled'],
    default: 'external'
  },
  sourceType: {
    type: String,
    enum: ['ticket', 'pass-order'],
    required: true
  },
  sourceId: {
    type: String,
    required: true,
    index: true
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  currency: {
    type: String,
    required: true
  },
  chain: {
    type: String,
    enum: ['bitcoin', 'litecoin', 'ethereum', 'solana', null],
    default: null
  },
  token: {
    type: String,
    default: null
  },
  networkMode: {
    type: String,
    enum: ['mainnet', 'testnet', 'devnet', null],
    default: null
  },
  fromAddress: {
    type: String,
    default: null
  },
  derivationIndex: {
    type: Number,
    default: null
  },
  toAddress: {
    type: String,
    required: true
  },
  amountCrypto: {
    type: String,
    required: true
  },
  amountUsd: {
    type: Number,
    default: null
  },
  txHash: {
    type: String,
    default: null,
    index: true
  },
  confirmationNetwork: {
    type: String,
    enum: ['bitcoin', 'litecoin', 'ethereum', 'solana', 'manual', null],
    default: null
  },
  confirmations: {
    type: Number,
    default: 0
  },
  requiredConfirmations: {
    type: Number,
    default: null
  },
  lastConfirmationCheckAt: {
    type: Date,
    default: null
  },
  policy: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  signerResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  errorCode: {
    type: String,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  broadcastedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

walletTransferSchema.index({ sourceType: 1, sourceId: 1, purpose: 1 });
walletTransferSchema.index({ status: 1, confirmationNetwork: 1, broadcastedAt: 1 });

export default mongoose.model('WalletTransfer', walletTransferSchema);
