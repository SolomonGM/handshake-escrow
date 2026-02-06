import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { toast } from "../utils/toast";

const API_URL = 'http://localhost:5001/api';

const CreateTradeModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [selectedCrypto, setSelectedCrypto] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const supportedCryptos = [
    { value: "bitcoin", label: "Bitcoin", symbol: "BTC" },
    { value: "ethereum", label: "Ethereum", symbol: "ETH" },
    { value: "litecoin", label: "Litecoin", symbol: "LTC" },
    { value: "solana", label: "Solana", symbol: "SOL" },
    { value: "usdt-erc20", label: "USDT [ERC-20]", symbol: "USDT" },
    { value: "usdc-erc20", label: "USDC [ERC-20]", symbol: "USDC" },
  ];

  const handleStartDeal = async () => {
    if (!selectedCrypto) {
      toast.warning("Please select a cryptocurrency");
      return;
    }

    if (!token) {
      toast.error("Please login first to create a ticket");
      return;
    }

    try {
      setIsCreating(true);
      console.log('Creating ticket with crypto:', selectedCrypto);
      
      // Create ticket via API
      const response = await axios.post(
        `${API_URL}/tickets`,
        { cryptocurrency: selectedCrypto },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('Ticket creation response:', response.data);

      if (response.data.success) {
        // Navigate to the ticket page (URL encode the ticketId to handle # symbol)
        const encodedTicketId = encodeURIComponent(response.data.ticket.ticketId);
        navigate(`/trade-ticket?ticketId=${encodedTicketId}`);
        onClose();
        setSelectedCrypto(""); // Reset selection
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      console.error('Error response:', error.response?.data);
      alert(error.response?.data?.message || 'Failed to create ticket');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="relative bg-n-8 border border-n-6 rounded-2xl p-8 shadow-2xl">
          {/* Close Button */}
          <button
            onClick={onClose}
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

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold text-n-1">Ticket</h2>
              <span className="px-2 py-0.5 text-xs font-bold bg-[#10B981] text-white rounded">
                BOT
              </span>
            </div>
          </div>

          {/* Fee Information */}
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
                <span className="text-[#F59E0B] font-semibold">$1 subcharge</span>
              </p>
            </div>
          </div>

          {/* Instructions */}
          <p className="text-sm text-n-3 mb-4">
            Press the dropdown below to select & initiate a deal involving:{" "}
            <span className="text-n-1 font-semibold">
              Bitcoin, Ethereum, Litecoin, Solana, USDT [ERC-20], USDC [ERC-20]
            </span>
            .
          </p>

          {/* Dropdown and Button */}
          <div className="space-y-4">
            {/* Dropdown */}
            <select
              value={selectedCrypto}
              onChange={(e) => setSelectedCrypto(e.target.value)}
              className="w-full px-4 py-3 bg-n-7 border border-n-6 rounded-lg text-n-1 text-sm focus:outline-none focus:border-[#10B981] transition-colors cursor-pointer appearance-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23999'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.5em 1.5em',
                paddingRight: '2.5rem'
              }}
            >
              <option value="" disabled>
                Make a selection
              </option>
              {supportedCryptos.map((crypto) => (
                <option key={crypto.value} value={crypto.value}>
                  {crypto.label} ({crypto.symbol})
                </option>
              ))}
            </select>

            {/* Start Deal Button */}
            <button
              onClick={handleStartDeal}
              disabled={!selectedCrypto || isCreating}
              className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                selectedCrypto && !isCreating
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

          {/* Additional Info */}
          <p className="text-xs text-n-4 text-center mt-4">
            By proceeding, you agree to our terms and escrow service conditions
          </p>
        </div>
      </div>
    </div>
  );
};

export default CreateTradeModal;
