import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import axios from "axios";
import { toast } from "../utils/toast";

const API_URL = import.meta.env.VITE_API_URL || '/api';
const UNAVAILABLE_AUTO_CLOSE_SECONDS = 120;
const CRYPTO_TICKET_METHODS = ['bitcoin', 'ethereum', 'litecoin', 'solana', 'usdt-erc20', 'usdc-erc20'];
const DEFAULT_TICKET_AVAILABILITY = {
  bitcoin: false,
  ethereum: true,
  litecoin: false,
  solana: false,
  'usdt-erc20': false,
  'usdc-erc20': false
};

const METHOD_INFO = {
  bitcoin: { label: 'Bitcoin', icon: '₿', color: '#F7931A' },
  ethereum: { label: 'Ethereum', icon: 'Ξ', color: '#627EEA' },
  litecoin: { label: 'Litecoin', icon: 'Ł', color: '#345D9D' },
  solana: { label: 'Solana', icon: '◎', color: '#14F195' },
  'usdt-erc20': { label: 'USDT', icon: '₮', color: '#26A17B' },
  'usdc-erc20': { label: 'USDC', icon: '$', color: '#2775CA' }
};

const TradeRequestCard = ({ request, onUpdate, currentUser }) => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [ticketAvailability, setTicketAvailability] = useState(DEFAULT_TICKET_AVAILABILITY);
  const [unavailableNotice, setUnavailableNotice] = useState(null);
  const [noticeSecondsRemaining, setNoticeSecondsRemaining] = useState(0);
  const closeTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const isCreator = currentUser && request.creator._id === currentUser.id;
  const cryptoPaymentMethods = useMemo(
    () => (request.paymentMethods || []).filter((method) => CRYPTO_TICKET_METHODS.includes(method)),
    [request.paymentMethods]
  );

  const clearNoticeTimers = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const closePaymentMethodModal = () => {
    clearNoticeTimers();
    setShowPaymentMethodModal(false);
    setUnavailableNotice(null);
    setNoticeSecondsRemaining(0);
  };

  const isTicketCoinAvailable = (coin) => Boolean(ticketAvailability?.[coin]);

  const showUnavailableNotice = ({ message, cryptocurrency, unavailableForSeconds, openModal = false }) => {
    const durationSeconds = Number(unavailableForSeconds) > 0
      ? Number(unavailableForSeconds)
      : UNAVAILABLE_AUTO_CLOSE_SECONDS;
    const closeAt = Date.now() + durationSeconds * 1000;

    if (openModal) {
      setShowPaymentMethodModal(true);
    }

    clearNoticeTimers();
    setUnavailableNotice({
      message: message || `${String(cryptocurrency || '').toUpperCase()} tickets are currently unavailable.`,
      cryptocurrency: cryptocurrency || null,
      closeAt
    });
    setNoticeSecondsRemaining(durationSeconds);

    countdownIntervalRef.current = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((closeAt - Date.now()) / 1000));
      setNoticeSecondsRemaining(secondsLeft);
      if (secondsLeft <= 0) {
        clearNoticeTimers();
      }
    }, 1000);

    closeTimeoutRef.current = setTimeout(() => {
      closePaymentMethodModal();
    }, durationSeconds * 1000);
  };

  const fetchTicketAvailability = useCallback(async () => {
    if (!token) {
      setTicketAvailability(DEFAULT_TICKET_AVAILABILITY);
      return;
    }

    try {
      setAvailabilityLoading(true);
      const response = await axios.get(`${API_URL}/tickets/availability`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data?.success && response.data?.ticketAvailability) {
        setTicketAvailability({
          ...DEFAULT_TICKET_AVAILABILITY,
          ...response.data.ticketAvailability
        });
      }
    } catch (error) {
      console.error('Failed to load ticket availability:', error);
      setTicketAvailability(DEFAULT_TICKET_AVAILABILITY);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTicketAvailability();
  }, [fetchTicketAvailability]);

  useEffect(() => {
    if (showPaymentMethodModal) {
      fetchTicketAvailability();
    }
  }, [showPaymentMethodModal, fetchTicketAvailability]);

  useEffect(() => {
    return () => {
      clearNoticeTimers();
    };
  }, []);

  // This calculates time remaining.
  const getTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires - now;
    
    if (diff < 0) return "Expired";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  // This gets currency symbol for price display.
  const getCurrencySymbol = (currency) => {
    const symbols = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'bitcoin': '₿',
      'ethereum': 'Ξ',
      'litecoin': 'Ł',
      'solana': 'SOL',
      'usdt-erc20': 'USDT',
      'usdc-erc20': 'USDC'
    };
    return symbols[currency] || currency.toUpperCase();
  };

  // This calculates reputation score from completed trades.
  const getReputationScore = () => {
    if (!request.creator.totalTrades) return 0;
    const completionRate = (request.creator.completedTrades / request.creator.totalTrades) * 100;
    return Math.min(Math.round(completionRate), 100);
  };

  const reputation = getReputationScore();

  // This handles buying/selling from this user.
  const handleTrade = async () => {
    if (!user || !token) {
      toast.error('Please login to trade');
      navigate('/');
      return;
    }

    // This prevents user from trading with themselves.
    if (request.creator._id === user._id) {
      toast.error('You cannot trade with yourself');
      return;
    }

    // For selling requests, show payment method selection first
    if (request.type === 'selling') {
      setShowPaymentMethodModal(true);
      return;
    }

    // For buying requests, choose a valid/available crypto method and proceed directly.
    const preferredMethod = CRYPTO_TICKET_METHODS.includes(request.cryptoOffered)
      ? request.cryptoOffered
      : null;
    const fallbackMethod = cryptoPaymentMethods.find((method) => isTicketCoinAvailable(method));
    const paymentMethod = preferredMethod && isTicketCoinAvailable(preferredMethod)
      ? preferredMethod
      : fallbackMethod;

    if (!paymentMethod) {
      showUnavailableNotice({
        message: 'No supported ticket network is currently available for this request. Please try again later.',
        unavailableForSeconds: UNAVAILABLE_AUTO_CLOSE_SECONDS,
        openModal: true
      });
      return;
    }

    await createTicket(paymentMethod);
  };

  // This creates ticket with selected payment method.
  const createTicket = async (paymentMethod) => {
    try {
      setIsCreatingTicket(true);
      const cryptocurrency = String(paymentMethod || '').trim().toLowerCase();

      if (!CRYPTO_TICKET_METHODS.includes(cryptocurrency)) {
        toast.error('Please select a valid cryptocurrency payment method');
        return;
      }

      if (!isTicketCoinAvailable(cryptocurrency)) {
        showUnavailableNotice({
          message: `${METHOD_INFO[cryptocurrency]?.label || cryptocurrency.toUpperCase()} tickets are currently unavailable.`,
          cryptocurrency,
          unavailableForSeconds: UNAVAILABLE_AUTO_CLOSE_SECONDS,
          openModal: true
        });
        return;
      }

      const ticketData = {
        cryptocurrency,
        invitedUserId: request.creator._id
      };

      const response = await axios.post(
        `${API_URL}/tickets`,
        ticketData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        const encodedTicketId = encodeURIComponent(response.data.ticket.ticketId);
        toast.success('Ticket created! Opening trade...');

        // This marks trade request as sold.
        await markAsSold();

        closePaymentMethodModal();
        navigate(`/trade-ticket?ticketId=${encodedTicketId}`);
      }
    } catch (err) {
      const errorData = err.response?.data;
      if (err.response?.status === 409 && errorData?.code === 'TICKET_COIN_UNAVAILABLE') {
        showUnavailableNotice({
          message: errorData.message,
          cryptocurrency: errorData.cryptocurrency || paymentMethod,
          unavailableForSeconds: errorData.unavailableForSeconds,
          openModal: true
        });
        return;
      }

      console.error('Error creating ticket:', err);
      toast.error(errorData?.message || 'Failed to create ticket');
    } finally {
      setIsCreatingTicket(false);
    }
  };

  // This marks trade request as sold.
  const markAsSold = async () => {
    try {
      await axios.patch(
        `${API_URL}/trade-requests/${request._id}/mark-sold`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // This refreshes the list.
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Error marking as sold:', err);
    }
  };

  // This deletes trade request.
  const handleDelete = async () => {
    try {
      await axios.delete(
        `${API_URL}/trade-requests/${request._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Trade request deleted');
      if (onUpdate) onUpdate();
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Error deleting trade request:', err);
      toast.error(err.response?.data?.message || 'Failed to delete request');
    }
  };

  // This gets trade type styling.
  const getTypeStyle = (type) => {
    return type === "buying" 
      ? { bg: "bg-[#10B981]/10", text: "text-[#10B981]", border: "border-[#10B981]/30", label: "BUYING" }
      : { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]", border: "border-[#EF4444]/30", label: "SELLING" };
  };

  const typeStyle = getTypeStyle(request.type);
  const timeRemaining = getTimeRemaining(request.expiresAt);
  const isExpired = timeRemaining === "Expired";

  return (
    <div className="relative group">
      {/* Card */}
      <div className="block relative p-0.5 bg-no-repeat bg-[length:100%_100%]">
        <div className="relative z-2 flex flex-col min-h-[28rem] p-[2rem] bg-n-8 rounded-[1rem] border border-n-6 hover:border-n-5 transition-colors">
          
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {/* Trade Type Badge */}
              <div className={`px-3 py-1.5 rounded-lg ${typeStyle.bg} border ${typeStyle.border}`}>
                <span className={`text-xs font-bold uppercase tracking-wider ${typeStyle.text}`}>
                  {request.type === "buying" ? "🟢 " : "🔴 "}{typeStyle.label}
                </span>
              </div>
            </div>

            {/* Edit/Delete Buttons OR Reputation Circle */}
            {isCreator ? (
              <div className="flex items-center gap-2">
                {/* Edit Button */}
                <button
                  onClick={() => toast.info('Edit functionality coming soon')}
                  className="w-10 h-10 rounded-lg bg-n-7 border border-n-6 hover:border-[#10B981] flex items-center justify-center transition-colors group"
                  title="Edit Request"
                >
                  <svg className="w-5 h-5 text-n-4 group-hover:text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {/* Delete Button */}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-10 h-10 rounded-lg bg-n-7 border border-n-6 hover:border-red-500 flex items-center justify-center transition-colors group"
                  title="Delete Request"
                >
                  <svg className="w-5 h-5 text-n-4 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="w-12 h-12">
                <CircularProgressbar
                  value={reputation}
                  text={`${reputation}`}
                  styles={buildStyles({
                    textSize: '28px',
                    pathColor: reputation >= 90 ? '#10B981' : reputation >= 70 ? '#F59E0B' : '#EF4444',
                    textColor: '#FFFFFF',
                    trailColor: '#1F2937',
                  })}
                />
              </div>
            )}
          </div>

          {/* Creator Info */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-n-6">
            {request.creator.avatar ? (
              <img
                src={request.creator.avatar}
                alt={request.creator.username}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center">
                <span className="text-lg font-bold text-white">
                  {request.creator.username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-n-1">@{request.creator.username}</span>
                {request.creator.badges?.includes('verified') && (
                  <span className="text-xs text-[#10B981]">✓</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-n-4">
                <span>{request.creator.totalTrades || 0} trades</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse"></span>
                  <span className="text-[#10B981]">Active</span>
                </span>
              </div>
            </div>
          </div>

          {/* Trade Details */}
          <div className="flex-1 mb-4">
            {/* Item Info */}
            <div className="mb-4">
              <p className="text-xs text-n-4 mb-1">
                {request.type === 'selling' ? 'Selling' : 'Buying'}
              </p>
              <p className="text-xl font-bold text-n-1 mb-2">
                {request.itemOffered}
              </p>
              {request.itemDescription && (
                <p className="text-sm text-n-3 line-clamp-2">
                  {request.itemDescription}
                </p>
              )}
            </div>

            {/* Price */}
            <div className="mb-4 p-3 bg-n-7 rounded-lg border border-n-6">
              <p className="text-xs text-n-4 mb-1">Price</p>
              <p className="text-lg font-bold text-n-1">
                {getCurrencySymbol(request.priceCurrency)} {request.priceAmount.toLocaleString()}
              </p>
            </div>


            {/* Payment Methods */}
            <div className="mb-4">
              <p className="text-xs text-n-4 mb-2">Payment Methods</p>
              <div className="flex flex-wrap gap-2">
                {request.paymentMethods.slice(0, 3).map((method, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 text-xs bg-n-6 text-n-3 rounded border border-n-5"
                  >
                    {method === 'bitcoin' ? '₿ Bitcoin' :
                     method === 'ethereum' ? 'Ξ Ethereum' :
                     method === 'litecoin' ? 'Ł Litecoin' :
                     method === 'bank-transfer' ? '🏦 Bank' :
                     method === 'paypal' ? 'PayPal' :
                     method === 'zelle' ? 'Zelle' :
                     method}
                  </span>
                ))}
                {request.paymentMethods.length > 3 && (
                  <span className="px-2 py-1 text-xs bg-n-6 text-n-3 rounded border border-n-5">
                    +{request.paymentMethods.length - 3} more
                  </span>
                )}
              </div>
            </div>

            {/* Warranty Badge */}
            {request.warrantyAvailable && (
              <div className="mb-4 px-3 py-2 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg">
                <p className="text-xs font-semibold text-[#10B981]">
                  🛡️ Warranty: {request.warrantyDuration.replace('h', ' Hours').replace('days', ' Days')}
                </p>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="mt-auto">
            <div className="flex items-center justify-between mb-3 text-[0.7rem] text-n-4">
              <span>Request ID</span>
              <span className="font-mono text-n-2 text-right break-all">
                {request.requestId || request._id}
              </span>
            </div>
            {/* Expires */}
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="text-n-4">Expires in</span>
              <span className={isExpired ? "text-red-400 font-semibold" : "text-[#F59E0B] font-semibold"}>
                {timeRemaining}
              </span>
            </div>

            {/* Action Button */}
            <button
              onClick={handleTrade}
              disabled={isExpired || isCreatingTicket}
              className={`w-full py-3 rounded-lg font-semibold transition-all ${
                isExpired
                  ? 'bg-n-6 text-n-4 cursor-not-allowed'
                  : request.type === 'selling'
                  ? 'bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg shadow-[#10B981]/20'
                  : 'bg-gradient-to-r from-[#EF4444] to-[#DC2626] hover:from-[#DC2626] hover:to-[#B91C1C] text-white shadow-lg shadow-[#EF4444]/20'
              }`}
            >
              {isCreatingTicket ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating Ticket...</span>
                </div>
              ) : isExpired ? (
                'Expired'
              ) : request.type === 'selling' ? (
                `Buy from ${request.creator.username}`
              ) : (
                `Sell to ${request.creator.username}`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-n-8 rounded-2xl border border-n-6 max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-n-1 mb-4">Delete Trade Request?</h3>
            <p className="text-sm text-n-3 mb-6">
              Are you sure you want to delete this trade request? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-lg bg-n-6 hover:bg-n-5 text-n-1 font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold transition-all shadow-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

            {/* Payment Method Selection Modal */}
      {showPaymentMethodModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-n-8 rounded-2xl border border-n-6 max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-n-1 mb-4">Select Payment Method</h3>
            <p className="text-sm text-n-3 mb-6">
              Choose how you want to pay for this item. A trade ticket will be created with the selected cryptocurrency.
            </p>
            <p className="text-xs text-n-4 mb-4">
              Automated payout is currently supported only for Ethereum tickets.
            </p>

            {unavailableNotice && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-400/40 rounded-lg">
                <p className="text-sm text-amber-200 font-semibold">
                  {unavailableNotice.message}
                </p>
                <p className="text-xs text-amber-100 mt-2">
                  This window will close automatically in {noticeSecondsRemaining}s.
                </p>
              </div>
            )}

            {/* Filter only crypto payment methods */}
            <div className="space-y-2 mb-6 max-h-80 overflow-y-auto">
              {cryptoPaymentMethods.map((method) => {
                const info = METHOD_INFO[method];
                const isAvailable = isTicketCoinAvailable(method);
                if (!info) return null;

                return (
                  <button
                    key={method}
                    disabled={!isAvailable || isCreatingTicket || availabilityLoading || Boolean(unavailableNotice)}
                    onClick={async () => {
                      await createTicket(method);
                    }}
                    className={`w-full p-4 rounded-lg border-2 bg-n-7 transition-all flex items-center gap-3 ${
                      isAvailable && !unavailableNotice
                        ? 'border-n-6 hover:border-[#10B981] hover:bg-n-7/50'
                        : 'border-n-6 opacity-55 cursor-not-allowed'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg"
                      style={{ backgroundColor: info.color }}
                    >
                      {info.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-n-1">{info.label}</div>
                      <div className={`text-xs ${isAvailable ? 'text-n-4' : 'text-amber-200'}`}>
                        {isAvailable ? `Pay with ${info.label}` : `${info.label} tickets currently unavailable`}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}

              {cryptoPaymentMethods.length === 0 && (
                <div className="text-center py-8 text-n-4">
                  <p>No cryptocurrency payment methods available.</p>
                  <p className="text-xs mt-2">This seller does not accept crypto payments.</p>
                </div>
              )}
            </div>

            {/* Cancel Button */}
            <button
              onClick={closePaymentMethodModal}
              className="w-full py-3 rounded-lg bg-n-6 hover:bg-n-5 text-n-1 font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeRequestCard;

