import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getRankBadge, getRankColor, getRankLabel, normalizeRank } from '../utils/rankDisplay';
import { grid } from '../assets';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const UserProfileModal = ({ userId, onClose }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedUserId, setCopiedUserId] = useState(false);

  const normalizedRank = normalizeRank(profile?.rank);
  const rankLabel = getRankLabel(profile?.rank);
  const rankBadge = getRankBadge(profile?.rank);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        console.log('Fetching profile for userId:', userId);
        const token = localStorage.getItem('token');
        
        if (!token) {
          console.error('No token found');
          setProfile(null);
          return;
        }

        const response = await fetch(`${API_URL}/auth/profile/${userId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log('Profile response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('Profile data received:', data);
          setProfile(data.user);
        } else {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          console.error('Failed to fetch profile:', response.status, errorData);
          setProfile(null);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchProfile();
    } else {
      console.warn('No userId provided to UserProfileModal');
      setLoading(false);
    }
  }, [userId]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatUSD = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const copyUserId = () => {
    if (profile?.userId) {
      navigator.clipboard.writeText(profile.userId);
      setCopiedUserId(true);
      setTimeout(() => setCopiedUserId(false), 2000);
    }
  };


  // Close on backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-gradient-to-br from-n-7 via-n-8 to-n-7 rounded-2xl border border-n-6 shadow-2xl max-w-md w-full overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-n-4 hover:text-n-1 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {loading ? (
          // Loading State
          <div className="p-8 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-n-6 border-t-color-4 rounded-full animate-spin mb-4"></div>
            <p className="text-n-4 text-sm">Loading profile...</p>
          </div>
        ) : profile ? (
          <>
            {/* Header Background with Gradient */}
            <div className="h-24 bg-gradient-to-r from-color-4/20 to-color-5/20 relative">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-10"
                style={{ backgroundImage: `url(${grid})` }}
              />
            </div>

            {/* Profile Content */}
            <div className="px-6 pb-6 -mt-12">
              {/* Avatar */}
              <div className="flex justify-center mb-4">
                <div className="relative">
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={profile.username}
                      className="w-24 h-24 rounded-full object-cover bg-n-6 border-4 border-n-8 shadow-xl"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        const fallback = e.target.nextElementSibling;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="w-24 h-24 rounded-full bg-n-6 flex items-center justify-center text-n-1 text-3xl font-bold border-4 border-n-8 shadow-xl"
                    style={{ display: profile.avatar ? 'none' : 'flex' }}
                  >
                    {profile.username.charAt(0).toUpperCase()}
                  </div>

                  {/* Badge */}
                  {rankBadge && (
                    <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-n-8 rounded-full flex items-center justify-center border-2 border-n-6">
                      <img
                        src={rankBadge}
                        alt={`${rankLabel} badge`}
                        className="w-8 h-8"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Username and Rank */}
              <div className="text-center mb-6">
                {normalizedRank === 'developer' ? (
                  <h2 className="text-2xl font-bold gradient-text mb-1">
                    {profile.username}
                  </h2>
                ) : (
                  <h2
                    className="text-2xl font-bold mb-1"
                    style={{ color: getRankColor(profile.rank) }}
                  >
                    {profile.username}
                  </h2>
                )}
                <p className="text-n-4 text-sm">{rankLabel}</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {/* Total USD Value */}
                <div className="bg-n-7/50 border border-n-6 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-n-4 text-xs font-medium">Total Value</p>
                  </div>
                  <p className="text-n-1 text-xl font-bold">{formatUSD(profile.totalUSDValue || 0)}</p>
                </div>

                {/* Total Deals */}
                <div className="bg-n-7/50 border border-n-6 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                    <p className="text-n-4 text-xs font-medium">Total Deals</p>
                  </div>
                  <p className="text-n-1 text-xl font-bold">{profile.totalDeals || 0}</p>
                </div>
              </div>

              {/* User ID */}
              <div className="bg-n-7 border border-n-6 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-n-4 text-xs font-medium">User ID</label>
                  <button
                    onClick={copyUserId}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                      copiedUserId
                        ? 'bg-green-500/20 text-green-500'
                        : 'bg-n-6 text-n-4 hover:bg-n-5 hover:text-n-1'
                    }`}
                  >
                    {copiedUserId ? (
                      <>
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-n-8 rounded px-3 py-2 font-mono text-n-1 text-sm break-all">
                  {profile.userId}
                </div>
                <p className="text-n-5 text-xs mt-2">
                  Use this ID to add user to ticket system
                </p>
              </div>

              {/* Join Date */}
              <div className="flex items-center justify-center gap-2 text-n-4 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Joined {formatDate(profile.createdAt)}</span>
              </div>
            </div>
          </>
        ) : (
          // Error State
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-red-500/10 border-2 border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-n-4 mb-2">Failed to load profile</p>
            <button
              onClick={onClose}
              className="text-n-3 hover:text-n-1 text-sm transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

UserProfileModal.propTypes = {
  userId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default UserProfileModal;
