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

  // Join chat room
  joinChat() {
    if (this.socket) {
      this.socket.emit('join_chat');
    }
  }

  // Send message
  sendMessage(messageData) {
    if (this.socket) {
      this.socket.emit('send_message', messageData);
    }
  }

  // Listen for new messages
  onNewMessage(callback) {
    if (this.socket) {
      this.socket.on('new_message', callback);
    }
  }

  // Listen for message deletion
  onMessageDeleted(callback) {
    if (this.socket) {
      this.socket.on('message_deleted', callback);
    }
  }

  // Listen for active users update
  onActiveUsers(callback) {
    if (this.socket) {
      this.socket.on('active_users', callback);
    }
  }

  // Listen for typing indicator
  onUserTyping(callback) {
    if (this.socket) {
      this.socket.on('user_typing', callback);
    }
  }

  // Listen for stop typing
  onUserStopTyping(callback) {
    if (this.socket) {
      this.socket.on('user_stop_typing', callback);
    }
  }

  // Send typing indicator
  typing() {
    if (this.socket) {
      this.socket.emit('typing');
    }
  }

  // Stop typing indicator
  stopTyping() {
    if (this.socket) {
      this.socket.emit('stop_typing');
    }
  }

  // Delete message
  deleteMessage(messageId) {
    if (this.socket) {
      this.socket.emit('delete_message', { messageId });
    }
  }

  // Listen for errors
  onError(callback) {
    if (this.socket) {
      this.socket.on('error', callback);
    }
  }

  // Listen for announcements
  onAnnouncement(callback) {
    if (this.socket) {
      this.socket.on('chat_announcement', callback);
    }
  }

  // Emit custom event
  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  // Listen for custom event
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  // Remove all listeners
  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }

  // Get connection status
  isConnected() {
    return this.connected && this.socket?.connected;
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;
