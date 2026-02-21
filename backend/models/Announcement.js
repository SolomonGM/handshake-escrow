import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['announcement', 'pin', 'giveaway', 'scheduled'],
    default: 'announcement',
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  imageUrl: {
    type: String,
    default: null,
    maxlength: 500
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  commandId: {
    type: String,
    default: null,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isCancelled: {
    type: Boolean,
    default: false
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  giveaway: {
    passesPerWinner: {
      type: Number,
      default: null,
      min: 1
    },
    winnerCount: {
      type: Number,
      default: null,
      min: 1
    },
    endsAt: {
      type: Date,
      default: null
    },
    entries: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    winnerIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    winnerUsernames: [{
      type: String
    }],
    status: {
      type: String,
      enum: ['open', 'completed', 'cancelled'],
      default: undefined
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  expiresAt: {
    type: Date,
    default: null // null means never expires
  }
}, {
  timestamps: true
});

// Index for active announcements
announcementSchema.index({ isActive: 1, expiresAt: 1 });
announcementSchema.index({ type: 1, isActive: 1, createdAt: -1 });
announcementSchema.index({ type: 1, scheduledFor: 1, isCancelled: 1, isActive: 1 });

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;
