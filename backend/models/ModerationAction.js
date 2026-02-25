import mongoose from 'mongoose';

const moderationActionSchema = new mongoose.Schema({
  actionType: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  scope: {
    type: String,
    enum: ['chat', 'site', 'ticket', 'pass', 'system'],
    default: 'chat',
    index: true
  },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  moderatorUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  reason: {
    type: String,
    default: null,
    trim: true,
    maxlength: 1000
  },
  isPermanent: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: null
  },
  ticketId: {
    type: String,
    default: null,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

moderationActionSchema.index({ createdAt: -1 });
moderationActionSchema.index({ targetUser: 1, createdAt: -1 });
moderationActionSchema.index({ moderatorUser: 1, createdAt: -1 });
moderationActionSchema.index({ scope: 1, actionType: 1, createdAt: -1 });

const ModerationAction = mongoose.model('ModerationAction', moderationActionSchema);

export default ModerationAction;
