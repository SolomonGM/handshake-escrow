import Message from '../models/Message.js';
import User from '../models/User.js';
import Announcement from '../models/Announcement.js';
import jwt from 'jsonwebtoken';

// Store active users
const activeUsers = new Map();

export const setupChatSocket = (io) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        // Allow anonymous viewing (no token)
        socket.user = null;
        return next();
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      // Allow connection even if token is invalid (read-only)
      socket.user = null;
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // User joins chat
    socket.on('join_chat', async (data) => {
      if (socket.user) {
        activeUsers.set(socket.user._id.toString(), {
          socketId: socket.id,
          username: socket.user.username,
          avatar: socket.user.avatar,
          rank: socket.user.rank,
          badge: socket.user.rank === 'developer' ? 'admin' : null,
          chatOpen: false
        });

        // Broadcast updated user count
        io.emit('active_users', {
          count: activeUsers.size,
          users: Array.from(activeUsers.values()).map(u => ({
            username: u.username,
            rank: u.rank
          }))
        });

        // Check if there are new messages since last view
        try {
          const user = await User.findById(socket.user._id);
          const lastViewTime = user.lastChatView || new Date(0);
          const newMessageCount = await Message.countDocuments({
            createdAt: { $gt: lastViewTime }
          });
          
          socket.emit('unread_count', { count: newMessageCount });
        } catch (error) {
          console.error('Error checking unread messages:', error);
        }

        // Send active announcement if exists
        try {
          const announcement = await Announcement.findOne({
            isActive: true,
            $or: [
              { expiresAt: null },
              { expiresAt: { $gt: new Date() } }
            ]
          }).sort({ createdAt: -1 });
          
          if (announcement) {
            socket.emit('chat_announcement', {
              title: announcement.title,
              message: announcement.message,
              imageUrl: announcement.imageUrl
            });
          }
        } catch (error) {
          console.error('Error fetching announcement:', error);
        }

        console.log(`👤 User joined: ${socket.user.username}`);
      }
    });

    // User opens chat
    socket.on('chat_opened', async () => {
      if (socket.user) {
        const userInfo = activeUsers.get(socket.user._id.toString());
        if (userInfo) {
          userInfo.chatOpen = true;
        }
        
        // Update last chat view time
        await User.findByIdAndUpdate(socket.user._id, {
          lastChatView: new Date()
        });
        
        console.log(`📖 User opened chat: ${socket.user.username}`);
      }
    });

    // User closes chat
    socket.on('chat_closed', () => {
      if (socket.user) {
        const userInfo = activeUsers.get(socket.user._id.toString());
        if (userInfo) {
          userInfo.chatOpen = false;
        }
        
        console.log(`📕 User closed chat: ${socket.user.username}`);
      }
    });

    // Send message
    socket.on('send_message', async (data) => {
      try {
        // Check if user is authenticated
        if (!socket.user) {
          socket.emit('error', { message: 'You must be signed in to send messages' });
          return;
        }

        const { message = '', mentions, replyTo, sticker } = data;

        // Check for admin commands
        if (socket.user.rank === 'developer' && message.startsWith('/')) {
          const parts = message.split(' ');
          const command = parts[0].toLowerCase();
          
          // /announce [title] | [message] | [imageUrl] - Create announcement
          if (command === '/announce') {
            const content = parts.slice(1).join(' ');
            const splitContent = content.split('|');
            const title = splitContent[0]?.trim();
            const announceMsg = splitContent[1]?.trim();
            const imageUrl = splitContent[2]?.trim() || null;
            
            if (!title || !announceMsg) {
              socket.emit('error', { message: 'Usage: /announce [title] | [message] | [imageUrl (optional)]' });
              return;
            }
            
            // Deactivate old announcements
            await Announcement.updateMany({}, { isActive: false });
            
            // Create new announcement
            const announcement = await Announcement.create({
              title: title,
              message: announceMsg,
              imageUrl: imageUrl,
              createdBy: socket.user._id,
              isActive: true
            });
            
            // Broadcast to all users
            io.emit('chat_announcement', {
              title: announcement.title,
              message: announcement.message,
              imageUrl: announcement.imageUrl
            });
            
            socket.emit('error', { message: 'Announcement created successfully!' });
            console.log(`📢 Announcement created by ${socket.user.username}${imageUrl ? ' with custom image' : ''}`);
            return;
          }
          
          // /clearannounce - Clear current announcement
          if (command === '/clearannounce') {
            await Announcement.updateMany({}, { isActive: false });
            io.emit('chat_announcement', null);
            socket.emit('error', { message: 'Announcement cleared!' });
            console.log(`🗑️ Announcement cleared by ${socket.user.username}`);
            return;
          }
          
          // /help - Show available admin commands
          if (command === '/help') {
            socket.emit('chat_help', {
              commands: [
                {
                  command: '/announce [Title] | [Message] | [ImageURL]',
                  description: 'Create a new announcement with optional custom image',
                  example: '/announce New Event | Join our giveaway! | https://example.com/image.png'
                },
                {
                  command: '/clearannounce',
                  description: 'Remove the current active announcement',
                  example: '/clearannounce'
                },
                {
                  command: '/help',
                  description: 'Show this help menu with all available commands',
                  example: '/help'
                }
              ]
            });
            console.log(`❓ Help requested by ${socket.user.username}`);
            return;
          }
        }

        // Validation - either message or sticker must be present
        if (!message.trim() && !sticker) {
          socket.emit('error', { message: 'Message or sticker is required' });
          return;
        }

        if (message && message.length > 500) {
          socket.emit('error', { message: 'Message is too long (max 500 characters)' });
          return;
        }

        // Create message in database
        const newMessage = await Message.create({
          userId: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.avatar,
          rank: socket.user.rank,
          badge: socket.user.rank === 'developer' ? 'admin' : null,
          message: message || '',
          mentions: mentions || [],
          replyTo: replyTo || null,
          sticker: sticker || null
        });

        // Populate replyTo if exists
        await newMessage.populate('replyTo', 'username message avatar rank');

        // Broadcast to all connected clients
        io.emit('new_message', {
          id: newMessage._id,
          userId: socket.user.userId, // Use the 17-digit userId string for profile modal
          username: newMessage.username,
          avatar: newMessage.avatar,
          rank: newMessage.rank,
          badge: newMessage.badge,
          message: newMessage.message,
          mentions: newMessage.mentions,
          replyTo: newMessage.replyTo,
          sticker: newMessage.sticker,
          timestamp: newMessage.createdAt
        });

        // Notify users with chat closed about new message
        activeUsers.forEach((userInfo, userId) => {
          if (!userInfo.chatOpen && userId !== socket.user._id.toString()) {
            const userSocket = io.sockets.sockets.get(userInfo.socketId);
            if (userSocket) {
              userSocket.emit('new_message_notification');
            }
          }
        });

        console.log(`💬 Message from ${socket.user.username}: ${message?.substring(0, 50)}`);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      if (socket.user) {
        socket.broadcast.emit('user_typing', {
          username: socket.user.username,
          rank: socket.user.rank
        });
      }
    });

    // Stop typing
    socket.on('stop_typing', () => {
      if (socket.user) {
        socket.broadcast.emit('user_stop_typing', {
          username: socket.user.username
        });
      }
    });

    // Delete message
    socket.on('delete_message', async (data) => {
      try {
        if (!socket.user) {
          socket.emit('error', { message: 'You must be signed in to delete messages' });
          return;
        }

        const { messageId } = data;
        const message = await Message.findById(messageId);

        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // Check permissions
        const canDelete = 
          socket.user.rank === 'developer' || 
          message.userId.toString() === socket.user._id.toString();

        if (!canDelete) {
          socket.emit('error', { message: 'You do not have permission to delete this message' });
          return;
        }

        // Soft delete
        message.isDeleted = true;
        message.deletedBy = socket.user._id;
        await message.save();

        // Broadcast deletion
        io.emit('message_deleted', { messageId });

        console.log(`🗑️ Message deleted by ${socket.user.username}`);
      } catch (error) {
        console.error('Delete message error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (socket.user) {
        activeUsers.delete(socket.user._id.toString());
        
        // Broadcast updated user count
        io.emit('active_users', {
          count: activeUsers.size,
          users: Array.from(activeUsers.values()).map(u => ({
            username: u.username,
            rank: u.rank
          }))
        });

        console.log(`👋 User left: ${socket.user.username}`);
      }
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

export default setupChatSocket;
