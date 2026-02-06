import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
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
  isActive: {
    type: Boolean,
    default: true
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

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;
