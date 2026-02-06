import Message from '../models/Message.js';
import User from '../models/User.js';

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

    // Create message
    const newMessage = await Message.create({
      userId: user._id,
      username: user.username,
      avatar: user.avatar,
      rank: user.rank,
      badge: user.rank === 'developer' ? 'admin' : null,
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
      user.rank === 'developer' || 
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
