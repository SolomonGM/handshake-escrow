import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { toast } from "../utils/toast";

const API_URL = import.meta.env.VITE_API_URL || '/api';
const UNAVAILABLE_AUTO_CLOSE_SECONDS = 120;

const supportedCryptos = [
  { value: "bitcoin", label: "Bitcoin", symbol: "BTC" },
  { value: "ethereum", label: "Ethereum", symbol: "ETH" },
  { value: "litecoin", label: "Litecoin", symbol: "LTC" },
  { value: "solana", label: "Solana", symbol: "SOL" },
  { value: "usdt-erc20", label: "USDT [ERC-20]", symbol: "USDT" },
  { value: "usdc-erc20", label: "USDC [ERC-20]", symbol: "USDC" },
];

const defaultTicketAvailability = {
  bitcoin: false,
  ethereum: true,
  litecoin: false,
  solana: false,
  'usdt-erc20': false,
  'usdc-erc20': false,
};

const CreateTradeModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [selectedCrypto, setSelectedCrypto] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [ticketAvailability, setTicketAvailability] = useState(defaultTicketAvailability);
  const [unavailableNotice, setUnavailableNotice] = useState(null);
  const [noticeSecondsRemaining, setNoticeSecondsRemaining] = useState(0);

  const closeTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

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

  const resetModalState = () => {
    clearNoticeTimers();
    setUnavailableNotice(null);
    setNoticeSecondsRemaining(0);
    setSelectedCrypto("");
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  const selectedCryptoMeta = useMemo(
    () => supportedCryptos.find((coin) => coin.value === selectedCrypto) || null,
    [selectedCrypto]
  );

  const showUnavailableNotice = ({ message, cryptocurrency, unavailableForSeconds }) => {
    const durationSeconds = Number(unavailableForSeconds) > 0
      ? Number(unavailableForSeconds)
      : UNAVAILABLE_AUTO_CLOSE_SECONDS;
    const closeAt = Date.now() + durationSeconds * 1000;

    clearNoticeTimers();
    setUnavailableNotice({
      message: message || 'This ticket type is currently unavailable.',
      cryptocurrency,
      closeAt,
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
      handleClose();
    }, durationSeconds * 1000);
  };

  const fetchTicketAvailability = useCallback(async () => {
    if (!token) {
      setTicketAvailability(defaultTicketAvailability);
      return;
    }

    try {
      setAvailabilityLoading(true);
      const response = await axios.get(`${API_URL}/tickets/availability`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data?.success && response.data?.ticketAvailability) {
        setTicketAvailability({
          ...defaultTicketAvailability,
          ...response.data.ticketAvailability
        });
      }
    } catch (error) {
      console.error('Failed to load ticket availability:', error);
      setTicketAvailability(defaultTicketAvailability);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    fetchTicketAvailability();
  }, [isOpen, fetchTicketAvailability]);

  useEffect(() => {
    return () => {
      clearNoticeTimers();
    };
  }, []);

  const handleStartDeal = async () => {
    if (!selectedCrypto) {
      toast.warning("Please select a cryptocurrency");
      return;
    }

    if (!token) {
      toast.error("Please login first to create a ticket");
      return;
    }

    if (!ticketAvailability[selectedCrypto]) {
      showUnavailableNotice({
        message: `${selectedCryptoMeta?.label || selectedCrypto.toUpperCase()} tickets are currently unavailable. Please try again later or contact staff.`,
        cryptocurrency: selectedCrypto,
        unavailableForSeconds: UNAVAILABLE_AUTO_CLOSE_SECONDS
      });
      return;
    }

    try {
      setIsCreating(true);
      const response = await axios.post(
        `${API_URL}/tickets`,
        { cryptocurrency: selectedCrypto },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        const encodedTicketId = encodeURIComponent(response.data.ticket.ticketId);
        navigate(`/trade-ticket?ticketId=${encodedTicketId}`);
        handleClose();
      }
    } catch (error) {
      const errorData = error.response?.data;

      if (error.response?.status === 409 && errorData?.code === 'TICKET_COIN_UNAVAILABLE') {
        showUnavailableNotice({
          message: errorData.message,
          cryptocurrency: errorData.cryptocurrency || selectedCrypto,
          unavailableForSeconds: errorData.unavailableForSeconds
        });
        return;
      }

      console.error('Error creating ticket:', error);
      toast.error(errorData?.message || 'Failed to create ticket');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="relative bg-n-8 border border-n-6 rounded-2xl p-8 shadow-2xl">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-n-4 hover:text-n-1 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold text-n-1">Ticket</h2>
              <span className="px-2 py-0.5 text-xs font-bold bg-[#10B981] text-white rounded">
                BOT
              </span>
            </div>
          </div>

          {unavailableNotice && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-400/40 rounded-lg">
              <p className="text-sm text-amber-200 font-semibold">
                {unavailableNotice.message}
              </p>
              <p className="text-xs text-amber-100 mt-2">
                This window will close automatically in {noticeSecondsRemaining}s.
              </p>
            </div>
          )}

          <div className="mb-6 p-4 bg-n-7 border border-n-6 rounded-lg">
            <h3 className="text-sm font-bold text-n-1 mb-3">Fees:</h3>
            <div className="space-y-2 text-sm">
              <p className="text-n-3">
                <span className="text-n-1">Deals $250+ </span>
                <span className="text-[#10B981] font-semibold">1%</span>
              </p>
              <p className="text-n-3">
                <span className="text-n-1">Deals under $250: </span>
                <span className="text-[#10B981] font-semibold">$2</span>
              </p>
              <p className="text-n-3">
                <span className="text-n-1">Deals under $50: </span>
                <span className="text-[#10B981] font-semibold">$0.50</span>
              </p>
              <p className="text-n-3">
                <span className="text-n-1">Deals under $10 are </span>
                <span className="text-[#10B981] font-semibold">FREE</span>
              </p>
              <p className="text-n-3 pt-2 border-t border-n-6">
                <span className="text-n-1">USDT & USDC has </span>
                <span className="text-[#F59E0B] font-semibold">$1 surcharge</span>
              </p>
            </div>
          </div>

          <p className="text-sm text-n-3 mb-4">
            Select a ticket network below. Coins marked unavailable cannot be created until an admin enables them.
          </p>

          <div className="space-y-4">
            <select
              value={selectedCrypto}
              onChange={(e) => setSelectedCrypto(e.target.value)}
              disabled={availabilityLoading || Boolean(unavailableNotice)}
              className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 text-sm focus:outline-none focus:border-[#10B981] transition-colors cursor-pointer appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23999'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.5em 1.5em',
                paddingRight: '2.5rem'
              }}
            >
              <option value="" disabled>
                {availabilityLoading ? 'Loading availability...' : 'Make a selection'}
              </option>
              {supportedCryptos.map((crypto) => {
                const available = Boolean(ticketAvailability[crypto.value]);
                return (
                  <option key={crypto.value} value={crypto.value} disabled={!available}>
                    {crypto.label} ({crypto.symbol}){available ? '' : ' - unavailable'}
                  </option>
                );
              })}
            </select>

            <button
              onClick={handleStartDeal}
              disabled={!selectedCrypto || isCreating || availabilityLoading || Boolean(unavailableNotice)}
              className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                selectedCrypto && !isCreating && !availabilityLoading && !unavailableNotice
                  ? "bg-gradient-to-r from-[#10B981] to-[#059669] hover:shadow-lg hover:shadow-[#10B981]/20 hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-n-6 cursor-not-allowed opacity-50"
              }`}
            >
              {isCreating ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <span>Start Deal</span>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-n-4 text-center mt-4">
            Automated payout is currently available only for Ethereum tickets.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CreateTradeModal;
