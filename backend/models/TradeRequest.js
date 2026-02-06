import mongoose from 'mongoose';

const tradeRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    index: true,
    unique: true,
    sparse: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['buying', 'selling'],
    required: true
  },
  // What the user is offering or looking for
  itemOffered: {
    type: String,
    required: true
  },
  itemDescription: {
    type: String,
    default: ''
  },
  // Price and currency
  priceAmount: {
    type: Number,
    required: true
  },
  priceCurrency: {
    type: String,
    required: true  // Can be 'USD', 'bitcoin', 'ethereum', etc.
  },
  // Optional: if selling/buying crypto specifically
  cryptoOffered: {
    type: String,
    enum: ['bitcoin', 'ethereum', 'litecoin', 'solana', 'usdt-erc20', 'usdc-erc20', 'other', null],
    default: null
  },
  minTrade: {
    type: Number,
    default: null
  },
  maxTrade: {
    type: Number,
    default: null
  },
  paymentMethods: [{
    type: String
  }],
  warrantyAvailable: {
    type: Boolean,
    default: false
  },
  warrantyDuration: {
    type: String,
    enum: ['none', '24h', '48h', '7days', '14days', '30days'],
    default: 'none'
  },
  termsAndConditions: {
    type: String,
    default: ''
  },
  expiresAt: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'paused', 'deleted'],
    default: 'active'
  },
  totalViews: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const generateRequestId = () => {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TR-${timePart}-${randomPart}`;
};

tradeRequestSchema.pre('validate', function(next) {
  if (!this.requestId) {
    this.requestId = generateRequestId();
  }
  next();
});

// Auto-expire logic
tradeRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TradeRequest = mongoose.model('TradeRequest', tradeRequestSchema);

export default TradeRequest;
