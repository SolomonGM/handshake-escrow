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

  const podiumTiers = [
    {
      key: 'second',
      entry: secondPlace,
      rank: 2,
      order: 'order-2 md:order-1',
      maxWidth: 'md:max-w-[260px]',
      translate: 'md:translate-y-10',
      crown: null,
      badgeGradient: 'from-[#E8E8E8] via-[#C0C0C0] to-[#7A7A7A]',
      borderClass: 'border-[#C0C0C0]/30 hover:border-[#C0C0C0]/70',
      ringClass: 'ring-[#C0C0C0]/40',
      glowClass: 'from-[#C0C0C0]/25 via-[#9E9E9E]/15 to-transparent',
      avatarSize: 'w-20 h-20',
      nameSize: 'text-lg',
      valueColor: 'text-[#E5E5E5]',
      divider: 'border-[#C0C0C0]/15'
    },
    {
      key: 'first',
      entry: firstPlace,
      rank: 1,
      order: 'order-1 md:order-2',
      maxWidth: 'md:max-w-[300px]',
      translate: '',
      crown: '🐋',
      badgeGradient: 'from-[#FFE17A] via-[#FFD700] to-[#A8820C]',
      borderClass: 'border-[#FFD700]/40 hover:border-[#FFD700]/80',
      ringClass: 'ring-[#FFD700]/50',
      glowClass: 'from-[#FFD700]/30 via-[#FFA500]/20 to-transparent',
      avatarSize: 'w-24 h-24',
      nameSize: 'text-2xl',
      valueColor: 'text-[#FFD700]',
      divider: 'border-[#FFD700]/20'
    },
    {
      key: 'third',
      entry: thirdPlace,
      rank: 3,
      order: 'order-3',
      maxWidth: 'md:max-w-[260px]',
      translate: 'md:translate-y-16',
      crown: null,
      badgeGradient: 'from-[#F0AE7C] via-[#CD7F32] to-[#7A4A19]',
      borderClass: 'border-[#CD7F32]/30 hover:border-[#CD7F32]/70',
      ringClass: 'ring-[#CD7F32]/40',
      glowClass: 'from-[#CD7F32]/25 via-[#A0522D]/15 to-transparent',
      avatarSize: 'w-20 h-20',
      nameSize: 'text-lg',
      valueColor: 'text-[#E08E55]',
      divider: 'border-[#CD7F32]/15'
    }
  ];

  return (
    <Section className="overflow-hidden" id="leaderboard">
      <div className="container md:pb-10">
        {/* Leaderboard Header */}
        <div className="mb-10 text-center md:mb-16">
          <h2 className="h2 mb-4">Top Whales</h2>
          <p className="body-2 text-n-4 max-w-3xl mx-auto">
            The biggest movers on Handshake — top 3 traders by total USD volume.
          </p>
        </div>

        {/* Podium Section */}
        <div className="relative mx-auto mb-16 max-w-5xl md:mb-32">
          <div className="flex flex-col items-stretch justify-center gap-6 md:flex-row md:items-end md:gap-6">
            {podiumTiers.map((tier) => (
              <div
                key={tier.key}
                className={`group ${tier.order} w-full max-w-md ${tier.maxWidth} md:flex-1 ${tier.translate}`}
              >
                <div className="relative">
                  {/* Outer glow */}
                  <div className={`absolute -inset-1 rounded-3xl bg-gradient-to-br ${tier.glowClass} opacity-60 blur-xl transition-opacity duration-500 group-hover:opacity-100 pointer-events-none`} />

                  <div className={`relative rounded-2xl border ${tier.borderClass} bg-gradient-to-br from-[#1B1B25] via-[#15151E] to-[#0E0C15] p-6 transition-all duration-300 group-hover:-translate-y-1 ${tier.rank === 1 ? 'pt-9 md:p-7 md:pt-10' : ''}`}>
                    {/* Rank badge */}
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                      {tier.crown && (
                        <span className="text-3xl drop-shadow-[0_0_8px_rgba(255,215,0,0.45)] -mb-1">{tier.crown}</span>
                      )}
                      <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${tier.badgeGradient} flex items-center justify-center text-lg font-bold text-n-8 shadow-[0_4px_18px_rgba(0,0,0,0.45)] ring-2 ring-n-8`}>
                        {tier.rank}
                      </div>
                    </div>

                    {/* Avatar */}
                    <div className="mt-6 flex justify-center">
                      <div className={`relative ${tier.avatarSize} rounded-full overflow-hidden bg-n-6 ring-2 ${tier.ringClass} shadow-lg`}>
                        <img
                          src={getAvatar(tier.entry)}
                          alt={tier.entry.username}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = getAvatar({ username: tier.entry.username });
                          }}
                        />
                      </div>
                    </div>

                    {/* Name */}
                    <h3 className={`mt-4 text-center font-bold text-n-1 ${tier.nameSize}`}>
                      {tier.entry.username}
                    </h3>

                    {/* Stats */}
                    <div className="mt-5 rounded-xl bg-n-8/50 border border-n-6 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-code uppercase tracking-wider text-n-4">Deals</span>
                        <span className="text-sm font-semibold text-n-1">{formatDeals(tier.entry.totalDeals)}</span>
                      </div>
                      <div className={`pt-3 border-t ${tier.divider} flex items-center justify-between`}>
                        <span className="text-xs font-code uppercase tracking-wider text-n-4">USD Volume</span>
                        <span className={`text-lg font-bold ${tier.valueColor}`}>
                          ${formatUSD(tier.entry.totalUSDValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
