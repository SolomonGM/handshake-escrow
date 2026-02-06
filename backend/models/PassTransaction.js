import mongoose from 'mongoose';

const passTransactionSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  outgoingTxnId: {
    type: String,
    required: true
  },
  incomingTxnId: {
    type: String,
    default: 'NaN'
  },
  counterparty: {
    type: String,
    default: 'Handshake'
  },
  cryptocurrency: {
    type: String,
    required: true
  },
  amountUSD: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'refunded'],
    default: 'pending'
  },
  purchasedAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

passTransactionSchema.index({ user: 1, purchasedAt: -1 });

export default mongoose.model('PassTransaction', passTransactionSchema);
