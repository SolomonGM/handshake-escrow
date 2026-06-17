import mongoose from 'mongoose';

const signerTransferSchema = new mongoose.Schema({
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  transferId: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['processing', 'broadcasted', 'failed', 'rejected'],
    default: 'processing',
    index: true
  },
  request: {
    type: mongoose.Schema.Types.Mixed,
    required: true
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
  broadcastedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

export default mongoose.model('SignerTransfer', signerTransferSchema);
