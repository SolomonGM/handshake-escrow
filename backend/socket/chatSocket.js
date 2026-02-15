import Message from '../models/Message.js';
import User from '../models/User.js';
import Announcement from '../models/Announcement.js';
import jwt from 'jsonwebtoken';
import { isDeveloperUser, isStaffUser } from '../utils/staffUtils.js';

// Store active users
const activeUsers = new Map();

const parseDurationToMs = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d+)(s|m|h|d|w)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = (match[2] || 'm').toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };
  return amount * (multipliers[unit] || multipliers.m);
};

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

const findUserByIdentifier = async (identifier) => {
  if (!identifier) return null;
  const raw = identifier.startsWith('@') ? identifier.slice(1) : identifier;
  if (!raw) return null;
  if (/^\d{17}$/.test(raw)) {
    return User.findOne({ userId: raw });
  }
  return User.findOne({ username: new RegExp(`^${raw}$`, 'i') });
};

const moderationCommands = [
  {
    command: '/mute @user [reason]',
    description: 'Mute a user indefinitely in chat',
    example: '/mute @scammer spamming'
  },
  {
    command: '/timeout @user <duration> [reason]',
    description: 'Temporarily mute a user (e.g. 10m, 2h, 1d)',
    example: '/timeout @spammer 30m cooldown'
  },
  {
    command: '/unmute @user',
    description: 'Remove a user mute',
    example: '/unmute @spammer'
  },
  {
    command: '/ban @user [reason]',
    description: 'Ban a user from chat',
    example: '/ban @botfarmer abuse'
  },
  {
    command: '/unban @user',
    description: 'Remove a chat ban',
    example: '/unban @user'
  },
  {
    command: '/help',
    description: 'Show this help menu',
    example: '/help'
  }
];

const announcementCommands = [
  {
    command: '/announce [Title] | [Message] | [ImageURL]',
    description: 'Create a new announcement with optional custom image',
    example: '/announce New Event | Join our giveaway! | https://example.com/image.png'
  },
  {
    command: '/clearannounce',
    description: 'Remove the current active announcement',
    example: '/clearannounce'
  }
];

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
          badge: socket.user.rank === 'developer' ? 'developer' : null,
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
        const trimmedMessage = typeof message === 'string' ? message.trim() : '';

        const freshUser = await User.findById(socket.user._id).select('-password');
        if (!freshUser) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        socket.user = freshUser;

        const moderationBlock = await resolveChatModerationBlock(freshUser);
        if (moderationBlock.blocked) {
          socket.emit('error', { message: moderationBlock.message, showToUser: true });
          return;
        }

        const isDeveloper = isDeveloperUser(socket.user);
        const isStaff = isStaffUser(socket.user);

        if (trimmedMessage.startsWith('/')) {
          const parts = trimmedMessage.split(' ');
          const command = parts[0].toLowerCase();
          const args = parts.slice(1);

          if (command === '/help') {
            if (!isStaff) {
              socket.emit('error', { message: 'No staff commands available.' });
              return;
            }

            const sections = [
              {
                title: 'Moderation',
                commands: moderationCommands
              }
            ];

            if (isDeveloper) {
              sections.unshift({
                title: 'Announcements',
                commands: announcementCommands
              });
            }

            socket.emit('chat_help', {
              title: isDeveloper ? 'Staff Commands' : 'Moderator Commands',
              subtitle: isDeveloper ? 'Developer + moderation tools' : 'Moderation tools for staff',
              sections,
              footer: 'Commands are restricted to staff roles.'
            });
            console.log(`❓ Help requested by ${socket.user.username}`);
            return;
          }

          if (command === '/announce' || command === '/clearannounce') {
            if (!isDeveloper) {
              socket.emit('error', { message: 'Only developers can use announcement commands.', showToUser: true });
              return;
            }

            if (command === '/announce') {
              const content = args.join(' ');
              const splitContent = content.split('|');
              const title = splitContent[0]?.trim();
              const announceMsg = splitContent[1]?.trim();
              const imageUrl = splitContent[2]?.trim() || null;

              if (!title || !announceMsg) {
                socket.emit('error', { message: 'Usage: /announce [title] | [message] | [imageUrl (optional)]' });
                return;
              }

              await Announcement.updateMany({}, { isActive: false });

              const announcement = await Announcement.create({
                title,
                message: announceMsg,
                imageUrl,
                createdBy: socket.user._id,
                isActive: true
              });

              io.emit('chat_announcement', {
                title: announcement.title,
                message: announcement.message,
                imageUrl: announcement.imageUrl
              });

              socket.emit('error', { message: 'Announcement created successfully!' });
              console.log(`📢 Announcement created by ${socket.user.username}${imageUrl ? ' with custom image' : ''}`);
              return;
            }

            await Announcement.updateMany({}, { isActive: false });
            io.emit('chat_announcement', null);
            socket.emit('error', { message: 'Announcement cleared!' });
            console.log(`🗑️ Announcement cleared by ${socket.user.username}`);
            return;
          }

          if (
            command === '/mute' ||
            command === '/unmute' ||
            command === '/timeout' ||
            command === '/ban' ||
            command === '/unban'
          ) {
            if (!isStaff) {
              socket.emit('error', { message: 'You do not have permission to use moderation commands.', showToUser: true });
              return;
            }

            const targetArg = args[0];
            const targetUser = await findUserByIdentifier(targetArg || '');

            if (!targetArg || !targetUser) {
              socket.emit('error', { message: 'User not found. Provide @username or 17-digit user ID.', showToUser: true });
              return;
            }

            if (targetUser._id.toString() === socket.user._id.toString()) {
              socket.emit('error', { message: 'You cannot moderate yourself.', showToUser: true });
              return;
            }

            if (command === '/mute') {
              const reason = args.slice(1).join(' ').trim() || null;
              await User.findByIdAndUpdate(targetUser._id, {
                $set: {
                  'chatModeration.isMuted': true,
                  'chatModeration.mutedUntil': null,
                  'chatModeration.mutedReason': reason,
                  'chatModeration.mutedBy': socket.user._id
                }
              });
              socket.emit('error', { message: `Muted @${targetUser.username}.`, showToUser: true });
              return;
            }

            if (command === '/timeout') {
              const durationArg = args[1];
              const durationMs = parseDurationToMs(durationArg);
              if (!durationMs) {
                socket.emit('error', { message: 'Usage: /timeout @user <duration> [reason]', showToUser: true });
                return;
              }
              const reason = args.slice(2).join(' ').trim() || null;
              const mutedUntil = new Date(Date.now() + durationMs);
              await User.findByIdAndUpdate(targetUser._id, {
                $set: {
                  'chatModeration.isMuted': true,
                  'chatModeration.mutedUntil': mutedUntil,
                  'chatModeration.mutedReason': reason,
                  'chatModeration.mutedBy': socket.user._id
                }
              });
              socket.emit('error', { message: `Timed out @${targetUser.username} until ${mutedUntil.toLocaleString()}.`, showToUser: true });
              return;
            }

            if (command === '/unmute') {
              await User.findByIdAndUpdate(targetUser._id, {
                $set: {
                  'chatModeration.isMuted': false,
                  'chatModeration.mutedUntil': null,
                  'chatModeration.mutedReason': null,
                  'chatModeration.mutedBy': null
                }
              });
              socket.emit('error', { message: `Unmuted @${targetUser.username}.`, showToUser: true });
              return;
            }

            if (command === '/ban') {
              const reason = args.slice(1).join(' ').trim() || null;
              await User.findByIdAndUpdate(targetUser._id, {
                $set: {
                  'chatModeration.isBanned': true,
                  'chatModeration.bannedUntil': null,
                  'chatModeration.bannedReason': reason,
                  'chatModeration.bannedBy': socket.user._id
                }
              });
              socket.emit('error', { message: `Banned @${targetUser.username} from chat.`, showToUser: true });
              return;
            }

            if (command === '/unban') {
              await User.findByIdAndUpdate(targetUser._id, {
                $set: {
                  'chatModeration.isBanned': false,
                  'chatModeration.bannedUntil': null,
                  'chatModeration.bannedReason': null,
                  'chatModeration.bannedBy': null
                }
              });
              socket.emit('error', { message: `Unbanned @${targetUser.username}.`, showToUser: true });
              return;
            }
          }

          if (isStaff) {
            socket.emit('error', { message: 'Unknown command. Type /help to view staff commands.', showToUser: true });
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
          badge: socket.user.rank === 'developer' ? 'developer' : null,
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
          isStaffUser(socket.user) || 
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
