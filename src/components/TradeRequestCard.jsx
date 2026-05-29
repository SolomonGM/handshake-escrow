import { useState } from "react";
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import axios from "axios";
import { toast } from "../utils/toast";
import { paymentMethodLogos } from "../assets/currencies";

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TradeRequestCard = ({ request, onUpdate, currentUser }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCreator = currentUser && request.creator._id === currentUser.id;
  const creatorUserId = request.creator?.userId || request.creator?._id || '';

  const getTimeRemaining = (expiresAt) => {
    const diff = new Date(expiresAt) - new Date();
    if (diff < 0) return "Expired";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  const getCurrencySymbol = (currency) => {
    const symbols = {
      USD: '$', EUR: '€', GBP: '£',
      bitcoin: '₿', ethereum: 'Ξ', litecoin: 'Ł',
      solana: 'SOL', 'usdt-erc20': 'USDT', 'usdc-erc20': 'USDC',
    };
    return symbols[currency] || String(currency || '').toUpperCase();
  };

  const getReputationScore = () => {
    if (!request.creator.totalTrades) return 0;
    const completionRate = (request.creator.completedTrades / request.creator.totalTrades) * 100;
    return Math.min(Math.round(completionRate), 100);
  };

  const reputation = getReputationScore();

  const handleCopyId = async () => {
    if (!creatorUserId) {
      toast.error('No user ID available');
      return;
    }
    try {
      await navigator.clipboard.writeText(String(creatorUserId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      toast.error('Could not copy ID');
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('token');
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

  const typeStyle = request.type === "buying"
    ? { bg: "bg-[#10B981]/10", text: "text-[#10B981]", border: "border-[#10B981]/30", label: "BUYING" }
    : { bg: "bg-[#EF4444]/10", text: "text-[#EF4444]", border: "border-[#EF4444]/30", label: "SELLING" };

  const timeRemaining = getTimeRemaining(request.expiresAt);
  const isExpired = timeRemaining === "Expired";

  const visibleMethods = (request.paymentMethods || []).slice(0, 4);
  const extraMethodCount = Math.max(0, (request.paymentMethods?.length || 0) - visibleMethods.length);

  return (
    <div className="relative group">
      <div className="block relative p-0.5 bg-no-repeat bg-[length:100%_100%]">
        <div className="relative z-2 flex flex-col min-h-[28rem] p-[2rem] bg-n-8 rounded-[1rem] border border-n-6 hover:border-n-5 transition-colors">

          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className={`px-3 py-1.5 rounded-lg ${typeStyle.bg} border ${typeStyle.border}`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${typeStyle.text}`}>
                {request.type === "buying" ? "🟢 " : "🔴 "}{typeStyle.label}
              </span>
            </div>

            {isCreator ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-10 h-10 rounded-lg bg-n-7 border border-n-6 hover:border-red-500 flex items-center justify-center transition-colors group/btn"
                title="Delete Request"
              >
                <svg className="w-5 h-5 text-n-4 group-hover/btn:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
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
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-n-1 truncate">@{request.creator.username}</span>
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

            <div className="mb-4 p-3 bg-n-7 rounded-lg border border-n-6">
              <p className="text-xs text-n-4 mb-1">Price</p>
              <p className="text-lg font-bold text-n-1">
                {getCurrencySymbol(request.priceCurrency)} {Number(request.priceAmount || 0).toLocaleString()}
              </p>
            </div>

            {/* Payment Methods — real PNG logos */}
            <div className="mb-4">
              <p className="text-xs text-n-4 mb-2">Payment Methods</p>
              <div className="flex flex-wrap gap-2">
                {visibleMethods.map((method, idx) => {
                  const info = paymentMethodLogos[method];
                  if (!info) {
                    return (
                      <span key={idx} className="px-2 py-1 text-xs bg-n-6 text-n-3 rounded border border-n-5">
                        {method}
                      </span>
                    );
                  }
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 bg-n-6 text-n-2 text-xs rounded border border-n-5"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 p-0.5">
                        <img src={info.logo} alt={info.label} className="h-full w-full object-contain" />
                      </span>
                      {info.label}
                    </span>
                  );
                })}
                {extraMethodCount > 0 && (
                  <span className="px-2 py-1 text-xs bg-n-6 text-n-3 rounded border border-n-5">
                    +{extraMethodCount} more
                  </span>
                )}
              </div>
            </div>

            {request.warrantyAvailable && (
              <div className="mb-4 px-3 py-2 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg">
                <p className="text-xs font-semibold text-[#10B981]">
                  🛡️ Warranty: {String(request.warrantyDuration || '').replace('h', ' Hours').replace('days', ' Days')}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-auto">
            <div className="flex items-center justify-between mb-3 text-[0.7rem] text-n-4">
              <span>Listing ID</span>
              <span className="font-mono text-n-2 text-right break-all">
                {request.requestId || request._id}
              </span>
            </div>
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="text-n-4">Expires in</span>
              <span className={isExpired ? "text-red-400 font-semibold" : "text-[#F59E0B] font-semibold"}>
                {timeRemaining}
              </span>
            </div>

            {/* User ID + Copy — replaces the old "Buy/Sell from X" button */}
            <div className="rounded-lg border border-n-6 bg-n-7 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[0.7rem] uppercase tracking-wider text-n-4">
                  {request.type === 'selling' ? "Seller's User ID" : "Buyer's User ID"}
                </span>
                <span className="text-[10px] text-n-4">@{request.creator.username}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate font-mono text-sm text-n-1">
                  {creatorUserId || '—'}
                </code>
                <button
                  type="button"
                  onClick={handleCopyId}
                  disabled={isExpired || !creatorUserId}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all border ${
                    copied
                      ? 'border-[#10B981] bg-[#10B981] text-white'
                      : isExpired || !creatorUserId
                        ? 'border-n-6 bg-n-6 text-n-4 cursor-not-allowed'
                        : 'border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 hover:border-[#10B981]/70'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy ID
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-n-4 leading-relaxed">
                Create your own ticket and invite this user with their ID to negotiate the trade safely.
              </p>
            </div>
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
    </div>
  );
};

export default TradeRequestCard;
