import Message from '../models/Message.js';
import User from '../models/User.js';
import { isStaffUser } from '../utils/staffUtils.js';
import { checkRapidMessageSpam } from '../utils/chatSpamGuard.js';

const resolveChatModerationBlock = async (user) => {
  const moderation = user?.chatModeration || {};
  const now = new Date();
  const updates = {};

  if (moderation.isBanned) {
    if (moderation.bannedUntil && moderation.bannedUntil <= now) {
      updates['chatModeration.isBanned'] = false;
      updates['chatModeration.bannedUntil'] = null;
      updates['chatModeration.bannedReason'] = null;
      updates['chatModeration.bannedBy'] = null;
    } else {
      const untilText = moderation.bannedUntil
        ? ` until ${new Date(moderation.bannedUntil).toLocaleString()}`
        : '';
      return {
        blocked: true,
        message: `You are banned from chat${untilText}.`
      };
    }
  }

  if (moderation.isMuted) {
    if (moderation.mutedUntil && moderation.mutedUntil <= now) {
      updates['chatModeration.isMuted'] = false;
      updates['chatModeration.mutedUntil'] = null;
      updates['chatModeration.mutedReason'] = null;
      updates['chatModeration.mutedBy'] = null;
    } else {
      const untilText = moderation.mutedUntil
        ? ` until ${new Date(moderation.mutedUntil).toLocaleString()}`
        : '';
      return {
        blocked: true,
        message: `You are muted in chat${untilText}.`
      };
    }
  }

  if (Object.keys(updates).length > 0 && user?._id) {
    await User.findByIdAndUpdate(user._id, { $set: updates });
  }

  return { blocked: false };
};

// Get chat messages with pagination
export const getMessages = async (req, res) => {
  try {
    const { limit = 50, before } = req.query;
    
    const query = { isDeleted: false };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'userId') // Populate the userId string field
      .populate('replyTo', 'username message avatar rank')
      .lean();

    // Reverse to get chronological order and map to include userId string
    const formattedMessages = messages.reverse().map(msg => ({
      ...msg,
      userId: msg.userId?.userId || null // Extract the userId string field
    }));

    res.json({
      success: true,
      messages: formattedMessages,
      count: formattedMessages.length
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
};

// Send a message (via HTTP, WebSocket is preferred)
export const sendMessage = async (req, res) => {
  try {
    const { message = '', mentions, replyTo, sticker } = req.body;
    const user = req.user;

    const moderationCheck = await resolveChatModerationBlock(user);
    if (moderationCheck.blocked) {
      return res.status(403).json({
        success: false,
        message: moderationCheck.message,
        showToUser: true
      });
    }

    // Validation - either message or sticker must be present
    if (!message.trim() && !sticker) {
      return res.status(400).json({
        success: false,
        message: 'Message or sticker is required'
      });
    }

    if (message && message.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Message is too long (max 500 characters)'
      });
    }

    const spamCheck = checkRapidMessageSpam(user._id);
    if (spamCheck.blocked) {
      return res.status(429).json({
        success: false,
        message: spamCheck.message,
        showToUser: true,
        cooldownSeconds: spamCheck.cooldownSeconds
      });
    }

    // Create message
    const newMessage = await Message.create({
      userId: user._id,
      username: user.username,
      avatar: user.avatar,
      rank: user.rank,
      badge: user.rank === 'developer' ? 'developer' : null,
      message: message || '',
      mentions: mentions || [],
      replyTo: replyTo || null,
      sticker: sticker || null
    });

    // Populate replyTo if exists
    await newMessage.populate('replyTo', 'username message avatar rank');

    res.status(201).json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
};

// Delete a message (admin/developer only or own message)
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const user = req.user;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check permissions
    const canDelete = 
      isStaffUser(user) || 
      message.userId.toString() === user._id.toString();

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this message'
      });
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedBy = user._id;
    await message.save();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message'
    });
  }
};

// Get chat statistics (admin only)
export const getChatStats = async (req, res) => {
  try {
    if (req.user.rank !== 'developer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const totalMessages = await Message.countDocuments({ isDeleted: false });
    const deletedMessages = await Message.countDocuments({ isDeleted: true });
    const todayMessages = await Message.countDocuments({
      isDeleted: false,
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });

    // Most active users
    const activeUsers = await Message.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { username: '$user.username', count: 1 } }
    ]);

    res.json({
      success: true,
      stats: {
        totalMessages,
        deletedMessages,
        todayMessages,
        activeUsers
      }
    });
  } catch (error) {
    console.error('Get chat stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat statistics'
    });
  }
};
