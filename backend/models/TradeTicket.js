import mongoose from 'mongoose';

const extractDataUrls = (value) => {
  if (typeof value !== 'string') {
    return [];
  }
  const matches = value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g);
  return matches || [];
};

const normalizeMessageAttachments = (attachments) => {
  let list = attachments;

  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch (error) {
      const extracted = extractDataUrls(list);
      list = extracted.length ? extracted : [list];
    }
  }

  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((attachment) => {
    const rawUrl = typeof attachment === 'string'
      ? attachment
      : (attachment?.url || attachment?.data || attachment?.dataUrl);

    if (typeof rawUrl !== 'string' || !rawUrl.startsWith('data:image/')) {
      return null;
    }

    const size = Number(attachment?.size);
    const width = Number(attachment?.width);
    const height = Number(attachment?.height);

    return {
      url: rawUrl,
      name: attachment?.name || 'image',
      type: attachment?.type || 'image',
      size: Number.isFinite(size) ? size : undefined,
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined
    };
  }).filter(Boolean);
};

const dealAgreementSchema = new mongoose.Schema({
  version: { type: Number, default: 1, min: 1 },
  category: {
    type: String,
    enum: ['tangible_goods', 'digital_asset', 'online_service', 'other'],
    default: 'other'
  },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  deliverables: { type: [String], default: [] },
  deliveryMethod: { type: String, default: '' },
  deliveryDeadline: { type: Date, default: null },
  inspectionPeriodHours: { type: Number, default: 24, min: 1, max: 720 },
  acceptanceCriteria: { type: [String], default: [] },
  refundTerms: { type: String, default: '' },
  proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  proposedAt: { type: Date, default: null },
  digest: { type: String, default: null },
  confirmations: { type: Map, of: Boolean, default: {} },
  confirmedAt: { type: Date, default: null }
}, { _id: false });

const safetyFlagSchema = new mongoose.Schema({
  code: { type: String, required: true },
  severity: {
    type: String,
    enum: ['info', 'low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  title: { type: String, required: true },
  explanation: { type: String, default: '' },
  recommendation: { type: String, default: '' },
  detectedAt: { type: Date, default: Date.now },
  messageId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { _id: false });

const safetyAssessmentSchema = new mongoose.Schema({
  analysisId: { type: String, default: null },
  status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
  engine: { type: String, default: null },
  provider: { type: String, default: null },
  model: { type: String, default: null },
  providerError: { type: String, default: null },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  score: { type: Number, default: 0, min: 0, max: 100 },
  summary: { type: String, default: '' },
  flags: { type: [safetyFlagSchema], default: [] },
  missingTerms: { type: [String], default: [] },
  recommendedActions: { type: [String], default: [] },
  dealDigest: { type: String, default: null },
  messageCountAnalyzed: { type: Number, default: 0 },
  analyzedAt: { type: Date, default: null },
  acknowledgements: { type: Map, of: Boolean, default: {} }
}, { _id: false });

const evidenceBriefSchema = new mongoose.Schema({
  briefId: { type: String, default: null },
  engine: { type: String, default: null },
  model: { type: String, default: null },
  summary: { type: String, default: '' },
  chronology: { type: [String], default: [] },
  agreedTerms: { type: [String], default: [] },
  evidencePresent: { type: [String], default: [] },
  evidenceMissing: { type: [String], default: [] },
  inconsistencies: { type: [String], default: [] },
  onChainFacts: { type: [String], default: [] },
  disclaimer: { type: String, default: '' },
  generatedAt: { type: Date, default: null }
}, { _id: false });

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
    enum: ['with-fees', 'with-credit', 'with-pass', null],
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
    // Kept for backward compatibility with the legacy monitor. New tickets
    // populate this with the unique depositAddress derived for this ticket.
    type: String,
    default: null
  },
  depositAddress: {
    // Unique per-ticket address derived from the chain's xpub at depositIndex.
    // This is what the new address-matching monitor scans.
    type: String,
    default: null,
    index: true
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
  depositNetworkMode: {
    type: String,
    enum: ['mainnet', 'testnet', 'devnet', null],
    default: null
  },
  platformFeeUsd: {
    type: Number,
    default: 0,
    min: 0
  },
  feeCreditAppliedUsd: {
    type: Number,
    default: 0,
    min: 0
  },
  feeCreditUsedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  netPlatformFeeUsd: {
    type: Number,
    default: 0,
    min: 0
  },
  legacyPassUsed: {
    type: Boolean,
    default: false
  },
  feeBenefitRestoredAt: {
    type: Date,
    default: null
  },
  releaseAuthorization: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  payoutAuthorization: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  transactionNetworkMode: {
    type: String,
    enum: ['mainnet', 'testnet', 'devnet', null],
    default: null
  },
  expectedAmount: {
    type: Number,
    default: null
  },
  expectedCryptoAmount: {
    type: Number,
    default: null
  },
  exchangeRateUsed: {
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
  payoutNetworkMode: {
    type: String,
    enum: ['mainnet', 'testnet', 'devnet', null],
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
  privacyPromptShownAt: {
    // Used to auto-close a completed ticket 10 minutes after the Broadcast
    // Privacy prompt was shown if neither participant has made a selection.
    type: Date,
    default: null
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
  refundedAt: {
    type: Date,
    default: null
  },
  refundedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  refundTargetRole: {
    type: String,
    enum: ['sender', 'receiver', null],
    default: null
  },
  refundReason: {
    type: String,
    default: null
  },
  safetyReviewRequired: {
    // Explicitly enabled on new tickets. The false default preserves legacy
    // in-flight tickets created before this workflow existed.
    type: Boolean,
    default: false
  },
  dealAgreement: {
    type: dealAgreementSchema,
    default: null
  },
  safetyAssessment: {
    type: safetyAssessmentSchema,
    default: null
  },
  liveSafetySignals: {
    type: [safetyFlagSchema],
    default: []
  },
  aiEvidenceBrief: {
    type: evidenceBriefSchema,
    default: null
  },
  cryptocurrency: {
    type: String,
    required: true,
    enum: ['bitcoin', 'ethereum', 'litecoin', 'solana', 'usdt-erc20', 'usdc-erc20', 'usdt-spl', 'usdc-spl']
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
      default: ''
    },
    type: {
      type: String,
      enum: ['text', 'system', 'embed'],
      default: 'text'
    },
    attachments: {
      // Uses Mixed to tolerate legacy string payloads, normalize via setter.
      type: [mongoose.Schema.Types.Mixed],
      default: [],
      set: normalizeMessageAttachments
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
// Hot monitor scan: every 3s transactionMonitor pulls
//   { awaitingTransaction: true, transactionConfirmed: false }
// then dispatches per depositChain. Covering compound index removes
// any need to scan the full collection as tickets accumulate.
tradeTicketSchema.index({ awaitingTransaction: 1, transactionConfirmed: 1, depositChain: 1 });
// Broadcast Privacy auto-close sweep filter.
tradeTicketSchema.index({ status: 1, privacyPromptShownAt: 1 });

tradeTicketSchema.pre('validate', function(next) {
  if (Array.isArray(this.messages)) {
    this.messages.forEach((message) => {
      if (!message) return;
      if (message.attachments !== undefined) {
        message.attachments = normalizeMessageAttachments(message.attachments);
      }
    });
  }
  next();
});

// Helper method to prevent duplicate prompts
tradeTicketSchema.methods.addUniqueMessage = function(messageData) {
  // This check determines whether a bot prompt with the same title already exists so duplicate prompts are avoided.
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

