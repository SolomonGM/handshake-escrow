import React from "react";
import Section from "./Section";
import { Gradient } from "./design/Leaderboard";
import { discordAPI, leaderboardAPI } from "../services/api";

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = React.useState([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = React.useState(true);

  const fallbackStaff = {
    username: "Sully™",
    role: "Founder & Developer",
    bio: "Building the future of P2P crypto trading. Available 24/7 for support and inquiries.",
    discordUsername: "sullymoon",
    avatar: "https://cdn.discordapp.com/avatars/983995784624230410/fc62158009f835333883214f8466ba63.png?size=512",
    banner: "https://i.pinimg.com/originals/75/ae/36/75ae36e317b6b207fe440d004667f34f.gif",
  };

  const [copied, setCopied] = React.useState(false);
  const [staff, setStaff] = React.useState(fallbackStaff);

  React.useEffect(() => {
    let isMounted = true;

    const loadDiscordProfile = async () => {
      try {
        const response = await discordAPI.getProfile();
        const profile = response?.profile;

        if (!profile) {
          throw new Error('Discord profile unavailable');
        }

        if (!isMounted) {
          return;
        }

        setStaff((prev) => ({
          ...prev,
          username: profile.displayName || prev.username,
          discordUsername: profile.tag || profile.username || prev.discordUsername,
          avatar: profile.avatarUrl || prev.avatar,
          banner: profile.bannerUrl || prev.banner
        }));

        if (response?.stale) {
          console.warn('Discord profile response is stale.');
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        console.warn('Discord profile fetch failed:', error.message);
      }
    };

    loadDiscordProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const loadLeaderboard = async () => {
      try {
        const response = await leaderboardAPI.getLeaderboard();
        const entries = Array.isArray(response?.leaderboard) ? response.leaderboard : [];

        if (!isMounted) {
          return;
        }

        setLeaderboard(entries);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        console.warn('Leaderboard fetch failed:', error.message);
        setLeaderboard([]);
      } finally {
        if (isMounted) {
          setIsLoadingLeaderboard(false);
        }
      }
    };

    loadLeaderboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const buildFallbackEntry = (rank) => ({
    rank,
    username: isLoadingLeaderboard ? 'Loading...' : 'TBD',
    totalDeals: 0,
    totalUSDValue: 0,
    avatar: ''
  });

  const entriesByRank = leaderboard.reduce((acc, entry) => {
    acc[entry.rank] = entry;
    return acc;
  }, {});

  const firstPlace = entriesByRank[1] || buildFallbackEntry(1);
  const secondPlace = entriesByRank[2] || buildFallbackEntry(2);
  const thirdPlace = entriesByRank[3] || buildFallbackEntry(3);

  const getAvatar = (entry) => {
    if (entry.avatar) {
      return entry.avatar;
    }
    const seed = encodeURIComponent(entry.username || 'User');
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  };

  const formatUSD = (value) => {
    const amount = Number(value || 0);
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDeals = (value) => Number(value || 0).toLocaleString();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(staff.discordUsername);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Section className="overflow-hidden" id="leaderboard">
      <div className="container md:pb-10">
        {/* Leaderboard Header */}
        <div className="text-center mb-16">
          <h2 className="h2 mb-4">Top RUBY Rich</h2>
          <p className="body-2 text-n-4 max-w-3xl mx-auto">
            Our top 3 highest USD value exchangers with the largest trade volumes
          </p>
        </div>

        {/* Podium Section */}
        <div className="relative max-w-4xl mx-auto mb-32">
          <div className="flex items-end justify-center gap-6">
            {/* 2nd Place */}
            <div className="flex-1 max-w-[240px]">
              <div className="relative bg-[#2B2D31] rounded-2xl p-6 transform translate-y-10 border-2 border-[#C0C0C0]/40 shadow-[0_0_30px_rgba(192,192,192,0.15)]">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-gradient-to-br from-gray-300 to-gray-500 rounded-full flex items-center justify-center text-lg font-bold shadow-lg">
                  2
                </div>
                <div className="text-center mt-6">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full overflow-hidden bg-n-6 ring-2 ring-[#C0C0C0]/30">
                    <img 
                      src={getAvatar(secondPlace)} 
                      alt={secondPlace.username}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = getAvatar({ username: secondPlace.username });
                      }}
                    />
                  </div>
                  <h3 className="text-lg font-bold mb-4 text-n-1">{secondPlace.username}</h3>
                  
                  <div className="space-y-3 text-left">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-n-3">Deals completed:</span>
                      <span className="text-sm font-semibold text-n-1">{formatDeals(secondPlace.totalDeals)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-n-1/10">
                      <span className="text-sm text-n-3">Total USD Value:</span>
                      <span className="text-base font-bold text-[#10B981]">${formatUSD(secondPlace.totalUSDValue)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 1st Place */}
            <div className="flex-1 max-w-[260px]">
              <div className="relative bg-[#2B2D31] rounded-2xl p-7 border-2 border-[#FFD700]/40 shadow-[0_0_40px_rgba(255,215,0,0.2)]">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-4xl">
                  🐋
                </div>
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-11 h-11 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center text-xl font-bold shadow-lg mt-7">
                  1
                </div>
                <div className="text-center mt-8">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden bg-n-6 ring-4 ring-[#FFD700]/30">
                    <img 
                      src={getAvatar(firstPlace)} 
                      alt={firstPlace.username}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = getAvatar({ username: firstPlace.username });
                      }}
                    />
                  </div>
                  <h3 className="text-xl font-bold mb-4 text-n-1">{firstPlace.username}</h3>
                  
                  <div className="space-y-3 text-left">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-n-3">Deals completed:</span>
                      <span className="text-sm font-semibold text-n-1">{formatDeals(firstPlace.totalDeals)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-[#FFD700]/20">
                      <span className="text-sm text-n-3">Total USD Value:</span>
                      <span className="text-lg font-bold text-[#FFD700]">${formatUSD(firstPlace.totalUSDValue)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="flex-1 max-w-[240px]">
              <div className="relative bg-[#2B2D31] rounded-2xl p-6 transform translate-y-16 border-2 border-[#CD7F32]/40 shadow-[0_0_30px_rgba(205,127,50,0.15)]">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-gradient-to-br from-orange-300 to-orange-500 rounded-full flex items-center justify-center text-lg font-bold shadow-lg">
                  3
                </div>
                <div className="text-center mt-6">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full overflow-hidden bg-n-6 ring-2 ring-[#CD7F32]/30">
                    <img 
                      src={getAvatar(thirdPlace)} 
                      alt={thirdPlace.username}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = getAvatar({ username: thirdPlace.username });
                      }}
                    />
                  </div>
                  <h3 className="text-lg font-bold mb-4 text-n-1">{thirdPlace.username}</h3>
                  
                  <div className="space-y-3 text-left">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-n-3">Deals completed:</span>
                      <span className="text-sm font-semibold text-n-1">{formatDeals(thirdPlace.totalDeals)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-n-1/10">
                      <span className="text-sm text-n-3">Total USD Value:</span>
                      <span className="text-base font-bold text-[#10B981]">${formatUSD(thirdPlace.totalUSDValue)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Staff Section */}
        <div className="max-w-xl mx-auto">
          <h3 className="h3 text-center mb-10">Meet the Team</h3>
          <div className="relative bg-[#0E0C15] rounded-3xl overflow-hidden border-2 border-n-1/5">
            {/* Banner */}
            <div className="h-32 relative overflow-hidden bg-[#0E0C15]">
              <img 
                src={staff.banner} 
                alt="Banner"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentElement.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0E0C15]/60"></div>
            </div>
            
            {/* Profile Content */}
            <div className="relative px-6 pb-6">
              {/* Avatar */}
              <div className="absolute -top-14 left-6">
                <div className="w-28 h-28 rounded-full border-[6px] border-[#0E0C15] bg-n-8 overflow-hidden shadow-xl">
                  <img 
                    src={staff.avatar} 
                    alt={staff.username}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=REGEN';
                    }}
                  />
                </div>
              </div>

              {/* Info */}
              <div className="pt-16">
                <h4 className="text-2xl font-bold mb-2 text-n-1">{staff.username}</h4>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-n-1 rounded-full mb-6">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#000000"/>
                    <path d="M9 12l2 2 4-4" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-sm font-bold text-n-8">{staff.role}</span>
                </div>

                {/* Bio */}
                <p className="text-sm text-n-3 mb-6 leading-relaxed">{staff.bio}</p>

                {/* Copy Username Button */}
                <button
                  onClick={copyToClipboard}
                  className={`flex items-center justify-center gap-3 w-full transition-all duration-300 rounded-xl py-3.5 px-4 font-semibold ${
                    copied 
                      ? 'bg-[#10B981] scale-95' 
                      : 'bg-[#5865F2] hover:bg-[#4752C4] hover:scale-[1.02] active:scale-95'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                      Copy Discord: {staff.discordUsername}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <Gradient />
      </div>
    </Section>
  );
};

export default Leaderboard;
