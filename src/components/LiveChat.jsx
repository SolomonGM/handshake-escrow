import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import EmojiPicker from './EmojiPicker';
import StickerPicker from './StickerPicker';
import UserProfileModal from './UserProfileModal';
import socketService from '../services/socket';
import { chatAPI } from '../services/api';
import { getRankBadge, getRankColor, getRankGradientClass, getRankLabel } from '../utils/rankDisplay';

const LiveChat = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [activeAnnouncementIndex, setActiveAnnouncementIndex] = useState(0);
  const [activeAlert, setActiveAlert] = useState(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpData, setHelpData] = useState(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [chatCooldownSeconds, setChatCooldownSeconds] = useState(0);
  const [announcementNow, setAnnouncementNow] = useState(Date.now());
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const commandFeedbackTimersRef = useRef(new Map());
  const MESSAGE_HEIGHT = 120; // Approximate height of each message
  const RENDER_THRESHOLD = 100; // Number of messages before we start optimizing

  // Available languages
  const languages = [
    { code: 'en', name: 'ENGLISH', flag: '🇬🇧' }
  ];
  // Fallback command list used when help payload is unavailable
  const fallbackCommands = [
    {
      command: '/help',
      description: 'Show staff command help',
      example: '/help'
    },
    {
      command: '/pin <message>',
      description: 'Pin a message (staff only)',
      example: '/pin Stay civil in chat.'
    }
  ];

  const toChatMessage = (msg = {}) => ({
    id: msg.id || msg._id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: msg.userId ?? (msg.isBot ? 'N/A' : null),
    username: msg.username || 'Unknown',
    avatar: msg.avatar || null,
    rank: msg.rank || (msg.isBot ? 'bot' : 'client'),
    badge: msg.badge || null,
    role: msg.role || (msg.isBot ? 'BOT' : null),
    message: msg.message || '',
    sticker: msg.sticker || null,
    timestamp: new Date(msg.timestamp || msg.createdAt || Date.now()),
    mentions: msg.mentions || [],
    replyTo: msg.replyTo || null,
    replies: [],
    isBot: Boolean(msg.isBot)
  });

  // Connect to WebSocket and load message history
  useEffect(() => {
    // Disconnect previous connection if exists
    socketService.disconnect();

    // Get current token
    const token = localStorage.getItem('token');
    
    // Connect to socket with token
    socketService.connect(token);
    setIsConnected(socketService.isConnected());

    // Load message history from API
    const loadMessages = async () => {
      try {
        const response = await chatAPI.getMessages(50);
        if (response.success && response.messages) {
          console.log('Loaded messages:', response.messages); // Debug log
          const loadedMessages = response.messages.map((msg) => toChatMessage({
            id: msg._id,
            userId: msg.userId,
            username: msg.username,
            avatar: msg.avatar,
            rank: msg.rank,
            badge: msg.badge,
            message: msg.message,
            sticker: msg.sticker,
            createdAt: msg.createdAt,
            mentions: msg.mentions || [],
            replyTo: msg.replyTo,
            isBot: msg.isBot
          }));
          
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        setError('Failed to load chat history');
      }
    };

    loadMessages();

    // Join chat room
    socketService.joinChat();

    // Listen for unread count from server
    socketService.on('unread_count', ({ count }) => {
      if (count > 0 && !isOpen) {
        setHasNewMessages(true);
      }
    });

    // Listen for new message notifications (when chat is closed)
    socketService.on('new_message_notification', () => {
      console.log('New message notification received');
      setHasNewMessages(true);
    });

    // Listen for new messages
    socketService.onNewMessage((newMsg) => {
      console.log('Received new message:', newMsg); // Debug log
      
      setMessages((prev) => [...prev, toChatMessage(newMsg)]);
    });

    // Listen for message deletions
    socketService.onMessageDeleted(({ messageId }) => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    });

    // Listen for errors
    socketService.onError((err) => {
      const nextError = typeof err === 'string'
        ? { message: err, showToUser: false, cooldownSeconds: 0 }
        : {
          message: err?.message || 'An error occurred',
          showToUser: Boolean(err?.showToUser),
          cooldownSeconds: Number(err?.cooldownSeconds || 0)
        };
      setError(nextError);
      if (nextError.cooldownSeconds > 0) {
        setChatCooldownSeconds(nextError.cooldownSeconds);
      }
      setTimeout(() => setError(null), 5000);
    });

    // Listen for announcement list
    socketService.onAnnouncements((data) => {
      const nextAnnouncements = Array.isArray(data) ? data : [];
      setAnnouncements(nextAnnouncements);
    });

    // Listen for command feedback messages (private bot responses)
    socketService.onCommandFeedback((botMessage) => {
      const commandMessage = toChatMessage(botMessage);
      const ttlMs = Number(botMessage?.ttlMs || 30000);

      setMessages((prev) => [...prev, commandMessage]);

      const existingTimer = commandFeedbackTimersRef.current.get(commandMessage.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timerId = setTimeout(() => {
        setMessages((prev) => prev.filter((entry) => entry.id !== commandMessage.id));
        commandFeedbackTimersRef.current.delete(commandMessage.id);
      }, Math.max(0, ttlMs));

      commandFeedbackTimersRef.current.set(commandMessage.id, timerId);
    });

    // Listen for high-priority alerts
    socketService.onAlert((alertPayload) => {
      if (alertPayload?.message) {
        setActiveAlert(alertPayload);
      }
    });

    // Listen for help command response
    socketService.on('chat_help', (data) => {
      console.log('Received help data:', data);
      setHelpData(data);
      setShowHelpModal(true);
    });

    // Cleanup on unmount or user change
    return () => {
      commandFeedbackTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      commandFeedbackTimersRef.current.clear();
      socketService.removeAllListeners();
    };
  }, [user]); // Re-run when user changes

  // Handle chat open/close
  useEffect(() => {
    if (isOpen) {
      // Clear notification badge
      setHasNewMessages(false);
      // Notify server that chat is opened
      if (user) {
        socketService.emit('chat_opened');
      }
    } else {
      // Notify server that chat is closed
      if (user) {
        socketService.emit('chat_closed');
      }
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (chatCooldownSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setChatCooldownSeconds((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [chatCooldownSeconds]);

  useEffect(() => {
    if (announcements.length === 0) {
      setActiveAnnouncementIndex(0);
      return;
    }

    if (activeAnnouncementIndex > announcements.length - 1) {
      setActiveAnnouncementIndex(0);
    }
  }, [announcements, activeAnnouncementIndex]);

  useEffect(() => {
    const hasCountdown = announcements.some((item) => item?.type === 'giveaway' && item?.giveaway?.endsAt);
    if (!hasCountdown) {
      return undefined;
    }

    const timer = setInterval(() => {
      setAnnouncementNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [announcements]);

  // Auto scroll to bottom (only if user is not scrolling)
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current && !isUserScrolling) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Scroll to specific message
  const scrollToMessage = (messageId) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight the message briefly
      messageElement.classList.add('highlight-message');
      setTimeout(() => {
        messageElement.classList.remove('highlight-message');
      }, 2000);
    }
  };

  // Handle scroll event to show/hide scroll-to-bottom button and optimize rendering
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollButton(!isNearBottom);

    // User is manually scrolling
    setIsUserScrolling(!isNearBottom);

    // Performance optimization: Only render visible messages if we have many messages
    if (messages.length > RENDER_THRESHOLD) {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      
      // Calculate which messages are visible
      const firstVisible = Math.floor(scrollTop / MESSAGE_HEIGHT);
      const lastVisible = Math.ceil((scrollTop + containerHeight) / MESSAGE_HEIGHT);
      
      // Add buffer above and below (20 messages on each side)
      const bufferSize = 20;
      const start = Math.max(0, firstVisible - bufferSize);
      const end = Math.min(messages.length, lastVisible + bufferSize);
      
      setVisibleRange({ start, end });
    } else {
      // If we have fewer messages, render all
      setVisibleRange({ start: 0, end: messages.length });
    }

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Reset user scrolling after 3 seconds of no scroll
    scrollTimeoutRef.current = setTimeout(() => {
      if (isNearBottom) {
        setIsUserScrolling(false);
      }
    }, 3000);
  };

  // Update visible range when messages change
  useEffect(() => {
    if (messages.length <= RENDER_THRESHOLD) {
      setVisibleRange({ start: 0, end: messages.length });
    } else {
      // Keep showing the latest messages
      setVisibleRange({ start: Math.max(0, messages.length - 50), end: messages.length });
    }
  }, [messages.length]);

  // Auto scroll when new messages arrive (only if not manually scrolling)
  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  // Parse message for mentions
  const parseMessage = (text) => {
    const mentionRegex = /@(\w+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }
      // Add mention
      parts.push({
        type: 'mention',
        content: match[0]
      });
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  };

  // Send message via WebSocket
  const handleSendMessage = (e, stickerUrl = null) => {
    if (e) e.preventDefault();

    if (chatCooldownSeconds > 0) {
      setError({
        message: `Slow down. You can send another message in ${chatCooldownSeconds}s.`,
        showToUser: true,
        cooldownSeconds: chatCooldownSeconds
      });
      return;
    }
    
    // If sending sticker without text
    if (stickerUrl) {
      if (!user) return;
      
      socketService.sendMessage({
        message: '',
        mentions: [],
        replyTo: replyTo?._id || replyTo?.id || null,
        sticker: stickerUrl
      });
      
      setReplyTo(null);
      setShowStickerPicker(false);
      return;
    }
    
    // Regular text message
    if (!message.trim() || !user) return;

    // Extract mentions
    const mentions = message.match(/@(\w+)/g) || [];

    // Send via WebSocket
    socketService.sendMessage({
      message: message,
      mentions: mentions,
      replyTo: replyTo?._id || replyTo?.id || null,
      sticker: null
    });

    setMessage('');
    setReplyTo(null);
    setShowEmojiPicker(false);
  };

  // Handle reply
  const handleReply = (msg) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  };

  // Handle clicking on reply indicator to jump to original message
  const handleReplyClick = (replyToMsg) => {
    if (replyToMsg && replyToMsg._id) {
      scrollToMessage(replyToMsg._id);
    }
  };

  // Format timestamp
  const formatTime = (date) => {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const formatCountdown = (targetDate) => {
    if (!targetDate) return null;
    const diffMs = new Date(targetDate).getTime() - announcementNow;
    if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Ending now';

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const activeAnnouncement = announcements.length > 0
    ? announcements[activeAnnouncementIndex]
    : null;
  const hasMultipleAnnouncements = announcements.length > 1;
  const activeGiveaway = activeAnnouncement?.type === 'giveaway'
    ? activeAnnouncement.giveaway
    : null;
  const giveawayCountdown = activeGiveaway?.endsAt
    ? formatCountdown(activeGiveaway.endsAt)
    : null;

  const helpSections = helpData?.sections?.length
    ? helpData.sections
    : [{ title: 'Commands', commands: fallbackCommands }];
  const helpTitle = helpData?.title || 'Commands';
  const helpSubtitle = helpData?.subtitle || 'Available chat commands';
  const helpFooter = helpData?.footer || null;

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={onClose}
        className={`fixed left-0 top-24 z-40 transition-all duration-300 ${
          isOpen ? 'translate-x-[min(20rem,calc(100vw-3.5rem))] sm:translate-x-80' : 'translate-x-0'
        }`}
      >
        <div className="relative">
          {/* Main Button */}
          <div className="bg-n-7 hover:bg-n-6 border border-n-6 hover:border-color-4/50 rounded-r-xl px-4 py-3 shadow-xl transition-all duration-300">
            {isOpen ? (
              // Close Icon
              <svg className="w-6 h-6 text-n-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            ) : (
              // Chat Icon with online dot
              <div className="relative">
                <svg className="w-6 h-6 text-n-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {isConnected && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-color-4 border-2 border-n-7 rounded-full"></div>
                )}
              </div>
            )}
          </div>
          
          {/* Notification Badge */}
          {!isOpen && user && hasNewMessages && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-red-500 to-red-600 rounded-full shadow-lg border-2 border-n-8 animate-pulse">
            </div>
          )}
        </div>
      </button>

      {/* Chat Panel */}
      <div
        className={`fixed left-0 top-[4.75rem] lg:top-[5.25rem] bottom-0 w-[min(20rem,calc(100vw-3.5rem))] max-w-full sm:w-80 bg-n-8 border-r border-n-6 z-30 transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* User-facing moderation notices */}
        {error?.showToUser && (
          <div className="m-4 p-3 bg-yellow-500/10 border border-yellow-500/40 rounded text-yellow-300 text-xs">
            <span className="font-semibold">Notice:</span> {error.message}
          </div>
        )}

        {/* Developer-only error display */}
        {!error?.showToUser && error?.message && user?.rank === 'developer' && (
          <div className="m-4 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
            <span className="font-semibold">DEV ERROR:</span> {error.message}
          </div>
        )}

        {/* Language Selector */}
        <div className="border-b border-n-6 px-4 py-3">
          <div className="relative">
            <button
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-n-7/50 hover:bg-n-7 rounded-lg transition-all duration-200 border border-n-6/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-n-6 flex items-center justify-center">
                  <span className="text-xs text-n-3 font-bold">EN</span>
                </div>
                <span className="text-n-1 font-medium text-sm">{languages.find(l => l.code === selectedLanguage)?.name}</span>
              </div>
              <svg 
                className={`w-4 h-4 text-n-4 transition-transform duration-200 ${showLanguageDropdown ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* Dropdown */}
            {showLanguageDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-n-7 border border-n-6 rounded-lg shadow-2xl z-20 overflow-hidden">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setSelectedLanguage(lang.code);
                      setShowLanguageDropdown(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-n-6 transition-colors ${
                      selectedLanguage === lang.code ? 'bg-n-6' : ''
                    }`}
                  >
                    <div className="w-5 h-5 rounded bg-n-6 flex items-center justify-center">
                      <span className="text-xs text-n-3 font-bold">EN</span>
                    </div>
                    <span className="text-n-1 font-medium text-sm">{lang.name}</span>
                    {selectedLanguage === lang.code && (
                      <svg className="w-4 h-4 text-green-500 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Announcement Section */}
        {activeAnnouncement && (
          <div className="mx-3 my-3 bg-gradient-to-br from-n-7 to-n-8 border border-n-6 rounded-xl overflow-hidden shadow-lg">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-n-6/60">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full border border-green-500/30 bg-green-500/15 text-green-300 text-[10px] font-semibold uppercase tracking-wider">
                  {activeAnnouncement.type || 'announcement'}
                </span>
                <span className="text-n-4 text-[11px]">
                  {activeAnnouncement.commandId ? `ID ${activeAnnouncement.commandId}` : 'Live'}
                </span>
              </div>
              {hasMultipleAnnouncements && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveAnnouncementIndex((prev) => (
                      prev === 0 ? announcements.length - 1 : prev - 1
                    ))}
                    className="w-6 h-6 rounded bg-n-6 hover:bg-n-5 text-n-2 text-xs"
                    title="Previous announcement"
                  >
                    {'<'}
                  </button>
                  <span className="text-n-4 text-[11px]">
                    {activeAnnouncementIndex + 1}/{announcements.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveAnnouncementIndex((prev) => (
                      prev === announcements.length - 1 ? 0 : prev + 1
                    ))}
                    className="w-6 h-6 rounded bg-n-6 hover:bg-n-5 text-n-2 text-xs"
                    title="Next announcement"
                  >
                    {'>'}
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-start gap-4 p-4">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
                  <img
                    src={activeAnnouncement.imageUrl || '/icons/gift.png'}
                    alt="Announcement"
                    className="w-8 h-8 object-contain brightness-0 invert"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '/icons/gift.png';
                    }}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-n-1 font-bold text-sm mb-1">{activeAnnouncement.title}</h3>
                <p className="text-n-3 text-xs leading-relaxed">{activeAnnouncement.message}</p>
                {activeGiveaway && (
                  <div className="mt-3 space-y-2">
                    <div className="text-[11px] text-n-4">
                      {activeGiveaway.participantCount || 0} entered
                      {giveawayCountdown ? ` · Ends in ${giveawayCountdown}` : ''}
                    </div>
                    <button
                      type="button"
                      onClick={() => socketService.enterGiveaway(activeAnnouncement.id)}
                      disabled={!user}
                      className="w-full h-9 rounded-lg border border-[#10B981]/40 bg-[#10B981]/20 text-[#10B981] text-xs font-semibold hover:bg-[#10B981]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {user ? 'Enter Giveaway' : 'Sign In To Enter'}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
                <div className="px-2.5 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
                  <span className="text-green-400 text-xs font-semibold">LIVE</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages Container with custom scrollbar */}
        <div 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar relative"
        >
          {/* Spacer for scrolled-out messages (performance optimization) */}
          {visibleRange.start > 0 && (
            <div 
              style={{ height: `${visibleRange.start * MESSAGE_HEIGHT}px` }}
              className="flex items-center justify-center"
            >
              <div className="text-n-5 text-xs bg-n-7 px-3 py-1 rounded-full">
                {visibleRange.start} earlier messages (scroll up to view)
              </div>
            </div>
          )}

          {/* Render only visible messages */}
          {messages.slice(visibleRange.start, visibleRange.end).map((msg) => {
            const rankBadge = getRankBadge(msg.rank);
            const fallbackBadge = rankBadge ? null : getRankBadge(msg.badge);
            const badgeSrc = rankBadge || fallbackBadge;
            const badgeLabel = rankBadge ? getRankLabel(msg.rank) : (fallbackBadge ? getRankLabel(msg.badge) : '');
            const rankGradientClass = getRankGradientClass(msg.rank);

            return (
              <div
                key={msg.id}
                id={`message-${msg.id}`}
                className="group relative message-item"
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
              >
              {/* Reply indicator - clickable to jump to original */}
              {msg.replyTo && (
                <div 
                  onClick={() => handleReplyClick(msg.replyTo)}
                  className="ml-8 mb-1 p-2 bg-n-7/50 border-l-2 border-n-5 rounded text-xs cursor-pointer hover:bg-n-6/50 transition-colors"
                >
                  <p className="text-n-4">
                    Replying to <span style={{ color: getRankColor(msg.replyTo.rank) }}>{msg.replyTo.username}</span>
                  </p>
                  <p className="text-n-5 truncate">{msg.replyTo.message}</p>
                  <p className="text-n-6 text-[10px] mt-1">Click to view original message</p>
                </div>
              )}

              {/* Message */}
              <div className="flex gap-2">
                {/* Avatar - Clickable */}
                <div 
                  className={`flex-shrink-0 w-8 h-8 rounded-full overflow-hidden ${msg.userId && !msg.isBot ? 'cursor-pointer hover:ring-2 hover:ring-[#10B981]' : (msg.isBot ? 'cursor-default' : 'cursor-not-allowed opacity-70')} transition-[box-shadow,transform,opacity]`}
                  onClick={() => {
                    console.log('Avatar clicked, userId:', msg.userId);
                    if (msg.userId && !msg.isBot) {
                      setSelectedUserProfile(msg.userId);
                    } else {
                      console.warn('No userId available for this user');
                    }
                  }}
                  title={msg.userId && !msg.isBot ? `Click to view ${msg.username}'s profile` : 'Profile not available'}
                >
                  {msg.avatar ? (
                    <img
                      src={msg.avatar}
                      alt={msg.username}
                      className="w-full h-full object-cover block bg-n-6"
                      onError={(e) => {
                        // Fallback to initial if image fails to load
                        console.log('Avatar load error for:', msg.username, msg.avatar);
                        e.target.style.display = 'none';
                        const fallback = e.target.nextElementSibling;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                      onLoad={() => {
                        console.log('Avatar loaded successfully for:', msg.username, msg.avatar);
                      }}
                    />
                  ) : null}
                  <div 
                    className={`w-full h-full rounded-full flex items-center justify-center text-sm font-semibold ${msg.isBot ? 'bg-[#10B981] text-white shadow-md' : 'bg-n-6 text-n-1'}`}
                    style={{ display: msg.avatar ? 'none' : 'flex' }}
                  >
                    {msg.username.charAt(0).toUpperCase()}
                  </div>
                </div>

                {/* Message Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {/* Username with rank color */}
                    {msg.isBot ? (
                      <>
                        <span className="font-semibold text-sm text-[#10B981]">
                          {msg.username}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider border border-[#10B981]/40 text-[#10B981] bg-[#10B981]/10">
                          {msg.role || 'BOT'}
                        </span>
                      </>
                    ) : rankGradientClass ? (
                      <span className={`font-semibold text-sm ${rankGradientClass}`}>
                        {msg.username}
                      </span>
                    ) : (
                      <span
                        className="font-semibold text-sm"
                        style={{ color: getRankColor(msg.rank) }}
                      >
                        {msg.username}
                      </span>
                    )}

                    {/* Badge */}
                    {badgeSrc && (
                      <span className="w-4 h-4 flex items-center justify-center">
                        <img 
                          src={badgeSrc} 
                          alt={badgeLabel ? `${badgeLabel} badge` : 'Rank badge'} 
                          className="w-4 h-4"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      </span>
                    )}

                    {/* Timestamp */}
                    <span className="text-n-5 text-xs">{formatTime(msg.timestamp)}</span>
                  </div>

                  {/* Sticker */}
                  {msg.sticker && (
                    <div className="mt-1">
                      <img
                        src={msg.sticker}
                        alt="Sticker"
                        className="w-[120px] h-[120px] rounded-lg object-contain bg-n-6/50"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  {/* Message text with mentions */}
                  {msg.message && (
                    <div className="text-n-3 text-sm break-words">
                      {parseMessage(msg.message).map((part, idx) => (
                        <span key={idx}>
                          {part.type === 'mention' ? (
                            <span className="text-[#f97316] font-semibold bg-[#f97316]/10 px-1 rounded">
                              {part.content}
                            </span>
                          ) : (
                            part.content
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reply Button (on hover) */}
                {user && !msg.isBot && hoveredMessageId === msg.id && (
                  <button
                    onClick={() => handleReply(msg)}
                    className="absolute right-0 top-0 p-1.5 bg-n-6 rounded hover:bg-n-5 transition-colors opacity-0 group-hover:opacity-100"
                    title="Reply"
                  >
                    <svg className="w-4 h-4 text-n-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                )}
              </div>
              </div>
            );
          })}

          {/* Spacer for scrolled-out messages at bottom */}
          {visibleRange.end < messages.length && (
            <div 
              style={{ height: `${(messages.length - visibleRange.end) * MESSAGE_HEIGHT}px` }}
              className="flex items-center justify-center"
            >
              <div className="text-n-5 text-xs bg-n-7 px-3 py-1 rounded-full">
                {messages.length - visibleRange.end} more messages (scroll down to view)
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to Bottom Button */}
        {showScrollButton && (
          <button
            onClick={() => {
              setIsUserScrolling(false);
              scrollToBottom();
            }}
            className="absolute bottom-24 right-6 z-10 bg-n-6 hover:bg-n-5 text-n-1 rounded-full p-3 shadow-lg transition-all duration-300 animate-bounce-subtle"
            title="Scroll to latest messages"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}

        {/* Message Input */}
        <div className="border-t border-n-6 p-3 sm:p-4 relative">
          {/* Emoji Picker */}
          {showEmojiPicker && (
            <EmojiPicker
              onSelect={(emoji) => setMessage(message + emoji)}
              onClose={() => setShowEmojiPicker(false)}
            />
          )}

          {/* Sticker Picker */}
          {showStickerPicker && (
            <StickerPicker
              onSelect={(stickerUrl) => {
                // Send sticker as a separate message or append to text
                if (stickerUrl.startsWith('data:') || stickerUrl.startsWith('/') || stickerUrl.startsWith('http')) {
                  // It's an image sticker, send it directly
                  handleSendMessage(null, stickerUrl);
                } else {
                  // It's text/emoji, add to message
                  setMessage(message + stickerUrl);
                }
              }}
              onClose={() => setShowStickerPicker(false)}
            />
          )}

          {/* Reply Preview */}
          {replyTo && (
            <div className="mb-2 p-2 bg-n-7 rounded-lg flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-n-4">
                  Replying to <span style={{ color: getRankColor(replyTo.rank) }}>{replyTo.username}</span>
                </p>
                <p className="text-xs text-n-5 truncate">{replyTo.message}</p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="ml-2 text-n-4 hover:text-n-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {user ? (
            <form onSubmit={handleSendMessage} className="space-y-2">
              {chatCooldownSeconds > 0 && (
                <p className="text-xs text-yellow-300">
                  Slow down. You can send messages again in {chatCooldownSeconds}s.
                </p>
              )}
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={chatCooldownSeconds > 0 ? 'Slow down...' : 'Type a message...'}
                  disabled={chatCooldownSeconds > 0}
                  className={`w-full px-3 py-2 bg-n-7 border border-n-6 rounded-lg text-n-1 text-sm placeholder-n-5 focus:outline-none focus:border-n-5 pr-20 ${
                    chatCooldownSeconds > 0 ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                  maxLength={500}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  {/* Emoji Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmojiPicker(!showEmojiPicker);
                      setShowStickerPicker(false);
                    }}
                    disabled={chatCooldownSeconds > 0}
                    className={`p-1 transition-colors ${
                      showEmojiPicker ? 'text-color-4' : 'text-n-4 hover:text-n-1'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="Emoji"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  {/* Sticker Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowStickerPicker(!showStickerPicker);
                      setShowEmojiPicker(false);
                    }}
                    disabled={chatCooldownSeconds > 0}
                    className={`p-1 transition-colors ${
                      showStickerPicker ? 'text-color-4' : 'text-n-4 hover:text-n-1'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="Sticker"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={chatCooldownSeconds > 0}
                className="button relative w-full h-11 bg-n-8 border border-n-6 text-n-1 hover:text-[#10B981] hover:border-[#10B981]/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="relative z-10">
                  {chatCooldownSeconds > 0 ? `Slow down (${chatCooldownSeconds}s)` : 'Send Message'}
                </span>
              </button>
            </form>
          ) : (
            <div className="text-center py-4">
              <p className="text-n-4 text-sm mb-2">Sign in to chat</p>
              <p className="text-n-5 text-xs">You can view messages but not send them</p>
            </div>
          )}
        </div>
      </div>

      {/* High-priority alert modal */}
      {activeAlert && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[110] p-4"
          onClick={() => setActiveAlert(null)}
        >
          <div
            className="w-full max-w-lg bg-n-8 border border-red-500/40 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-red-500/30 flex items-center justify-between">
              <div>
                <h3 className="text-red-300 font-bold text-base">{activeAlert.title || 'Alert'}</h3>
                <p className="text-n-4 text-xs">High priority notification</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveAlert(null)}
                className="w-8 h-8 rounded-lg bg-n-7 hover:bg-n-6 text-n-2"
                title="Close"
              >
                x
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-n-1 text-sm leading-relaxed">{activeAlert.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {selectedUserProfile && (
        <UserProfileModal
          userId={selectedUserProfile}
          onClose={() => setSelectedUserProfile(null)}
        />
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-n-8 border border-n-6 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="border-b border-n-6 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-n-1 font-bold text-lg">{helpTitle}</h2>
                <p className="text-n-4 text-xs">{helpSubtitle}</p>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-n-4 hover:text-n-1 transition-colors p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 overflow-y-auto max-h-[calc(80vh-120px)] custom-scrollbar space-y-6">
              {helpSections.map((section, sectionIndex) => (
                <div key={`${section.title}-${sectionIndex}`}>
                  <div className="text-xs uppercase tracking-wider text-n-4 mb-3">{section.title}</div>
                  <div className="space-y-3">
                    {section.commands.map((cmd, index) => (
                      <div
                        key={`${cmd.command}-${index}`}
                        className="bg-n-7 border border-n-6 rounded-lg p-4"
                      >
                        <code className="text-emerald-300 font-mono text-sm font-semibold block mb-2">
                          {cmd.command}
                        </code>
                        <p className="text-n-3 text-sm">{cmd.description}</p>
                        {cmd.example ? (
                          <div className="mt-3 bg-n-8 rounded-lg border border-n-6 px-3 py-2">
                            <p className="text-n-4 text-xs font-semibold mb-1">Example</p>
                            <code className="text-n-3 text-xs font-mono break-all">{cmd.example}</code>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            {helpFooter && (
              <div className="border-t border-n-6 px-6 py-3 bg-n-7/40">
                <p className="text-n-4 text-xs text-center">{helpFooter}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default LiveChat;

