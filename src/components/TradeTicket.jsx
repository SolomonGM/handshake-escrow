import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import Section from "./Section";
import { toast } from "../utils/toast";
import { QRCodeSVG } from 'qrcode.react';

const API_URL = 'http://localhost:5001/api';

const TradeTicket = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  // Decode the ticketId since it's URL encoded (contains # symbol)
  const ticketIdParam = searchParams.get('ticketId') ? decodeURIComponent(searchParams.get('ticketId')) : null;
  const isReadOnly = searchParams.get('readonly') === 'true';
  
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasShownPrompt, setHasShownPrompt] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [availablePasses, setAvailablePasses] = useState(0);
  const messagesEndRef = useRef(null);
  const lastUpdatedAtRef = useRef(null);
  const syncInFlightRef = useRef(false);
  const closeRedirectTimeoutRef = useRef(null);
  const LIVE_SYNC_INTERVAL_MS = 2000;

  const formatCryptoAmount = (value) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed.toFixed(8);
    }
    return value || '0.00000000';
  };

  const getCryptoAmountFromEmbed = (embedData, fallbackUsd) => {
    const directAmount = embedData?.metadata?.cryptoAmount;
    if (directAmount !== undefined && directAmount !== null && directAmount !== '') {
      return directAmount;
    }

    const description = embedData?.description || '';
    const plainText = description.replace(/<[^>]*>/g, ' ');
    const amountMatch = plainText.match(/Amount to Send:\s*([\d.]+)/i);
    if (amountMatch) {
      return amountMatch[1];
    }

    const exchangeRateText = embedData?.metadata?.exchangeRate || '';
    const rateMatch = exchangeRateText.match(/\$([\d.,]+)/);
    const rate = rateMatch ? Number(rateMatch[1].replace(/,/g, '')) : null;
    const usdValue = Number(fallbackUsd);

    if (Number.isFinite(usdValue) && Number.isFinite(rate) && rate > 0) {
      return (usdValue / rate).toFixed(8);
    }

    return null;
  };

  const handleCopyCryptoAmount = async (amount, symbol) => {
    try {
      const formatted = `${formatCryptoAmount(amount)} ${symbol || ''}`.trim();
      await navigator.clipboard.writeText(formatted);
      toast.success('Amount copied');
    } catch (error) {
      toast.error('Failed to copy amount');
    }
  };

  // Map crypto values to display names and colors
  const cryptoInfo = {
    'bitcoin': { name: 'Bitcoin', symbol: 'BTC', color: '#F7931A' },
    'ethereum': { name: 'Ethereum', symbol: 'ETH', color: '#627EEA' },
    'litecoin': { name: 'Litecoin', symbol: 'LTC', color: '#345D9D' },
    'solana': { name: 'Solana', symbol: 'SOL', color: '#14F195' },
    'usdt-erc20': { name: 'USDT [ERC-20]', symbol: 'USDT', color: '#26A17B' },
    'usdc-erc20': { name: 'USDC [ERC-20]', symbol: 'USDC', color: '#2775CA' },
  };

  const currentCrypto = cryptoInfo[ticket?.cryptocurrency] || { name: 'Unknown', symbol: '?', color: '#10B981' };
  const isCancelDisabled = Boolean(
    ticket?.feesConfirmed ||
    ticket?.fundsReleased ||
    ['awaiting-close', 'closing', 'completed'].includes(ticket?.status)
  );

  const normalizeId = (value) => (value ? value.toString() : '');
  const isSameUser = (left, right) => {
    const leftId = normalizeId(left);
    const rightId = normalizeId(right);
    return leftId && rightId && leftId === rightId;
  };

  const getSenderParticipant = () => ticket?.participants?.find(p => p.role === 'sender');
  const getReceiverParticipant = () => ticket?.participants?.find(p => p.role === 'receiver');

  const getCurrentUserId = () => (user?._id ?? user?.id ?? '');

  const isUserSender = () => {
    const currentUserId = getCurrentUserId();
    if (!ticket || !currentUserId) return false;
    if (ticket.creatorRole === 'sender') {
      return isSameUser(currentUserId, ticket.creator?._id ?? ticket.creator);
    }
    const senderParticipant = getSenderParticipant();
    return senderParticipant && isSameUser(currentUserId, senderParticipant.user?._id ?? senderParticipant.user);
  };

  const isUserReceiver = () => {
    const currentUserId = getCurrentUserId();
    if (!ticket || !currentUserId) return false;
    if (ticket.creatorRole === 'receiver') {
      return isSameUser(currentUserId, ticket.creator?._id ?? ticket.creator);
    }
    const receiverParticipant = getReceiverParticipant();
    return receiverParticipant && isSameUser(currentUserId, receiverParticipant.user?._id ?? receiverParticipant.user);
  };

  const getPrivacySelectionForUser = (userId) => {
    if (!userId || !ticket?.privacySelections) {
      return null;
    }
    const selections = ticket.privacySelections;
    if (selections instanceof Map) {
      return selections.get(userId);
    }
    return selections[userId];
  };

  const getTicketPartyIds = () => {
    const ids = [];
    if (ticket?.creator?._id || ticket?.creator) {
      ids.push(ticket.creator?._id ?? ticket.creator);
    }
    (ticket?.participants || []).forEach((participant) => {
      if (participant?.status === 'accepted' && participant?.user) {
        ids.push(participant.user?._id ?? participant.user);
      }
    });
    return Array.from(new Set(ids.map((value) => value?.toString()).filter(Boolean)));
  };

  const hasAllPrivacySelections = () => {
    const partyIds = getTicketPartyIds();
    if (!partyIds.length) return false;
    return partyIds.every((id) => Boolean(getPrivacySelectionForUser(id)));
  };

  const isAwaitingPayoutAddress = Boolean(ticket?.awaitingPayoutAddress && isUserReceiver());
  const isActiveChat = ['in-progress', 'awaiting-close', 'closing', 'completed'].includes(ticket?.status);
  const inputPlaceholder = isAwaitingPayoutAddress
    ? 'Paste your Ethereum address (0x...)'
    : (isActiveChat ? 'Send message...' : 'Paste User ID here (17 digits)...');
  const inputHelperText = isAwaitingPayoutAddress
    ? 'Receiver: paste the payout address you want to receive funds at.'
    : (isActiveChat
      ? 'Send a message to the other party here.'
      : 'Click on a user\'s profile picture in the live chat to copy their User ID, then paste it here');

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Create or load ticket
  useEffect(() => {
    const initializeTicket = async () => {
      lastUpdatedAtRef.current = null;
      if (!token) {
        console.log('No token found, redirecting to home');
        navigate('/');
        return;
      }

      if (!ticketIdParam) {
        console.log('No ticket ID provided');
        setError('No ticket specified');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        console.log('Loading ticket:', ticketIdParam);
        
        // Load existing ticket (URL-encode to handle # symbol)
        const response = await axios.get(
          `${API_URL}/tickets/${encodeURIComponent(ticketIdParam)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log('Ticket loaded:', response.data);
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
        lastUpdatedAtRef.current = response.data.ticket.updatedAt || null;
        setError(null);
      } catch (err) {
        console.error('Error loading ticket:', err);
        console.error('Error response:', err.response?.data);
        setError(err.response?.data?.message || 'Failed to load ticket');
      } finally {
        setIsLoading(false);
      }
    };

    initializeTicket();
  }, [ticketIdParam, token, navigate]);

  // Live sync ticket state + messages so both users see updates without refresh
  useEffect(() => {
    if (!ticketIdParam || !token) {
      return;
    }

    const isFinished = ['completed', 'cancelled', 'refunded'].includes(ticket?.status);
    if (isFinished) {
      return;
    }

    let isMounted = true;

    const syncTicket = async () => {
      if (syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;
      try {
        const response = await axios.get(
          `${API_URL}/tickets/${encodeURIComponent(ticketIdParam)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (isMounted && response.data.success) {
          const nextTicket = response.data.ticket;
          const nextUpdatedAt = nextTicket?.updatedAt || null;
          const lastUpdatedAt = lastUpdatedAtRef.current;

          if (!lastUpdatedAt || nextUpdatedAt !== lastUpdatedAt) {
            setTicket(nextTicket);
            setMessages(nextTicket.messages || []);
            lastUpdatedAtRef.current = nextUpdatedAt;
            console.log('🔄 Live-synced ticket state');
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error live-syncing ticket:', err);
        }
      } finally {
        syncInFlightRef.current = false;
      }
    };

    const refreshInterval = setInterval(syncTicket, LIVE_SYNC_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [ticketIdParam, ticket?.status, token]);

  // Redirect once ticket closure countdown finishes
  useEffect(() => {
    if (!ticket?.closeScheduledAt) {
      return;
    }

    const closeTime = new Date(ticket.closeScheduledAt).getTime();
    if (!Number.isFinite(closeTime)) {
      return;
    }

    const delay = Math.max(closeTime - Date.now(), 0);

    if (closeRedirectTimeoutRef.current) {
      clearTimeout(closeRedirectTimeoutRef.current);
    }

    closeRedirectTimeoutRef.current = setTimeout(() => {
      window.location.href = '/trade-hub';
    }, delay);

    return () => {
      if (closeRedirectTimeoutRef.current) {
        clearTimeout(closeRedirectTimeoutRef.current);
      }
    };
  }, [ticket?.closeScheduledAt]);

  // Trigger bot prompt after 5 seconds (persistent, stored in database)
  useEffect(() => {
    if (ticket && !ticket.hasShownPrompt && ticket.status === 'open') {
      const timer = setTimeout(async () => {
        try {
          const response = await axios.post(
            `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/trigger-prompt`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          if (response.data.success && response.data.ticket) {
            // Update entire ticket with latest messages from backend
            setTicket(response.data.ticket);
            setMessages(response.data.ticket.messages);
          }
        } catch (err) {
          console.error('Error triggering prompt:', err);
        }
      }, 5000); // 5 seconds

      return () => clearTimeout(timer);
    }
  }, [ticket?.hasShownPrompt, token]);

  // Role selection is now handled immediately on backend when user accepts invitation

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !ticket) return;

    const content = messageInput.trim();
    setMessageInput("");

    if (ticket?.awaitingPayoutAddress && isUserReceiver()) {
      const addressPatterns = {
        ethereum: /^(0x[a-fA-F0-9]{40})/,
        bitcoin: /^((?:tb1|bc1)[0-9a-z]{20,}|[mn2][a-zA-Z0-9]{25,34})/,
        litecoin: /^((?:tltc1)[0-9a-z]{20,}|[mn2][a-zA-Z0-9]{25,34})/
      };
      const cryptoKey = ticket?.cryptocurrency || 'ethereum';
      const pattern = addressPatterns[cryptoKey];
      const match = pattern ? content.trim().match(pattern) : null;

      if (match) {
        console.log('valid address');
        await handleSubmitPayoutAddress(match[1]);
        return;
      }
    }

    // Check if we're in amount entry phase and this could be an amount
    if (ticket.rolesConfirmed && !ticket.dealAmountConfirmed) {
      // Try to detect amount in the message
      try {
        const amountResponse = await axios.post(
          `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/detect-amount`,
          { message: content },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (amountResponse.data.success) {
          // Amount detected and confirmation added
          setTicket(amountResponse.data.ticket);
          setMessages(amountResponse.data.ticket.messages);
          return; // Don't send as regular message
        }
      } catch (err) {
        console.log('Amount detection check:', err.response?.data?.message);
        // If not an amount, continue to regular message handling
      }
    }

    // Check if message is a 17-digit user ID (no @mentions)
    if (/^\d{17}$/.test(content)) {
      try {
        const response = await axios.post(
          `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/add-user`,
          { userIdentifier: content },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // If successful, update ticket and messages
        if (response.data.success) {
          console.log('User added, updating messages');
          setTicket(response.data.ticket);
          setMessages(response.data.ticket.messages);
        } else {
          // Backend returned an error but with 200 status (validation errors)
          setTicket(response.data.ticket);
          setMessages(response.data.ticket.messages);
        }
      } catch (err) {
        console.error('Error adding user:', err);
        // Show generic error for network issues
        const errorMessage = {
          isBot: true,
          content: 'Error',
          type: 'embed',
          embedData: {
            title: 'Error',
            description: err.response?.data?.message || 'Failed to add user. Please try again.',
            color: 'red'
          },
          timestamp: new Date(),
          _id: 'error-' + Date.now()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } else {
      // Regular message
      try {
        const response = await axios.post(
          `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/messages`,
          { content },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        setMessages(prev => [...prev, response.data.message]);
      } catch (err) {
        console.error('Error sending message:', err);
        toast.error('Failed to send message');
      }
    }
  };

  const handleSelectRole = async (role) => {
    try {
      console.log(`🎯 Selecting role: ${role}`);
      
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/select-role`,
        { role },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('✅ Role selection response:', response.data);
      
      if (response.data.success) {
        // Update state with fresh ticket data
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
        console.log('🔄 Ticket state updated');
      } else {
        // Handle role already taken error
        if (response.data.error === 'role_taken') {
          toast.error(response.data.message);
          console.log('⚠️ Role taken error:', response.data.message);
        }
      }
    } catch (err) {
      console.error('❌ Error selecting role:', err);
      // Show error message immediately
      if (err.response?.data?.error === 'role_taken') {
        toast.error(err.response.data.message);
      } else {
        toast.error(err.response?.data?.message || 'Failed to select role');
      }
    }
  };

  const handleConfirmRoles = async (confirmed) => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/confirm-roles`,
        { confirmed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
      }
    } catch (err) {
      console.error('Error confirming roles:', err);
      toast.error(err.response?.data?.message || 'Failed to confirm roles');
    }
  };

  const handleConfirmAmount = async (confirmed) => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/confirm-amount`,
        { confirmed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
      }
    } catch (err) {
      console.error('Error confirming amount:', err);
      toast.error(err.response?.data?.message || 'Failed to confirm amount');
    }
  };

  const handleFeeOption = async (option) => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/select-fee`,
        { option },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        if (response.data.showPassPrompt) {
          // Show pass modal
          setAvailablePasses(response.data.availablePasses);
          setShowPassModal(true);
        } else {
          // Updated with fee confirmation
          setTicket(response.data.ticket);
          setMessages(response.data.ticket.messages);
        }
      }
    } catch (err) {
      console.error('Error selecting fee option:', err);
      toast.error(err.response?.data?.message || 'Failed to select fee option');
    }
  };

  const handleConfirmPassUse = async () => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/confirm-pass`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setShowPassModal(false);
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
        toast.success(`Pass used! Remaining: ${response.data.remainingPasses}`);
      }
    } catch (err) {
      console.error('Error using pass:', err);
      toast.error(err.response?.data?.message || 'Failed to use pass');
      setShowPassModal(false);
    }
  };

  const handleConfirmFees = async (confirmed) => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/confirm-fees`,
        { confirmed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
      }
    } catch (err) {
      console.error('Error confirming fees:', err);
      toast.error(err.response?.data?.message || 'Failed to confirm fees');
    }
  };

  const handleSubmitPayoutAddress = async (address) => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/submit-payout-address`,
        { address },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.ticket) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
      }
    } catch (err) {
      console.error('Error submitting payout address:', err);
      toast.error(err.response?.data?.message || 'Failed to submit payout address');
    }
  };

  const handleConfirmPayoutAddress = async (confirmed) => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/confirm-payout-address`,
        { confirmed },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.ticket) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
      }
    } catch (err) {
      console.error('Error confirming payout address:', err);
      toast.error(err.response?.data?.message || 'Failed to confirm payout address');
    }
  };

  const handleCopyTransactionDetails = async () => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/copy-details`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
        toast.success(`Details copied to chat (${response.data.copyCount}/3)`);
      }
    } catch (err) {
      console.error('Error copying details:', err);
      toast.error(err.response?.data?.message || 'Failed to copy details');
    }
  };

  const handleReleaseFunds = async () => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/release-funds`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setShowReleaseModal(false);
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
        toast.success('Funds released successfully!');
      }
    } catch (err) {
      console.error('Error releasing funds:', err);
      toast.error(err.response?.data?.message || 'Failed to release funds');
      setShowReleaseModal(false);
    }
  };

  const handleRescanTransaction = async () => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/rescan-transaction`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
        
        if (response.data.maxAttemptsReached) {
          toast.error('Maximum rescan attempts reached');
        } else {
          toast.success(`Rescanning... (Attempt ${response.data.ticket.rescanAttempts}/3)`);
        }
      }
    } catch (err) {
      console.error('Error rescanning transaction:', err);
      toast.error(err.response?.data?.message || 'Failed to rescan transaction');
    }
  };

  const handleCancelTransaction = async () => {
    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/cancel-transaction`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
        toast.error('Transaction monitoring cancelled');
      }
    } catch (err) {
      console.error('Error cancelling transaction:', err);
      toast.error(err.response?.data?.message || 'Failed to cancel transaction');
    }
  };

  const handlePrivacySelection = async (preference) => {
    if (!ticket) return;

    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/select-privacy`,
        { preference },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.ticket) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
      }
    } catch (err) {
      console.error('Error setting privacy:', err);
      toast.error(err.response?.data?.message || 'Failed to update privacy selection');
    }
  };

  const handleFinalizeTicket = async () => {
    if (!ticket) return;

    try {
      const response = await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/close`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.ticket) {
        setTicket(response.data.ticket);
        setMessages(response.data.ticket.messages);
      }

      toast.success('Ticket will close in 1 minute');
    } catch (err) {
      console.error('Error closing ticket:', err);
      toast.error(err.response?.data?.message || 'Failed to close ticket');
    }
  };

  const handleCloseTicket = async () => {
    if (!ticket) return;

    try {
      await axios.post(
        `${API_URL}/tickets/${encodeURIComponent(ticket.ticketId)}/close`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowCloseModal(false);
      navigate('/my-requests');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to close ticket');
      setShowCloseModal(false);
    }
  };

  if (isLoading) {
    return (
      <Section className="pt-[12rem] -mt-[5.25rem] pb-12 flex-1" crosses crossesOffset="lg:translate-y-[5.25rem]" customPaddings>
        <div className="container relative z-2 flex items-center justify-center min-h-[600px]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-[#10B981] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-n-3">Loading ticket...</p>
          </div>
        </div>
      </Section>
    );
  }

  if (error || !ticket) {
    return (
      <Section className="pt-[12rem] -mt-[5.25rem] pb-12 flex-1" crosses crossesOffset="lg:translate-y-[5.25rem]" customPaddings>
        <div className="container relative z-2">
          <div className="max-w-2xl mx-auto text-center py-20">
            <h2 className="h2 mb-4 text-red-400">Error</h2>
            <p className="text-n-3 mb-6">{error || 'Ticket not found'}</p>
            <button
              onClick={() => navigate('/trade-hub')}
              className="px-6 py-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg transition-colors"
            >
              Back to Trade Hub
            </button>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section className="pt-[12rem] -mt-[5.25rem] pb-12 flex-1" crosses crossesOffset="lg:translate-y-[5.25rem]" customPaddings>
      <div className="container relative z-2 pb-20">
        
        {/* Ticket Header */}
        <div className="max-w-5xl mx-auto mb-6">
          <div className="flex items-center justify-between p-6 bg-n-7 border-b border-n-6 rounded-t-2xl shadow-lg">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: currentCrypto.color }}
                />
                <span className="text-n-4 text-sm font-code">Ticket {ticket?.ticketId}</span>
              </div>
              <span className="text-n-4">•</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-n-3">{currentCrypto.name}</span>
                <span 
                  className="px-2 py-0.5 text-xs font-bold rounded text-white"
                  style={{ backgroundColor: currentCrypto.color }}
                >
                  {currentCrypto.symbol}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/my-requests')}
                className="flex items-center gap-2 px-4 py-2 bg-n-6 hover:bg-[#10B981]/20 border border-n-6 hover:border-[#10B981]/50 rounded-lg text-n-3 hover:text-[#10B981] transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Return
              </button>
              
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={isCancelDisabled}
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-all text-sm ${
                  isCancelDisabled
                    ? 'bg-n-7 border-n-7 text-n-5 cursor-not-allowed opacity-50'
                    : 'bg-n-6 hover:bg-red-600/20 border-n-6 hover:border-red-600/50 text-n-3 hover:text-red-400'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Cancel Ticket
              </button>
            </div>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="max-w-5xl mx-auto">
          <div className="bg-n-8 border border-n-6 rounded-b-2xl overflow-hidden shadow-xl">
            
            {/* Chat Messages Area */}
            <div className="p-8 space-y-8 min-h-[650px] max-h-[650px] overflow-y-auto custom-scrollbar">
              
              {messages.map((msg, index) => (
                <div key={msg._id || index} className="flex gap-5">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {msg.isBot ? (
                      <div className="w-12 h-12 rounded-full bg-[#10B981] flex items-center justify-center font-bold text-white text-lg shadow-md">
                        H
                      </div>
                    ) : msg.sender?.avatar ? (
                      <img
                        src={msg.sender.avatar}
                        alt={msg.sender.username}
                        className="w-12 h-12 rounded-full object-cover border-2 border-n-6 shadow-md"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    {!msg.isBot && (
                      <div 
                        className="w-12 h-12 rounded-full bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center font-bold text-white text-lg shadow-md"
                        style={{ display: msg.sender?.avatar ? 'none' : 'flex' }}
                      >
                        {msg.sender?.username?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Message Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-semibold text-n-1">
                        {msg.isBot ? 'Handshake' : (msg.sender?.username || user?.username)}
                      </span>
                      {msg.isBot && (
                        <span className="px-2 py-0.5 text-xs font-bold bg-[#10B981] text-white rounded">
                          BOT
                        </span>
                      )}
                      <span className="text-xs text-n-4 font-code">
                        {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Removed placeholder random string above the first embed */}

                    {/* Render embed or regular message */}
                    {msg.type === 'embed' && msg.embedData ? (
                      <div className={`border-l-4 ${
                        msg.embedData.color === 'green' ? 'border-[#10B981]' :
                        msg.embedData.color === 'red' ? 'border-red-500' :
                        msg.embedData.color === 'yellow' ? 'border-yellow-500' :
                        msg.embedData.color === 'orange' ? 'border-orange-500' :
                        msg.embedData.color === 'blue' ? 'border-blue-500' :
                        msg.embedData.color === 'blurple' ? 'border-[#5865F2]' :
                        'border-n-6'
                      } bg-n-7 rounded-r-lg p-4`}>
                        {msg.embedData.title && (
                          <h3 className={`text-lg font-bold mb-2 ${
                            msg.embedData.color === 'green' ? 'text-[#10B981]' :
                            msg.embedData.color === 'red' ? 'text-red-400' :
                            msg.embedData.color === 'yellow' ? 'text-yellow-400' :
                            msg.embedData.color === 'orange' ? 'text-orange-400' :
                            msg.embedData.color === 'blue' ? 'text-blue-400' :
                            msg.embedData.color === 'blurple' ? 'text-[#8EA1FF]' :
                            'text-n-1'
                          }`}>
                            {msg.embedData.title}
                          </h3>
                        )}
                        {msg.embedData.title && <div className="h-1 w-full bg-n-6 rounded mb-3" />}
                        <p 
                          className="text-sm text-n-3 leading-relaxed whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: msg.embedData.description }}
                        />
                        
                        {/* Role Selection Buttons */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'role-selection';
                          console.log('🔍 Role Selection Debug:', {
                            messageId: msg._id,
                            title: msg.embedData.title,
                            requiresAction: msg.embedData.requiresAction,
                            actionType: msg.embedData.actionType,
                            shouldShowButtons: shouldShow
                          });
                          return shouldShow ? (
                            <div className="flex gap-3 mt-4">
                              <button
                                onClick={() => handleSelectRole('sender')}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#10B981]/20"
                              >
                                <span>I'm the Sender</span>
                              </button>
                              <button
                                onClick={() => handleSelectRole('receiver')}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/20"
                              >
                                <span>I'm the Receiver</span>
                              </button>
                            </div>
                          ) : null;
                        })()}
                        
                        {/* Role Confirmation Buttons */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'role-confirmation';
                          const confirmationMap = ticket?.roleConfirmations;
                          const hasConfirmedRole = Boolean(
                            user?._id && (
                              (confirmationMap instanceof Map && confirmationMap.get(user._id)) ||
                              confirmationMap?.[user._id]
                            )
                          );
                          console.log('🔍 Role Confirmation Debug:', {
                            messageId: msg._id,
                            title: msg.embedData.title,
                            requiresAction: msg.embedData.requiresAction,
                            actionType: msg.embedData.actionType,
                            shouldShowButtons: shouldShow,
                            hasConfirmedRole
                          });
                          if (!shouldShow) return null;

                          if (hasConfirmedRole) {
                            return (
                              <div className="mt-4 text-sm text-n-4">
                                You already confirmed. Waiting for the other user...
                              </div>
                            );
                          }

                          return (
                            <div className="flex gap-3 mt-4">
                              <button
                                onClick={() => handleConfirmRoles(true)}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#10B981]/20"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>This is Correct</span>
                              </button>
                              <button
                                onClick={() => handleConfirmRoles(false)}
                                className="flex-1 px-4 py-3 bg-n-7 hover:bg-red-500/10 border border-n-6 hover:border-red-500/50 text-n-3 hover:text-red-400 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>This is Wrong</span>
                              </button>
                            </div>
                          );
                        })()}

                        {/* Amount Confirmation Buttons */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'amount-confirmation';
                          const confirmationMap = ticket?.amountConfirmations;
                          const hasConfirmedAmount = Boolean(
                            user?._id && (
                              (confirmationMap instanceof Map && confirmationMap.get(user._id)) ||
                              confirmationMap?.[user._id]
                            )
                          );

                          if (!shouldShow) return null;

                          if (hasConfirmedAmount) {
                            return (
                              <div className="mt-4 text-sm text-n-4">
                                You already confirmed. Waiting for the other user...
                              </div>
                            );
                          }

                          return (
                            <div className="flex gap-3 mt-4">
                              <button
                                onClick={() => handleConfirmAmount(true)}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#10B981]/20"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>This is Correct</span>
                              </button>
                              <button
                                onClick={() => handleConfirmAmount(false)}
                                className="flex-1 px-4 py-3 bg-n-7 hover:bg-red-500/10 border border-n-6 hover:border-red-500/50 text-n-3 hover:text-red-400 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>This is Wrong</span>
                              </button>
                            </div>
                          );
                        })()}

                        {/* Fee Selection Buttons */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'fee-selection';
                          return shouldShow ? (
                            <div className="flex flex-col gap-3 mt-4">
                              <button
                                onClick={() => handleFeeOption('use-pass')}
                                className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-600/20"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                                </svg>
                                <span>Use Pass</span>
                              </button>
                              <button
                                onClick={() => handleFeeOption('with-fees')}
                                className="w-full px-4 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#10B981]/20"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                <span>Proceed with Fees</span>
                              </button>
                            </div>
                          ) : null;
                        })()}

                        {/* Fee Confirmation Buttons */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'fee-confirmation';
                          return shouldShow ? (
                            <div className="flex gap-3 mt-4">
                              <button
                                onClick={() => handleConfirmFees(true)}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#10B981]/20"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>This is Correct</span>
                              </button>
                              <button
                                onClick={() => handleConfirmFees(false)}
                                className="flex-1 px-4 py-3 bg-n-7 hover:bg-red-500/10 border border-n-6 hover:border-red-500/50 text-n-3 hover:text-red-400 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>This is Wrong</span>
                              </button>
                            </div>
                          ) : null;
                        })()}

                        {/* Payout Address Confirmation Buttons */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'payout-address-confirmation';
                          if (!shouldShow) return null;

                          const isReceiver = isUserReceiver();

                          if (!isReceiver) {
                            return (
                              <div className="mt-4 text-sm text-n-4">
                                Waiting for the receiver to confirm the payout address...
                              </div>
                            );
                          }

                          return (
                            <div className="flex gap-3 mt-4">
                              <button
                                onClick={() => handleConfirmPayoutAddress(true)}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#10B981]/20"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>This is Correct</span>
                              </button>
                              <button
                                onClick={() => handleConfirmPayoutAddress(false)}
                                className="flex-1 px-4 py-3 bg-n-7 hover:bg-red-500/10 border border-n-6 hover:border-red-500/50 text-n-3 hover:text-red-400 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>This is Wrong</span>
                              </button>
                            </div>
                          );
                        })()}

                        {/* Transaction Send Section with QR Code */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'transaction-send';
                          const timeoutAt = ticket?.transactionTimeoutAt ? new Date(ticket.transactionTimeoutAt).getTime() : null;
                          const timeLeftMs = timeoutAt ? timeoutAt - Date.now() : null;
                          const showOneMinuteLeft = timeLeftMs !== null && timeLeftMs > 0 && timeLeftMs <= 60 * 1000;
                          const awaitingLabel = showOneMinuteLeft ? 'Awaiting transaction... 1m left' : 'Awaiting transaction...';
                          const totalAmountValue = Number(msg.embedData.metadata?.totalAmount ?? ticket?.expectedAmount ?? 0);
                          const totalAmountDisplay = Number.isFinite(totalAmountValue)
                            ? totalAmountValue.toFixed(2)
                            : '0.00';
                          const cryptoAmountValue = getCryptoAmountFromEmbed(msg.embedData, totalAmountValue);
                          return shouldShow ? (
                            <div className="mt-4 space-y-4">
                              {/* QR Code and Address */}
                              <div className="bg-white p-6 rounded-lg flex flex-col items-center gap-4">
                                <QRCodeSVG 
                                  value={msg.embedData.metadata?.botWallet || ''}
                                  size={200}
                                  level="H"
                                  includeMargin={true}
                                />
                                <div className="w-full space-y-2">
                                  <div className="text-center">
                                    <p className="text-xs text-gray-500 mb-1">Amount to Send</p>
                                    <div className="flex items-center justify-center gap-2">
                                      <p className="text-2xl font-bold text-gray-900">
                                        {formatCryptoAmount(cryptoAmountValue)} {ticket?.cryptocurrency?.toUpperCase() || 'CRYPTO'}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyCryptoAmount(
                                          cryptoAmountValue,
                                          ticket?.cryptocurrency?.toUpperCase() || 'CRYPTO'
                                        )}
                                        className="p-1 rounded hover:bg-gray-200"
                                        title="Copy amount"
                                      >
                                        <svg className="w-4 h-4 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                      </button>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                      ${totalAmountDisplay} USD
                                    </p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-gray-500">
                                      {msg.embedData.metadata?.exchangeRate}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Copy Details Button */}
                              <button
                                onClick={handleCopyTransactionDetails}
                                disabled={ticket?.copyDetailsClickCount >= 3}
                                className={`w-full px-4 py-3 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg ${
                                  ticket?.copyDetailsClickCount >= 3
                                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                                    : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white hover:shadow-blue-600/20'
                                }`}
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span>
                                  {ticket?.copyDetailsClickCount >= 3 
                                    ? 'Copy Limit Reached (3/3)' 
                                    : `Copy Details to Chat (${ticket?.copyDetailsClickCount || 0}/3)`
                                  }
                                </span>
                              </button>

                              {/* Awaiting Transaction Status */}
                              <div className="bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
                                <div className="animate-spin">
                                  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                </div>
                                <p className="text-orange-600 font-semibold text-sm">
                                  {awaitingLabel}
                                </p>
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {/* Transaction Confirming State */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'transaction-confirming';
                          const confirmations = msg.embedData.metadata?.confirmations || 0;
                          const required = msg.embedData.metadata?.requiredConfirmations || 2;
                          return shouldShow ? (
                            <div className="mt-4 space-y-3">
                              <div className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/30 rounded-lg px-4 py-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-3">
                                    <div className="animate-spin">
                                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                      </svg>
                                    </div>
                                    <p className="text-blue-600 font-semibold text-sm">
                                      Confirming transaction...
                                    </p>
                                  </div>
                                  <span className="text-blue-600 font-bold text-lg">
                                    {Math.min(confirmations, required)}/{required}
                                  </span>
                                </div>
                                <div className="w-full bg-blue-900/20 rounded-full h-2">
                                  <div 
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${(Math.min(confirmations, required) / required) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {/* Payout Confirming State */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'payout-confirming';
                          const confirmations = msg.embedData.metadata?.confirmations || 0;
                          const required = msg.embedData.metadata?.requiredConfirmations || 2;
                          const txHash = msg.embedData.metadata?.txHash;
                          return shouldShow ? (
                            <div className="mt-4 space-y-3">
                              <div className="bg-gradient-to-r from-emerald-400/10 to-teal-400/10 border border-emerald-400/30 rounded-lg px-4 py-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-3">
                                    <div className="animate-spin">
                                      <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                      </svg>
                                    </div>
                                    <p className="text-emerald-200 font-semibold text-sm">
                                      Confirming payout...
                                    </p>
                                  </div>
                                  <span className="text-emerald-200 font-bold text-lg">
                                    {Math.min(confirmations, required)}/{required}
                                  </span>
                                </div>
                                {txHash ? (
                                  <p className="text-xs text-emerald-200/80 mb-2">
                                    Tx: {txHash.substring(0, 16)}...
                                  </p>
                                ) : null}
                                <div className="w-full bg-emerald-900/20 rounded-full h-2">
                                  <div
                                    className="bg-emerald-300 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${(Math.min(confirmations, required) / required) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {/* Privacy Selection */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'privacy-selection';
                          if (!shouldShow) return null;

                          const currentSelection = getPrivacySelectionForUser(getCurrentUserId());
                          const allSelected = hasAllPrivacySelections();
                          const isClosing = ticket?.status === 'closing';

                          return (
                            <div className="mt-4 space-y-3">
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handlePrivacySelection('anonymous')}
                                  disabled={Boolean(currentSelection) || isClosing}
                                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 border ${
                                    currentSelection === 'anonymous'
                                      ? 'bg-n-6 text-n-2 border-n-5'
                                      : 'bg-n-7 hover:bg-n-6 text-n-2 border-n-6 hover:border-n-5'
                                  } ${Boolean(currentSelection) || isClosing ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 4v5c0 5-3.5 9.5-7 11-3.5-1.5-7-6-7-11V7l7-4z" />
                                  </svg>
                                  <span>Anonymous</span>
                                </button>
                                <button
                                  onClick={() => handlePrivacySelection('global')}
                                  disabled={Boolean(currentSelection) || isClosing}
                                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 border ${
                                    currentSelection === 'global'
                                      ? 'bg-n-6 text-n-2 border-n-5'
                                      : 'bg-n-7 hover:bg-n-6 text-n-2 border-n-6 hover:border-n-5'
                                  } ${Boolean(currentSelection) || isClosing ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a9 9 0 100 18 9 9 0 000-18z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h18M12 3c2.5 2.5 2.5 13.5 0 18M12 3c-2.5 2.5-2.5 13.5 0 18" />
                                  </svg>
                                  <span>Global</span>
                                </button>
                              </div>

                              {currentSelection ? (
                                <div className="text-xs text-n-4">
                                  {allSelected ? (
                                    <>Both selections received. You can close the ticket below.</>
                                  ) : (
                                    <>You selected <strong className="text-n-2">{currentSelection === 'anonymous' ? 'Anonymous' : 'Global'}</strong>. Waiting for the other user...</>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs text-n-4">
                                  Choose how your name will appear when this trade is broadcast.
                                </div>
                              )}

                              {allSelected && !isClosing && ticket?.status !== 'completed' ? (
                                <button
                                  onClick={handleFinalizeTicket}
                                  className="w-full px-4 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#10B981]/20"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span>Close Ticket</span>
                                </button>
                              ) : null}

                              {isClosing ? (
                                <div className="text-xs text-n-4">
                                  Ticket is closing. You will be redirected to the Trade Hub shortly.
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {/* Release Funds Button */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'release-funds';
                          const isSender = isUserSender();

                          if (!shouldShow) return null;

                          return (
                            <div className="mt-4 flex justify-center">
                              <button
                                onClick={() => setShowReleaseModal(true)}
                                disabled={!isSender}
                                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 border ${
                                  isSender
                                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-100 border-emerald-300/40 hover:border-emerald-200/70 hover:bg-emerald-500/30'
                                    : 'bg-n-6 text-n-4 cursor-not-allowed border-n-6'
                                }`}
                                title={isSender ? 'Release funds' : 'Only the sender can release funds'}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Release Funds</span>
                              </button>
                            </div>
                          );
                        })()}

                        {/* Transaction Timeout Buttons */}
                        {(() => {
                          const shouldShow = msg.embedData.requiresAction && msg.embedData.actionType === 'transaction-timeout';
                          
                          return shouldShow ? (
                            <div className="mt-4 flex gap-3">
                              <button
                                onClick={handleRescanTransaction}
                                className="flex-1 px-4 py-3 bg-n-6 hover:bg-n-5 text-n-1 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>Rescan</span>
                              </button>
                              <button
                                onClick={handleCancelTransaction}
                                className="flex-1 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 border border-red-500/30"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>Cancel</span>
                              </button>
                            </div>
                          ) : null;
                        })()}
                        
                        {msg.embedData.footer && (
                          <div className="mt-3 pt-3 border-t border-n-6">
                            <span className="text-xs font-semibold text-n-4">{msg.embedData.footer}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-n-3">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area or Read-Only Notice */}
            {isReadOnly ? (
              <div className="border-t border-n-6 p-6 bg-n-7">
                <div className="flex items-center justify-center gap-3 text-n-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-sm font-medium">This ticket is closed - Read Only Mode</p>
                </div>
              </div>
            ) : (
              <div className="border-t border-n-6 p-6 bg-n-7">
                <form onSubmit={handleSendMessage} className="flex items-center gap-4">
                  <button type="button" className="p-3 hover:bg-n-6 rounded-lg transition-colors">
                    <svg className="w-6 h-6 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={inputPlaceholder}
                    className="flex-1 px-5 py-4 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#10B981] transition-colors text-base"
                  />
                  <button 
                    type="submit"
                    disabled={!messageInput.trim()}
                    className={`px-8 py-4 rounded-lg font-semibold transition-colors ${
                      messageInput.trim()
                        ? 'bg-[#10B981] hover:bg-[#059669] text-white shadow-lg'
                        : 'bg-n-6 text-n-4 cursor-not-allowed'
                    }`}
                  >
                    Send
                  </button>
                </form>
                <p className="text-xs text-n-4 mt-3 text-center">
                  {inputHelperText}
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Cancel Ticket Confirmation Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowCloseModal(false)}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-md mx-4">
            <div className="relative bg-n-8 border border-red-600/50 rounded-2xl p-8 shadow-2xl">
              {/* Warning Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-red-600/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>

              {/* Content */}
              <h2 className="text-2xl font-bold text-red-400 text-center mb-3">
                Cancel Ticket?
              </h2>
              <p className="text-n-3 text-center mb-6">
                Are you sure you want to cancel this ticket? This action cannot be undone and the ticket will be marked as cancelled.
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCloseModal(false)}
                  className="flex-1 py-3 px-6 bg-n-7 hover:bg-n-6 text-n-1 rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCloseTicket}
                  className="flex-1 py-3 px-6 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Cancel Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pass Confirmation Modal */}
      {showPassModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-n-8/80 backdrop-blur-sm">
          <div className="bg-n-7 rounded-xl p-6 max-w-md w-full border border-n-6 shadow-2xl">
            <h3 className="text-xl font-bold text-n-1 mb-4">Use a Pass?</h3>
            <p className="text-n-3 mb-6">
              You have <strong className="text-purple-400">{availablePasses} pass{availablePasses !== 1 ? 'es' : ''}</strong> available.
              <br /><br />
              Using a pass will allow you to skip all transaction fees for this deal.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmPassUse}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg font-semibold transition-all duration-300"
              >
                Use Pass
              </button>
              <button
                onClick={() => setShowPassModal(false)}
                className="flex-1 px-4 py-3 bg-n-6 hover:bg-n-5 text-n-3 hover:text-n-1 rounded-lg font-semibold transition-all duration-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Funds Confirmation Modal */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-n-8 border-2 border-red-500/50 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  Release Funds?
                </h3>
                <p className="text-sm text-n-3">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-400 mb-2">
                <strong>⚠️ Warning:</strong>
              </p>
                <p className="text-sm text-n-3">
                  Only release funds once the receiver confirms delivery. Once released, the funds go directly to the receiver and <strong>cannot be retrieved</strong>.
                </p>
            </div>

            <p className="text-n-3 mb-6">
              Are you sure you want to release <strong className="text-white">${ticket?.expectedAmount?.toFixed(2) || '0.00'} USD</strong>?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowReleaseModal(false)}
                className="flex-1 px-4 py-3 bg-n-6 hover:bg-n-5 border border-n-6 rounded-lg text-n-3 font-semibold transition-colors"
              >
                Cancel
              </button>
                <button
                  onClick={handleReleaseFunds}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-black rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-emerald-400/30"
                >
                  Yes, Release Funds
                </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
};

export default TradeTicket;
