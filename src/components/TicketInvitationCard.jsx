import { useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TicketInvitationCard = ({ ticket, onRespond }) => {
  const [isResponding, setIsResponding] = useState(false);
  const [error, setError] = useState(null);

  const cryptoInfo = {
    'bitcoin': { name: 'Bitcoin', symbol: 'BTC', color: '#F7931A', gradient: 'from-[#F7931A] to-[#f5a623]' },
    'ethereum': { name: 'Ethereum', symbol: 'ETH', color: '#627EEA', gradient: 'from-[#627EEA] to-[#8c9eff]' },
    'litecoin': { name: 'Litecoin', symbol: 'LTC', color: '#345D9D', gradient: 'from-[#345D9D] to-[#5e7fb8]' },
    'solana': { name: 'Solana', symbol: 'SOL', color: '#14F195', gradient: 'from-[#14F195] to-[#9945FF]' },
    'usdt-erc20': { name: 'USDT [ERC-20]', symbol: 'USDT', color: '#26A17B', gradient: 'from-[#26A17B] to-[#50AF95]' },
    'usdc-erc20': { name: 'USDC [ERC-20]', symbol: 'USDC', color: '#2775CA', gradient: 'from-[#2775CA] to-[#5B9BD5]' },
  };

  const crypto = cryptoInfo[ticket.cryptocurrency] || cryptoInfo['bitcoin'];

  const handleRespond = async (action) => {
    setIsResponding(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      // URL encode the ticketId to handle the # symbol
      const encodedTicketId = encodeURIComponent(ticket.ticketId);
      await axios.post(
        `${API_URL}/tickets/${encodedTicketId}/respond`,
        { action },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      onRespond(action);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to respond to invitation');
      setIsResponding(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="relative group">
      {/* Animated gradient border effect */}
      <div className={`absolute -inset-0.5 bg-gradient-to-r ${crypto.gradient} rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300`}></div>
      
      {/* Card content */}
      <div className="relative bg-n-8 border border-n-6 rounded-2xl p-6 hover:border-n-5 transition-all duration-300">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Creator profile picture */}
            <div className="relative">
              {ticket.creator?.avatar ? (
                <img 
                  src={ticket.creator.avatar} 
                  alt={ticket.creator.username}
                  className="w-12 h-12 rounded-xl object-cover border-2 border-n-6"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div 
                className={`w-12 h-12 bg-gradient-to-br ${crypto.gradient} rounded-xl flex items-center justify-center shadow-lg ${ticket.creator?.avatar ? 'hidden' : ''}`}
                style={{ display: ticket.creator?.avatar ? 'none' : 'flex' }}
              >
                <span className="text-white font-bold text-lg">
                  {ticket.creator?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
            </div>
            
            <div>
              <h3 className="text-n-1 font-bold text-lg">Trade Invitation</h3>
              <p className="text-n-4 text-sm font-code">{ticket.ticketId}</p>
            </div>
          </div>

          {/* Crypto badge */}
          <div className={`px-3 py-1 bg-gradient-to-r ${crypto.gradient} rounded-full`}>
            <span className="text-white text-xs font-bold">{crypto.symbol}</span>
          </div>
        </div>

        {/* Invitation details */}
        <div className="space-y-3 mb-5">
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-n-3">
              From: <span className="text-n-1 font-semibold">{ticket.creator?.username || 'Unknown'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-n-3">
              Received: <span className="text-n-1">{formatDate(ticket.createdAt)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-n-3">
              Cryptocurrency: <span className="text-n-1 font-semibold">{crypto.name}</span>
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-n-6 to-transparent mb-5"></div>

        {/* Info box */}
        <div className="bg-n-7 border border-n-6 rounded-lg p-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-[#10B981]/20 border border-[#10B981]/30 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-n-3 text-sm leading-relaxed">
                You've been invited to participate in this {crypto.name} trade ticket. Accept to join the secure escrow deal or decline to reject the invitation.
              </p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleRespond('accept')}
            disabled={isResponding}
            className={`flex-1 px-6 py-3 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:shadow-[#10B981]/20 ${
              isResponding ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{isResponding ? 'Processing...' : 'Accept'}</span>
          </button>

          <button
            onClick={() => handleRespond('decline')}
            disabled={isResponding}
            className={`flex-1 px-6 py-3 bg-n-7 hover:bg-red-500/10 border border-n-6 hover:border-red-500/50 text-n-3 hover:text-red-400 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
              isResponding ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>{isResponding ? 'Processing...' : 'Decline'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

TicketInvitationCard.propTypes = {
  ticket: PropTypes.shape({
    ticketId: PropTypes.string.isRequired,
    cryptocurrency: PropTypes.string.isRequired,
    creator: PropTypes.shape({
      username: PropTypes.string
    }),
    createdAt: PropTypes.string.isRequired
  }).isRequired,
  onRespond: PropTypes.func.isRequired
};

export default TicketInvitationCard;
