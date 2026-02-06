import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: null
  },
  rank: {
    type: String,
    enum: ['client', 'rich client', 'top client', 'whale', 'developer'],
    default: 'client'
  },
  badge: {
    type: String,
    enum: ['admin', 'verified', 'premium', null],
    default: null
  },
  message: {
    type: String,
    required: false,
    maxlength: 500,
    default: ''
  },
  mentions: [{
    type: String
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  sticker: {
    type: String,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Custom validation: either message or sticker must be present
messageSchema.pre('validate', function(next) {
  if (!this.message && !this.sticker) {
    this.invalidate('message', 'Either message or sticker is required');
  }
  next();
});

// Index for faster queries
messageSchema.index({ createdAt: -1 });
messageSchema.index({ userId: 1 });
messageSchema.index({ isDeleted: 1 });

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return this.createdAt.toLocaleDateString();
});

// Don't return deleted messages in JSON
messageSchema.methods.toJSON = function() {
  const obj = this.toObject();
  if (obj.isDeleted) {
    return {
      ...obj,
      message: '[Message deleted]',
      mentions: [],
      sticker: null
    };
  }
  return obj;
};

const Message = mongoose.model('Message', messageSchema);

export default Message;
