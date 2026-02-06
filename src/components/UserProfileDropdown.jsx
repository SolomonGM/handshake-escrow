import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const UserProfileDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Get rank color based on rank
  const getRankColor = (rank) => {
    const colors = {
      'whale': 'text-[#1e40af]', // dark blue
      'top client': 'text-[#9333ea]', // purple
      'rich client': 'text-[#ea580c]', // orange
      'client': 'text-[#06b6d4]', // cyan
      'developer': 'text-[#ef4444]', // red
    };
    return colors[rank] || colors['client'];
  };

  // Get rank background color for badge
  const getRankBgColor = (rank) => {
    const colors = {
      'whale': 'bg-[#1e40af]/20 border-[#1e40af]/50', // dark blue
      'top client': 'bg-[#9333ea]/20 border-[#9333ea]/50', // purple
      'rich client': 'bg-[#ea580c]/20 border-[#ea580c]/50', // orange
      'client': 'bg-[#06b6d4]/20 border-[#06b6d4]/50', // cyan
      'developer': 'bg-[#ef4444]/20 border-[#ef4444]/50', // red
    };
    return colors[rank] || colors['client'];
  };

  // Calculate XP progress (max 1000 XP per level)
  const maxXP = 1000;
  const currentXP = user?.xp || 500;
  const xpProgress = (currentXP / maxXP) * 100;
  const isMaxedOut = currentXP >= maxXP;

  const handleNavigation = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setIsOpen(false);
    logout();
    navigate('/');
  };

  // Get user initials for avatar fallback
  const getInitials = (username) => {
    return username?.charAt(0).toUpperCase() || 'U';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar and dropdown trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 transition-all duration-300"
      >
        {/* Rank Badge and Progress Bar Container */}
        <div className="flex flex-col gap-2 items-center min-w-[64px]">
          {/* Rank Badge */}
          {user?.rank === 'developer' ? (
            <div className="px-2 py-0.5 rounded-md border border-n-1/20 text-xs font-semibold uppercase tracking-wider text-center bg-n-8/50 whitespace-nowrap">
              <span className="gradient-text">Developer</span>
            </div>
          ) : (
            <div className={`px-2 py-0.5 rounded-md border text-xs font-semibold uppercase tracking-wider text-center whitespace-nowrap ${getRankBgColor(user?.rank)} ${getRankColor(user?.rank)}`}>
              {user?.rank || 'client'}
            </div>
          )}
          
          {/* XP Progress Bar - Compact */}
          <div className="relative h-1.5 w-16 bg-n-7 rounded-full overflow-hidden border border-n-6 flex-shrink-0">
            <div
              className="absolute inset-y-0 right-0 rounded-full transition-all duration-500"
              style={{
                width: `${xpProgress}%`,
                background: isMaxedOut && user?.rank === 'developer'
                  ? 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)'
                  : 'linear-gradient(270deg, #10B981 0%, #7ADB78 50%, #34D399 100%)',
                backgroundSize: isMaxedOut && user?.rank === 'developer' ? '200% 100%' : '100% 100%',
                animation: isMaxedOut && user?.rank === 'developer' ? 'rainbow 2s linear infinite' : 'none',
                boxShadow: isMaxedOut && user?.rank === 'developer' 
                  ? '0 0 10px rgba(255, 0, 255, 0.5)' 
                  : '0 0 8px rgba(16, 185, 129, 0.4)',
              }}
            />
          </div>
        </div>

        {/* Avatar */}
        <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-n-6 transition-colors duration-300">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.username}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-color-1 to-color-5 flex items-center justify-center text-n-1 font-bold text-lg">
              {getInitials(user?.username)}
            </div>
          )}
        </div>

        {/* Dropdown arrow */}
        <svg
          className={`w-4 h-4 text-n-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-n-8 border border-n-6 rounded-lg shadow-xl overflow-hidden z-50">
          {/* User Info Header */}
          <div className="p-4 border-b border-n-6 bg-n-7/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-n-6">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-color-1 to-color-5 flex items-center justify-center text-n-1 font-bold text-xl">
                    {getInitials(user?.username)}
                  </div>
                )}
              </div>
              <div>
                <p className="text-n-1 font-semibold">{user?.username}</p>
                {user?.rank === 'developer' ? (
                  <div className="inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase bg-n-8/50 border border-n-1/20">
                    <span className="gradient-text">Developer</span>
                  </div>
                ) : (
                  <div className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase ${getRankBgColor(user?.rank)} ${getRankColor(user?.rank)}`}>
                    {user?.rank || 'client'}
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-n-4">
              <span className="text-n-3">{currentXP}</span> / {maxXP} XP • <span className="text-color-4 font-semibold">{user?.passes || 0}</span> Passes
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <button
              onClick={() => handleNavigation('/settings')}
              className="w-full px-4 py-3 text-left text-n-1 hover:bg-n-7/50 transition-colors duration-200 flex items-center gap-3"
            >
              <svg className="w-5 h-5 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Settings</span>
            </button>

            {/* Admin Panel - Only for developers */}
            {user?.rank === 'developer' && (
              <button
                onClick={() => handleNavigation('/settings?tab=admin')}
                className="w-full px-4 py-3 text-left text-[#ef4444] hover:bg-n-7/50 transition-colors duration-200 flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Admin Panel</span>
              </button>
            )}

            <button
              onClick={() => handleNavigation('/settings?tab=transactions')}
              className="w-full px-4 py-3 text-left text-n-1 hover:bg-n-7/50 transition-colors duration-200 flex items-center gap-3"
            >
              <svg className="w-5 h-5 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Transaction History</span>
            </button>

            <button
              onClick={() => handleNavigation('/support')}
              className="w-full px-4 py-3 text-left text-n-1 hover:bg-n-7/50 transition-colors duration-200 flex items-center gap-3"
            >
              <svg className="w-5 h-5 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Support</span>
            </button>

            <div className="border-t border-n-6 my-2"></div>

            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 text-left text-red-400 hover:bg-n-7/50 transition-colors duration-200 flex items-center gap-3"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

UserProfileDropdown.propTypes = {};

export default UserProfileDropdown;
