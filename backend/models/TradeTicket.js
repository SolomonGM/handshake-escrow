import mongoose from 'mongoose';

const tradeTicketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    },
    role: {
      type: String,
      enum: ['sender', 'receiver', null],
      default: null
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  creatorRole: {
    type: String,
    enum: ['sender', 'receiver', null],
    default: null
  },
  rolesConfirmed: {
    type: Boolean,
    default: false
  },
  roleConfirmations: {
    type: Map,
    of: Boolean,
    default: {}
  },
  dealAmount: {
    type: Number,
    default: null
  },
  dealAmountConfirmed: {
    type: Boolean,
    default: false
  },
  amountConfirmations: {
    type: Map,
    of: Boolean,
    default: {}
  },
  amountPromptShown: {
    type: Boolean,
    default: false
  },
  feesConfirmed: {
    type: Boolean,
    default: false
  },
  feeDecision: {
    type: String,
    enum: ['with-fees', 'with-pass', null],
    default: null
  },
  feeInitiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  passUsedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  feeConfirmations: {
    type: Map,
    of: Boolean,
    default: {}
  },
  transactionPromptShown: {
    type: Boolean,
    default: false
  },
  copyDetailsClickCount: {
    type: Number,
    default: 0
  },
  awaitingTransaction: {
    type: Boolean,
    default: false
  },
  botWalletAddress: {
    type: String,
    default: null
  },
  expectedAmount: {
    type: Number,
    default: null
  },
  transactionDetected: {
    type: Boolean,
    default: false
  },
  senderTransactionHash: {
    type: String,
    default: null
  },
  receiverTransactionHash: {
    type: String,
    default: null
  },
  confirmationCount: {
    type: Number,
    default: 0
  },
  transactionConfirmed: {
    type: Boolean,
    default: false
  },
  transactionTimeoutAt: {
    type: Date,
    default: null
  },
  transactionTimedOut: {
    type: Boolean,
    default: false
  },
  rescanAttempts: {
    type: Number,
    default: 0
  },
  lastRescanTime: {
    type: Date,
    default: null
  },
  fundsReleased: {
    type: Boolean,
    default: false
  },
  releaseInitiated: {
    type: Boolean,
    default: false
  },
  releaseInitiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  awaitingPayoutAddress: {
    type: Boolean,
    default: false
  },
  awaitingPayoutConfirmation: {
    type: Boolean,
    default: false
  },
  pendingPayoutAddress: {
    type: String,
    default: null
  },
  payoutAddress: {
    type: String,
    default: null
  },
  payoutAddressConfirmed: {
    type: Boolean,
    default: false
  },
  payoutTransactionHash: {
    type: String,
    default: null
  },
  privacySelections: {
    type: Map,
    of: String,
    default: {}
  },
  privacyPromptShown: {
    type: Boolean,
    default: false
  },
  transactionCompletedAt: {
    type: Date,
    default: null
  },
  closeScheduledAt: {
    type: Date,
    default: null
  },
  closeInitiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  statsApplied: {
    type: Boolean,
    default: false
  },
  broadcastedAt: {
    type: Date,
    default: null
  },
  cryptocurrency: {
    type: String,
    required: true,
    enum: ['bitcoin', 'ethereum', 'litecoin', 'solana', 'usdt-erc20', 'usdc-erc20']
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'awaiting-close', 'closing', 'completed', 'cancelled', 'disputed', 'refunded'],
    default: 'open'
  },
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isBot: {
      type: Boolean,
      default: false
    },
    content: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['text', 'system', 'embed'],
      default: 'text'
    },
    embedData: {
      title: String,
      description: String,
      color: String,
      footer: String,
      requiresAction: Boolean,
      actionType: String
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  escrowAmount: {
    type: Number
  },
  escrowAddress: {
    type: String
  },
  senderTransactionId: {
    type: String
  },
  receiverTransactionId: {
    type: String
  },
  hasShownPrompt: {
    type: Boolean,
    default: false
  },
  promptShownAt: {
    type: Date
  },
  roleSelectionTriggeredAt: {
    type: Date
  },
  roleSelectionShown: {
    type: Boolean,
    default: false
  },
  closedAt: {
    type: Date
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster queries
tradeTicketSchema.index({ creator: 1, status: 1 });
tradeTicketSchema.index({ 'participants.user': 1 });
tradeTicketSchema.index({ botWalletAddress: 1, awaitingTransaction: 1 });
tradeTicketSchema.index({ status: 1, closeScheduledAt: 1 });

// Helper method to prevent duplicate prompts
tradeTicketSchema.methods.addUniqueMessage = function(messageData) {
  // Check if a message with the same title already exists
  const isDuplicate = this.messages.some(msg => 
    msg.embedData?.title === messageData.embedData?.title &&
    msg.isBot === messageData.isBot
  );
  
  if (!isDuplicate) {
    this.messages.push(messageData);
    return true;
  }
  return false;
};

const TradeTicket = mongoose.model('TradeTicket', tradeTicketSchema);

export default TradeTicket;
