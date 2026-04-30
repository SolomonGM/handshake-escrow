import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect(token = null) {
    const nextToken = token || localStorage.getItem('token');

    if (this.socket) {
      const currentToken = this.socket.auth?.token || null;
      if (nextToken && nextToken !== currentToken) {
        this.socket.auth = { token: nextToken };
        if (this.socket.connected) {
          this.socket.disconnect();
        }
      }

      if (!this.socket.connected) {
        this.socket.connect();
      }
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: {
        token: nextToken
      },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to chat server');
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from chat server');
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  // This joins chat room.
  joinChat() {
    if (this.socket) {
      this.socket.emit('join_chat');
    }
  }

  // This sends message.
  sendMessage(messageData) {
    if (this.socket) {
      this.socket.emit('send_message', messageData);
    }
  }

  // This listens for new messages.
  onNewMessage(callback) {
    if (this.socket) {
      this.socket.on('new_message', callback);
    }
  }

  // This listens for message deletion.
  onMessageDeleted(callback) {
    if (this.socket) {
      this.socket.on('message_deleted', callback);
    }
  }

  // This listens for active users update.
  onActiveUsers(callback) {
    if (this.socket) {
      this.socket.on('active_users', callback);
    }
  }

  // This listens for typing indicator.
  onUserTyping(callback) {
    if (this.socket) {
      this.socket.on('user_typing', callback);
    }
  }

  // This listens for stop typing.
  onUserStopTyping(callback) {
    if (this.socket) {
      this.socket.on('user_stop_typing', callback);
    }
  }

  // This sends typing indicator.
  typing() {
    if (this.socket) {
      this.socket.emit('typing');
    }
  }

  // This stops typing indicator.
  stopTyping() {
    if (this.socket) {
      this.socket.emit('stop_typing');
    }
  }

  // This deletes message.
  deleteMessage(messageId) {
    if (this.socket) {
      this.socket.emit('delete_message', { messageId });
    }
  }

  // This listens for errors.
  onError(callback) {
    if (this.socket) {
      this.socket.on('error', callback);
    }
  }

  // This listens for announcements.
  onAnnouncement(callback) {
    if (this.socket) {
      this.socket.on('chat_announcement', callback);
    }
  }

  // This listens for announcement list.
  onAnnouncements(callback) {
    if (this.socket) {
      this.socket.on('chat_announcements', callback);
    }
  }

  // This listens for high-priority alerts.
  onAlert(callback) {
    if (this.socket) {
      this.socket.on('chat_alert', callback);
    }
  }

  // This listens for private bot command feedback.
  onCommandFeedback(callback) {
    if (this.socket) {
      this.socket.on('command_feedback', callback);
    }
  }

  // This enters a giveaway announcement.
  enterGiveaway(giveawayId) {
    if (this.socket) {
      this.socket.emit('enter_giveaway', { giveawayId });
    }
  }

  // This emits custom event.
  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  // This listens for custom event.
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  // This removes all listeners.
  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }

  // This gets connection status.
  isConnected() {
    return this.connected && this.socket?.connected;
  }
}

// This creates singleton instance.
const socketService = new SocketService();

export default socketService;
