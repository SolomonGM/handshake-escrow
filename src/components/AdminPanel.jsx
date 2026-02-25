import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import Button from './Button';
import { getRankLabel, normalizeRank } from '../utils/rankDisplay';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [message, setMessage] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersTotalCount, setUsersTotalCount] = useState(0);
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userTwoFactorFilter, setUserTwoFactorFilter] = useState('all');
  const [userSortBy, setUserSortBy] = useState('createdAt');
  const [userSortOrder, setUserSortOrder] = useState('desc');
  const [tradeRequests, setTradeRequests] = useState([]);
  const [tradeSearchTerm, setTradeSearchTerm] = useState('');
  const [debouncedTradeSearch, setDebouncedTradeSearch] = useState('');
  const [tradeRequestsPage, setTradeRequestsPage] = useState(1);
  const [tradeRequestsTotalPages, setTradeRequestsTotalPages] = useState(1);
  const [tradeRequestsTotalCount, setTradeRequestsTotalCount] = useState(0);
  const [tradeRequestsRestricted, setTradeRequestsRestricted] = useState(false);
  const [tradeStatusFilter, setTradeStatusFilter] = useState('all');
  const [tradeSortBy, setTradeSortBy] = useState('createdAt');
  const [tradeSortOrder, setTradeSortOrder] = useState('desc');
  const [editingTradeRequestId, setEditingTradeRequestId] = useState(null);
  const [tradeRequestDraft, setTradeRequestDraft] = useState(null);
  const [tradeTickets, setTradeTickets] = useState([]);
  const [ticketSearchTerm, setTicketSearchTerm] = useState('');
  const [debouncedTicketSearch, setDebouncedTicketSearch] = useState('');
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsTotalPages, setTicketsTotalPages] = useState(1);
  const [ticketsTotalCount, setTicketsTotalCount] = useState(0);
  const [ticketsRestricted, setTicketsRestricted] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
  const [ticketSortBy, setTicketSortBy] = useState('updatedAt');
  const [ticketSortOrder, setTicketSortOrder] = useState('desc');
  const [moderationActions, setModerationActions] = useState([]);
  const [moderationSearchTerm, setModerationSearchTerm] = useState('');
  const [debouncedModerationSearch, setDebouncedModerationSearch] = useState('');
  const [moderationPage, setModerationPage] = useState(1);
  const [moderationTotalPages, setModerationTotalPages] = useState(1);
  const [moderationTotalCount, setModerationTotalCount] = useState(0);
  const [moderationScopeFilter, setModerationScopeFilter] = useState('all');
  const [moderationActionTypeFilter, setModerationActionTypeFilter] = useState('all');
  const [moderationSortBy, setModerationSortBy] = useState('createdAt');
  const [moderationSortOrder, setModerationSortOrder] = useState('desc');
  const [activeBans, setActiveBans] = useState([]);
  const [banSearchTerm, setBanSearchTerm] = useState('');
  const [debouncedBanSearch, setDebouncedBanSearch] = useState('');
  const [bansPage, setBansPage] = useState(1);
  const [bansTotalPages, setBansTotalPages] = useState(1);
  const [bansTotalCount, setBansTotalCount] = useState(0);
  const [banPermanenceFilter, setBanPermanenceFilter] = useState('all');
  const [banSortBy, setBanSortBy] = useState('bannedAt');
  const [banSortOrder, setBanSortOrder] = useState('desc');

  const PAGE_SIZE = 25;
  const navigate = useNavigate();

  useEffect(() => {
    loadUsersAndStats();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUserSearch(userSearchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTradeSearch(tradeSearchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [tradeSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTicketSearch(ticketSearchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [ticketSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedModerationSearch(moderationSearchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [moderationSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBanSearch(banSearchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [banSearchTerm]);

  useEffect(() => {
    if (!hasInitialized) return;
    loadUsers();
  }, [
    hasInitialized,
    debouncedUserSearch,
    usersPage,
    userRoleFilter,
    userTwoFactorFilter,
    userSortBy,
    userSortOrder
  ]);

  useEffect(() => {
    if (!hasInitialized) return;
    loadTradeRequests();
  }, [
    hasInitialized,
    debouncedTradeSearch,
    tradeRequestsPage,
    tradeStatusFilter,
    tradeSortBy,
    tradeSortOrder
  ]);

  useEffect(() => {
    if (!hasInitialized) return;
    loadTradeTickets();
  }, [
    hasInitialized,
    debouncedTicketSearch,
    ticketsPage,
    ticketStatusFilter,
    ticketSortBy,
    ticketSortOrder
  ]);

  useEffect(() => {
    if (!hasInitialized) return;
    loadModerationActions();
  }, [
    hasInitialized,
    debouncedModerationSearch,
    moderationPage,
    moderationScopeFilter,
    moderationActionTypeFilter,
    moderationSortBy,
    moderationSortOrder
  ]);

  useEffect(() => {
    if (!hasInitialized) return;
    loadActiveBans();
  }, [
    hasInitialized,
    debouncedBanSearch,
    bansPage,
    banPermanenceFilter,
    banSortBy,
    banSortOrder
  ]);

  const loadUsersAndStats = async () => {
    try {
      setLoading(true);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (error) {
      setMessage('Error loading data: ' + (error.response?.data?.message || error.message));
    } finally {
      setHasInitialized(true);
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const statsData = await adminAPI.getSiteStats();
    setStats(statsData);
  };

  const loadUsers = async () => {
    try {
      const usersData = await adminAPI.getAllUsers({
        search: debouncedUserSearch,
        page: usersPage,
        pageSize: PAGE_SIZE,
        role: userRoleFilter,
        twoFactor: userTwoFactorFilter,
        sortBy: userSortBy,
        sortOrder: userSortOrder
      });

      setUsers(usersData.users || []);
      setUsersTotalPages(usersData.totalPages || 1);
      setUsersTotalCount(usersData.totalCount || 0);
      if (usersData.page && usersData.page !== usersPage) {
        setUsersPage(usersData.page);
      }
    } catch (error) {
      setMessage('Error loading users: ' + (error.response?.data?.message || error.message));
    }
  };

  const loadTradeRequests = async () => {
    try {
      const tradeRequestsData = await adminAPI.getTradeRequests({
        search: debouncedTradeSearch,
        page: tradeRequestsPage,
        pageSize: PAGE_SIZE,
        status: tradeStatusFilter,
        sortBy: tradeSortBy,
        sortOrder: tradeSortOrder
      });
      setTradeRequests(tradeRequestsData.tradeRequests || []);
      setTradeRequestsTotalPages(tradeRequestsData.totalPages || 1);
      setTradeRequestsTotalCount(tradeRequestsData.totalCount || 0);
      setTradeRequestsRestricted(Boolean(tradeRequestsData.restricted));
      if (tradeRequestsData.page && tradeRequestsData.page !== tradeRequestsPage) {
        setTradeRequestsPage(tradeRequestsData.page);
      }
    } catch (error) {
      setMessage('Error loading trade requests: ' + (error.response?.data?.message || error.message));
    }
  };

  const loadTradeTickets = async () => {
    try {
      const tradeTicketsData = await adminAPI.getTradeTickets({
        search: debouncedTicketSearch,
        page: ticketsPage,
        pageSize: PAGE_SIZE,
        status: ticketStatusFilter,
        sortBy: ticketSortBy,
        sortOrder: ticketSortOrder
      });
      setTradeTickets(tradeTicketsData.tickets || []);
      setTicketsTotalPages(tradeTicketsData.totalPages || 1);
      setTicketsTotalCount(tradeTicketsData.totalCount || 0);
      setTicketsRestricted(Boolean(tradeTicketsData.restricted));
      if (tradeTicketsData.page && tradeTicketsData.page !== ticketsPage) {
        setTicketsPage(tradeTicketsData.page);
      }
    } catch (error) {
      setMessage('Error loading trade tickets: ' + (error.response?.data?.message || error.message));
    }
  };

  const loadModerationActions = async () => {
    try {
      const moderationData = await adminAPI.getModerationActions({
        search: debouncedModerationSearch,
        page: moderationPage,
        pageSize: PAGE_SIZE,
        scope: moderationScopeFilter,
        actionType: moderationActionTypeFilter,
        sortBy: moderationSortBy,
        sortOrder: moderationSortOrder
      });

      setModerationActions(moderationData.actions || []);
      setModerationTotalPages(moderationData.totalPages || 1);
      setModerationTotalCount(moderationData.totalCount || 0);
      if (moderationData.page && moderationData.page !== moderationPage) {
        setModerationPage(moderationData.page);
      }
    } catch (error) {
      setMessage('Error loading moderation actions: ' + (error.response?.data?.message || error.message));
    }
  };

  const loadActiveBans = async () => {
    try {
      const bansData = await adminAPI.getActiveBans({
        search: debouncedBanSearch,
        page: bansPage,
        pageSize: PAGE_SIZE,
        permanence: banPermanenceFilter,
        sortBy: banSortBy,
        sortOrder: banSortOrder
      });

      setActiveBans(bansData.bans || []);
      setBansTotalPages(bansData.totalPages || 1);
      setBansTotalCount(bansData.totalCount || 0);
      if (bansData.page && bansData.page !== bansPage) {
        setBansPage(bansData.page);
      }
    } catch (error) {
      setMessage('Error loading active bans: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdateRank = async (userId, rank) => {
    try {
      await adminAPI.updateUserRank(userId, rank);
      setMessage('User rank updated successfully');
      loadUsersAndStats();
      setEditingUser(null);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error updating rank: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdateRole = async (userId, role) => {
    try {
      await adminAPI.updateUserRole(userId, role);
      setMessage('User role updated successfully');
      loadUsersAndStats();
      setEditingUser(null);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error updating role: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdateXP = async (userId, xp) => {
    try {
      await adminAPI.updateUserXP(userId, parseInt(xp));
      setMessage('User XP updated successfully');
      loadUsersAndStats();
      setEditingUser(null);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error updating XP: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdatePasses = async (userId, passes) => {
    try {
      await adminAPI.updateUserPasses(userId, parseInt(passes));
      setMessage('User passes updated successfully');
      loadUsersAndStats();
      setEditingUser(null);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error updating passes: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdateTotalUSDValue = async (userId, totalUSDValue) => {
    try {
      await adminAPI.updateUserTotalUSDValue(userId, parseFloat(totalUSDValue));
      setMessage('User total USD value updated successfully');
      loadUsersAndStats();
      setEditingUser(null);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error updating total USD value: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdateTotalDeals = async (userId, totalDeals) => {
    try {
      await adminAPI.updateUserTotalDeals(userId, parseInt(totalDeals));
      setMessage('User total deals updated successfully');
      loadUsersAndStats();
      setEditingUser(null);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error updating total deals: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      await adminAPI.deleteUser(userId);
      setMessage('User deleted successfully');
      loadUsersAndStats();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error deleting user: ' + (error.response?.data?.message || error.message));
    }
  };

  const filteredUsers = users;

  const normalizedRankCounts = stats?.rankCounts
    ? stats.rankCounts.reduce((acc, entry) => {
        const key = normalizeRank(entry._id);
        acc[key] = (acc[key] || 0) + entry.count;
        return acc;
      }, {})
    : null;

  const rankCountEntries = normalizedRankCounts
    ? Object.entries(normalizedRankCounts).map(([rank, count]) => ({
        rank,
        count
      }))
    : [];

  const filteredTradeRequests = tradeRequests;
  const filteredTickets = tradeTickets;
  const filteredModerationActions = moderationActions;
  const filteredBans = activeBans;

  const startEditingTradeRequest = (request) => {
    setEditingTradeRequestId(request._id);
    setTradeRequestDraft({
      ...request,
      paymentMethodsInput: Array.isArray(request.paymentMethods)
        ? request.paymentMethods.join(', ')
        : '',
      expiresAtInput: request.expiresAt
        ? new Date(request.expiresAt).toISOString().slice(0, 16)
        : ''
    });
  };

  const cancelEditingTradeRequest = () => {
    setEditingTradeRequestId(null);
    setTradeRequestDraft(null);
  };

  const handleTradeRequestDraftChange = (field, value) => {
    setTradeRequestDraft((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveTradeRequest = async () => {
    if (!tradeRequestDraft || !editingTradeRequestId) return;

    const updates = {
      type: tradeRequestDraft.type,
      itemOffered: tradeRequestDraft.itemOffered,
      itemDescription: tradeRequestDraft.itemDescription,
      priceAmount: tradeRequestDraft.priceAmount,
      priceCurrency: tradeRequestDraft.priceCurrency,
      cryptoOffered: tradeRequestDraft.cryptoOffered || null,
      paymentMethods: tradeRequestDraft.paymentMethodsInput
        ? tradeRequestDraft.paymentMethodsInput
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      warrantyAvailable: tradeRequestDraft.warrantyAvailable,
      warrantyDuration: tradeRequestDraft.warrantyDuration,
      termsAndConditions: tradeRequestDraft.termsAndConditions,
      status: tradeRequestDraft.status,
      expiresAt: tradeRequestDraft.expiresAtInput
        ? new Date(tradeRequestDraft.expiresAtInput)
        : tradeRequestDraft.expiresAt
    };

    try {
      await adminAPI.updateTradeRequest(editingTradeRequestId, updates);
      setMessage('Trade request updated successfully');
      setTimeout(() => setMessage(''), 3000);
      cancelEditingTradeRequest();
      await loadTradeRequests();
    } catch (error) {
      setMessage('Error updating trade request: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDeleteTradeRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to delete this trade request? This action cannot be undone.')) {
      return;
    }

    try {
      await adminAPI.deleteTradeRequest(requestId);
      setMessage('Trade request deleted successfully');
      setTimeout(() => setMessage(''), 3000);
      await loadTradeRequests();
    } catch (error) {
      setMessage('Error deleting trade request: ' + (error.response?.data?.message || error.message));
    }
  };

  const getRankColor = (rank) => {
    const normalizedRank = normalizeRank(rank);
    const colors = {
      'ruby rich': 'text-[#ff4da6] bg-[#ff4da6]/20',
      'top client': 'text-[#2563eb] bg-[#2563eb]/20',
      'rich client': 'text-[#f97316] bg-[#f97316]/20',
      'manager': 'text-[#6ee7b7] bg-[#6ee7b7]/20',
      'admin': 'text-[#ef4444] bg-[#ef4444]/20',
      'owner': 'text-[#ef4444] bg-[#ef4444]/20',
      'client': 'text-[#06b6d4] bg-[#06b6d4]/20',
      'developer': 'text-[#f5f5f5] bg-white/20',
    };
    return colors[normalizedRank] || colors['client'];
  };

  const getTradeStatusStyle = (status) => {
    const styles = {
      active: 'bg-[#10B981]/20 text-[#10B981]',
      paused: 'bg-yellow-500/20 text-yellow-400',
      expired: 'bg-n-5 text-n-3',
      deleted: 'bg-red-500/20 text-red-400',
    };
    return styles[status] || 'bg-n-5 text-n-3';
  };

  const getTicketStatusStyle = (status) => {
    const styles = {
      open: 'bg-blue-500/20 text-blue-400',
      'in-progress': 'bg-emerald-500/20 text-emerald-400',
      'awaiting-close': 'bg-amber-500/20 text-amber-400',
      closing: 'bg-orange-500/20 text-orange-400',
      completed: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-red-500/20 text-red-400',
      disputed: 'bg-purple-500/20 text-purple-400',
      refunded: 'bg-slate-500/20 text-slate-400'
    };
    return styles[status] || 'bg-n-5 text-n-3';
  };

  const getModerationActionStyle = (actionType) => {
    const value = String(actionType || '').toLowerCase();
    const styles = {
      ban: 'bg-red-500/20 text-red-300',
      ban_temporary: 'bg-red-500/20 text-red-300',
      unban: 'bg-emerald-500/20 text-emerald-300',
      mute: 'bg-amber-500/20 text-amber-300',
      timeout: 'bg-amber-500/20 text-amber-300',
      unmute: 'bg-sky-500/20 text-sky-300',
      ticket_refund: 'bg-orange-500/20 text-orange-300',
      pass_refund: 'bg-orange-500/20 text-orange-300',
      pass_refund_prompt: 'bg-yellow-500/20 text-yellow-300',
      pass_return: 'bg-cyan-500/20 text-cyan-300',
      pass_force_complete: 'bg-indigo-500/20 text-indigo-300'
    };
    return styles[value] || 'bg-n-5 text-n-3';
  };

  const getModerationScopeStyle = (scope) => {
    const value = String(scope || '').toLowerCase();
    const styles = {
      site: 'bg-red-500/15 text-red-200',
      chat: 'bg-blue-500/15 text-blue-200',
      ticket: 'bg-emerald-500/15 text-emerald-200',
      pass: 'bg-orange-500/15 text-orange-200',
      system: 'bg-n-5 text-n-3'
    };
    return styles[value] || 'bg-n-5 text-n-3';
  };

  const renderPagination = ({ page, totalPages, totalCount, onPageChange }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            page <= 1
              ? 'bg-n-6 text-n-4 cursor-not-allowed'
              : 'bg-n-7 text-n-1 hover:bg-n-5'
          }`}
        >
          Previous
        </button>
        <div className="text-n-4 text-sm">
          Page <span className="text-n-1 font-semibold">{page}</span> of{' '}
          <span className="text-n-1 font-semibold">{totalPages}</span>
          {Number.isFinite(totalCount) && totalCount > 0 ? (
            <span className="ml-2 text-n-5">({totalCount} total)</span>
          ) : null}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            page >= totalPages
              ? 'bg-n-6 text-n-4 cursor-not-allowed'
              : 'bg-n-7 text-n-1 hover:bg-n-5'
          }`}
        >
          Next
        </button>
      </div>
    );
  };

  const tradeCurrencyOptions = [
    'USD',
    'EUR',
    'GBP',
    'bitcoin',
    'ethereum',
    'litecoin',
    'solana',
    'usdt-erc20',
    'usdc-erc20'
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-n-3">Loading admin panel...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="h3 text-[#ef4444]">Administrator Panel</h2>
        <Button onClick={() => {
          loadUsersAndStats();
          loadTradeTickets();
          loadTradeRequests();
          loadModerationActions();
          loadActiveBans();
        }}>
          Refresh Data
        </Button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.includes('success') ? 'bg-color-4/10 border border-color-4/50 text-color-4' : 'bg-red-500/10 border border-red-500/50 text-red-400'}`}>
          {message}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-n-6 p-4 rounded-lg border border-n-5">
            <p className="text-n-4 text-sm mb-1">Total Users</p>
            <p className="text-3xl font-bold text-n-1">{stats.totalUsers}</p>
          </div>
          <div className="bg-n-6 p-4 rounded-lg border border-n-5">
            <p className="text-n-4 text-sm mb-1">Admin Users</p>
            <p className="text-3xl font-bold text-n-1">{stats.adminUsers}</p>
          </div>
          <div className="bg-n-6 p-4 rounded-lg border border-n-5">
            <p className="text-n-4 text-sm mb-1">2FA Verified Users</p>
            <p className="text-3xl font-bold text-n-1">{stats.verifiedUsers}</p>
          </div>
          <div className="bg-n-6 p-4 rounded-lg border border-n-5">
            <p className="text-n-4 text-sm mb-1">Rank Distribution</p>
            <div className="mt-2 space-y-1">
              {rankCountEntries.map((rank) => (
                <div key={rank.rank} className="flex justify-between text-xs">
                  <span className="text-n-4">{getRankLabel(rank.rank)}:</span>
                  <span className="text-n-1 font-semibold">{rank.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* User Controls */}
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input
          type="text"
          placeholder="Search users by username or email..."
          value={userSearchTerm}
          onChange={(e) => {
            setUserSearchTerm(e.target.value);
            setUsersPage(1);
          }}
          className="w-full xl:col-span-2 px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
        />
        <select
          value={userRoleFilter}
          onChange={(e) => {
            setUserRoleFilter(e.target.value);
            setUsersPage(1);
          }}
          className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
        >
          <option value="all">All Roles</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
          <option value="moderator">Moderators</option>
        </select>
        <select
          value={userTwoFactorFilter}
          onChange={(e) => {
            setUserTwoFactorFilter(e.target.value);
            setUsersPage(1);
          }}
          className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
        >
          <option value="all">2FA: All</option>
          <option value="enabled">2FA Enabled</option>
          <option value="disabled">2FA Disabled</option>
        </select>
        <div className="flex gap-3">
          <select
            value={userSortBy}
            onChange={(e) => {
              setUserSortBy(e.target.value);
              setUsersPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
          >
            <option value="createdAt">Sort: Joined</option>
            <option value="username">Sort: Username</option>
            <option value="role">Sort: Role</option>
            <option value="rank">Sort: Rank</option>
            <option value="totalUSDValue">Sort: Total USD</option>
            <option value="totalDeals">Sort: Deals</option>
            <option value="passes">Sort: Passes</option>
            <option value="xp">Sort: XP</option>
            <option value="twoFactor">Sort: 2FA</option>
          </select>
          <select
            value={userSortOrder}
            onChange={(e) => {
              setUserSortOrder(e.target.value);
              setUsersPage(1);
            }}
            className="px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-n-6 rounded-lg border border-n-5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-n-7 border-b border-n-5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">2FA</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">XP</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Passes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Total USD</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Deals</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-n-5">
              {filteredUsers.map((user) => (
                <tr key={user._id} className="hover:bg-n-7/50 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-n-5">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-color-1 to-color-5 flex items-center justify-center text-n-1 font-bold">
                            {user.username?.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="text-n-1 font-medium">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-n-3 text-sm">{user.email}</td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {editingUser === user._id ? (
                      <select
                        defaultValue={normalizeRank(user.rank)}
                        onChange={(e) => handleUpdateRank(user._id, e.target.value)}
                        className="bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                      >
                        <option value="client">Client</option>
                        <option value="rich client">Rich Client</option>
                        <option value="top client">Top Client</option>
                        <option value="ruby rich">RUBY Rich</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                        <option value="developer">Developer</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getRankColor(user.rank)}`}>
                        {getRankLabel(user.rank)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {editingUser === user._id ? (
                      <select
                        defaultValue={user.role}
                        onChange={(e) => handleUpdateRole(user._id, e.target.value)}
                        className="bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="moderator">Moderator</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        user.role === 'admin'
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : user.role === 'moderator'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-n-5 text-n-3'
                      }`}>
                        {user.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      user.twoFactor?.enabled
                        ? 'bg-[#10B981]/20 text-[#10B981]'
                        : 'bg-n-5 text-n-3'
                    }`}>
                      {user.twoFactor?.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {editingUser === user._id ? (
                      <input
                        type="number"
                        defaultValue={user.xp}
                        onBlur={(e) => handleUpdateXP(user._id, e.target.value)}
                        disabled={user.rank !== 'developer'}
                        className={`w-20 bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm ${user.rank !== 'developer' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                    ) : (
                      <span className="text-n-1">{user.xp}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {editingUser === user._id ? (
                      <input
                        type="number"
                        defaultValue={user.passes || 0}
                        onBlur={(e) => handleUpdatePasses(user._id, e.target.value)}
                        className="w-16 bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                      />
                    ) : (
                      <span className="text-color-4 font-semibold">{user.passes || 0}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {editingUser === user._id ? (
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={user.totalUSDValue || 0}
                        onBlur={(e) => handleUpdateTotalUSDValue(user._id, e.target.value)}
                        className="w-24 bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                      />
                    ) : (
                      <span className="text-n-1 font-semibold">${(user.totalUSDValue || 0).toLocaleString()}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {editingUser === user._id ? (
                      <input
                        type="number"
                        defaultValue={user.totalDeals || 0}
                        onBlur={(e) => handleUpdateTotalDeals(user._id, e.target.value)}
                        className="w-16 bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                      />
                    ) : (
                      <span className="text-n-1">{user.totalDeals || 0}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-n-3 text-sm">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingUser(editingUser === user._id ? null : user._id)}
                        className="text-color-4 hover:text-color-4/80 text-sm font-semibold"
                      >
                        {editingUser === user._id ? 'Done' : 'Edit'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user._id)}
                        className="text-red-400 hover:text-red-300 text-sm font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {renderPagination({
        page: usersPage,
        totalPages: usersTotalPages,
        totalCount: usersTotalCount,
        onPageChange: setUsersPage
      })}

      {filteredUsers.length === 0 && (
        <div className="text-center py-8 text-n-4">
          No users found matching your search.
        </div>
      )}

      {/* Trade Tickets Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="h4 text-n-1">Trade Tickets</h3>
            <p className="text-n-4 text-sm">Search by sender, receiver, or ticket ID</p>
          </div>
          <Button onClick={loadTradeTickets}>Refresh Tickets</Button>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="text"
            placeholder="Search tickets by sender, receiver, or ticket ID..."
            value={ticketSearchTerm}
            onChange={(e) => {
              setTicketSearchTerm(e.target.value);
              setTicketsPage(1);
            }}
            className="w-full xl:col-span-2 px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
          />
          <select
            value={ticketStatusFilter}
            onChange={(e) => {
              setTicketStatusFilter(e.target.value);
              setTicketsPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="awaiting-close">Awaiting Close</option>
            <option value="closing">Closing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="disputed">Disputed</option>
            <option value="refunded">Refunded</option>
          </select>
          <div className="flex gap-3 md:col-span-2">
            <select
              value={ticketSortBy}
              onChange={(e) => {
                setTicketSortBy(e.target.value);
                setTicketsPage(1);
              }}
              className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
            >
              <option value="updatedAt">Sort: Updated</option>
              <option value="createdAt">Sort: Created</option>
              <option value="status">Sort: Status</option>
              <option value="ticketId">Sort: Ticket ID</option>
              <option value="cryptocurrency">Sort: Coin</option>
            </select>
            <select
              value={ticketSortOrder}
              onChange={(e) => {
                setTicketSortOrder(e.target.value);
                setTicketsPage(1);
              }}
              className="px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>

        <div className="bg-n-6 rounded-lg border border-n-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-n-7 border-b border-n-5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Ticket ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Sender</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Receiver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Crypto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-n-5">
                {filteredTickets.map((ticket) => (
                  <tr key={ticket._id} className="hover:bg-n-7/50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-n-2 font-mono">
                      {ticket.ticketId}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1">
                      {ticket.sender?.username ? `@${ticket.sender.username}` : 'Pending'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1">
                      {ticket.receiver?.username ? `@${ticket.receiver.username}` : 'Pending'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${getTicketStatusStyle(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-2 uppercase">
                      {ticket.cryptocurrency}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-3">
                      {ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/trade-ticket?ticketId=${encodeURIComponent(ticket.ticketId)}`)}
                        className="text-color-4 hover:text-color-4/80 text-sm font-semibold"
                      >
                        View Ticket
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {ticketsRestricted && !debouncedTicketSearch && ticketStatusFilter === 'all' && (
          <div className="mt-3 text-xs text-n-4">
            Showing the 10 most recent pages. Use search to access older tickets.
          </div>
        )}

        {renderPagination({
          page: ticketsPage,
          totalPages: ticketsTotalPages,
          totalCount: ticketsTotalCount,
          onPageChange: setTicketsPage
        })}

        {filteredTickets.length === 0 && (
          <div className="text-center py-8 text-n-4">
            No trade tickets found matching your search.
          </div>
        )}
      </div>

      {/* Active Bans Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="h4 text-n-1">Active Bans</h3>
            <p className="text-n-4 text-sm">Live site bans with moderator and expiration details</p>
          </div>
          <Button onClick={loadActiveBans}>Refresh Bans</Button>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="text"
            placeholder="Search by username, user ID, reason, or moderator..."
            value={banSearchTerm}
            onChange={(e) => {
              setBanSearchTerm(e.target.value);
              setBansPage(1);
            }}
            className="w-full xl:col-span-2 px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
          />
          <select
            value={banPermanenceFilter}
            onChange={(e) => {
              setBanPermanenceFilter(e.target.value);
              setBansPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
          >
            <option value="all">All Bans</option>
            <option value="permanent">Permanent</option>
            <option value="temporary">Temporary</option>
          </select>
          <div className="flex gap-3 md:col-span-2">
            <select
              value={banSortBy}
              onChange={(e) => {
                setBanSortBy(e.target.value);
                setBansPage(1);
              }}
              className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
            >
              <option value="bannedAt">Sort: Issued</option>
              <option value="bannedUntil">Sort: Expires</option>
              <option value="username">Sort: Username</option>
              <option value="createdAt">Sort: Joined</option>
            </select>
            <select
              value={banSortOrder}
              onChange={(e) => {
                setBanSortOrder(e.target.value);
                setBansPage(1);
              }}
              className="px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>

        <div className="bg-n-6 rounded-lg border border-n-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-n-7 border-b border-n-5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Issued</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Moderator</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-n-5">
                {filteredBans.map((ban) => (
                  <tr key={ban._id} className="hover:bg-n-7/50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm text-n-1 font-medium">@{ban.username}</span>
                        <span className="text-xs text-n-4">{ban.userId || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-n-2 max-w-[340px]">
                      <div className="line-clamp-2">{ban.reason || 'No reason provided'}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-3">
                      {ban.bannedAt ? new Date(ban.bannedAt).toLocaleString() : 'Unknown'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1">
                      {ban.isPermanent
                        ? <span className="text-red-300 font-semibold">Permanent</span>
                        : (ban.bannedUntil ? new Date(ban.bannedUntil).toLocaleString() : 'Unknown')}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-2">
                      {ban.bannedBy?.username ? `@${ban.bannedBy.username}` : 'Unknown'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${ban.isPermanent ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {ban.isPermanent ? 'Permanent' : 'Temporary'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {renderPagination({
          page: bansPage,
          totalPages: bansTotalPages,
          totalCount: bansTotalCount,
          onPageChange: setBansPage
        })}

        {filteredBans.length === 0 && (
          <div className="text-center py-8 text-n-4">
            No active bans found for the current filters.
          </div>
        )}
      </div>

      {/* Moderation Actions Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="h4 text-n-1">Moderation Actions</h3>
            <p className="text-n-4 text-sm">Searchable audit timeline for moderation, ticket, and pass actions</p>
          </div>
          <Button onClick={loadModerationActions}>Refresh Actions</Button>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="text"
            placeholder="Search by user, reason, ticket ID, or action..."
            value={moderationSearchTerm}
            onChange={(e) => {
              setModerationSearchTerm(e.target.value);
              setModerationPage(1);
            }}
            className="w-full xl:col-span-2 px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4] transition-all"
          />
          <select
            value={moderationScopeFilter}
            onChange={(e) => {
              setModerationScopeFilter(e.target.value);
              setModerationPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4] transition-all"
          >
            <option value="all">All Scopes</option>
            <option value="site">Site</option>
            <option value="chat">Chat</option>
            <option value="ticket">Ticket</option>
            <option value="pass">Pass</option>
            <option value="system">System</option>
          </select>
          <select
            value={moderationActionTypeFilter}
            onChange={(e) => {
              setModerationActionTypeFilter(e.target.value);
              setModerationPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4] transition-all"
          >
            <option value="all">All Actions</option>
            <option value="ban">Ban</option>
            <option value="ban_temporary">Temporary Ban</option>
            <option value="unban">Unban</option>
            <option value="mute">Mute</option>
            <option value="timeout">Timeout</option>
            <option value="unmute">Unmute</option>
            <option value="ticket_refund">Ticket Refund</option>
            <option value="pass_refund">Pass Refund</option>
            <option value="pass_refund_prompt">Pass Refund Prompt</option>
            <option value="pass_return">Pass Return</option>
            <option value="pass_force_complete">Pass Force Complete</option>
          </select>
          <div className="flex gap-3 md:col-span-2">
            <select
              value={moderationSortBy}
              onChange={(e) => {
                setModerationSortBy(e.target.value);
                setModerationPage(1);
              }}
              className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4] transition-all"
            >
              <option value="createdAt">Sort: Time</option>
              <option value="actionType">Sort: Action</option>
              <option value="scope">Sort: Scope</option>
              <option value="expiresAt">Sort: Expires</option>
              <option value="ticketId">Sort: Ticket ID</option>
            </select>
            <select
              value={moderationSortOrder}
              onChange={(e) => {
                setModerationSortOrder(e.target.value);
                setModerationPage(1);
              }}
              className="px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4] transition-all"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>

        <div className="bg-n-6 rounded-lg border border-n-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-n-7 border-b border-n-5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Scope</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Moderator</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-n-5">
                {filteredModerationActions.map((action) => (
                  <tr key={action._id} className="hover:bg-n-7/50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-3">
                      {action.createdAt ? new Date(action.createdAt).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getModerationActionStyle(action.actionType)}`}>
                        {String(action.actionType || 'unknown').replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${getModerationScopeStyle(action.scope)}`}>
                        {action.scope || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1">
                      {action.targetUser?.username ? `@${action.targetUser.username}` : 'System'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-2">
                      {action.moderatorUser?.username ? `@${action.moderatorUser.username}` : 'System'}
                    </td>
                    <td className="px-4 py-4 text-sm text-n-2 max-w-[360px]">
                      <div className="line-clamp-2">{action.reason || 'No reason provided'}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-n-3 font-mono">
                      {action.ticketId || (action.expiresAt ? new Date(action.expiresAt).toLocaleString() : 'N/A')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {renderPagination({
          page: moderationPage,
          totalPages: moderationTotalPages,
          totalCount: moderationTotalCount,
          onPageChange: setModerationPage
        })}

        {filteredModerationActions.length === 0 && (
          <div className="text-center py-8 text-n-4">
            No moderation actions found matching your filters.
          </div>
        )}
      </div>

      {/* Trade Requests Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <h3 className="h4 text-n-1">Trade Requests</h3>
          <Button onClick={loadTradeRequests}>Refresh Trade Requests</Button>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="text"
            placeholder="Search trade requests by request ID, creator, or item..."
            value={tradeSearchTerm}
            onChange={(e) => {
              setTradeSearchTerm(e.target.value);
              setTradeRequestsPage(1);
            }}
            className="w-full xl:col-span-2 px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
          />
          <select
            value={tradeStatusFilter}
            onChange={(e) => {
              setTradeStatusFilter(e.target.value);
              setTradeRequestsPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="expired">Expired</option>
            <option value="deleted">Deleted</option>
          </select>
          <div className="flex gap-3 md:col-span-2">
            <select
              value={tradeSortBy}
              onChange={(e) => {
                setTradeSortBy(e.target.value);
                setTradeRequestsPage(1);
              }}
              className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
            >
              <option value="createdAt">Sort: Created</option>
              <option value="expiresAt">Sort: Expires</option>
              <option value="priceAmount">Sort: Price</option>
              <option value="status">Sort: Status</option>
              <option value="requestId">Sort: Request ID</option>
              <option value="type">Sort: Type</option>
            </select>
            <select
              value={tradeSortOrder}
              onChange={(e) => {
                setTradeSortOrder(e.target.value);
                setTradeRequestsPage(1);
              }}
              className="px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>

        <div className="bg-n-6 rounded-lg border border-n-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-n-7 border-b border-n-5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Request ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Creator</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Currency</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Methods</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-n-5">
                {filteredTradeRequests.map((request) => {
                  const isEditing = editingTradeRequestId === request._id;
                  const draft = isEditing && tradeRequestDraft ? tradeRequestDraft : request;

                  return (
                    <tr key={request._id} className="hover:bg-n-7/50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap text-xs text-n-2 font-mono">
                        {request.requestId || request._id}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1">
                        @{request.creator?.username || 'Unknown'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={draft?.type || 'selling'}
                            onChange={(e) => handleTradeRequestDraftChange('type', e.target.value)}
                            className="bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                          >
                            <option value="selling">Selling</option>
                            <option value="buying">Buying</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${draft?.type === 'buying' ? 'text-[#10B981] bg-[#10B981]/20' : 'text-[#EF4444] bg-[#EF4444]/20'}`}>
                            {draft?.type || 'selling'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 min-w-[180px]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={draft?.itemOffered || ''}
                            onChange={(e) => handleTradeRequestDraftChange('itemOffered', e.target.value)}
                            className="w-full bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                          />
                        ) : (
                          <span className="text-sm text-n-1">{draft?.itemOffered}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draft?.priceAmount ?? ''}
                            onChange={(e) => handleTradeRequestDraftChange('priceAmount', e.target.value)}
                            className="w-24 bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                          />
                        ) : (
                          <span className="text-sm text-n-1">{draft?.priceAmount}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={draft?.priceCurrency || 'USD'}
                            onChange={(e) => handleTradeRequestDraftChange('priceCurrency', e.target.value)}
                            className="bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                          >
                            {tradeCurrencyOptions.map((currency) => (
                              <option key={currency} value={currency}>
                                {currency.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm text-n-1">{draft?.priceCurrency?.toUpperCase()}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 min-w-[180px]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={draft?.paymentMethodsInput || ''}
                            onChange={(e) => handleTradeRequestDraftChange('paymentMethodsInput', e.target.value)}
                            className="w-full bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                            placeholder="comma-separated"
                          />
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(request.paymentMethods || []).slice(0, 3).map((method) => (
                              <span key={method} className="px-2 py-1 text-xs bg-n-7 border border-n-5 rounded text-n-3">
                                {method}
                              </span>
                            ))}
                            {(request.paymentMethods || []).length > 3 && (
                              <span className="px-2 py-1 text-xs bg-n-7 border border-n-5 rounded text-n-3">
                                +{request.paymentMethods.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={draft?.status || 'active'}
                            onChange={(e) => handleTradeRequestDraftChange('status', e.target.value)}
                            className="bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                          >
                            <option value="active">Active</option>
                            <option value="paused">Paused</option>
                            <option value="expired">Expired</option>
                            <option value="deleted">Deleted</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getTradeStatusStyle(draft?.status)}`}>
                            {draft?.status || 'active'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="datetime-local"
                            value={draft?.expiresAtInput || ''}
                            onChange={(e) => handleTradeRequestDraftChange('expiresAtInput', e.target.value)}
                            className="bg-n-7 border border-n-5 rounded px-2 py-1 text-n-1 text-sm"
                          />
                        ) : (
                          <span className="text-sm text-n-3">
                            {draft?.expiresAt ? new Date(draft.expiresAt).toLocaleDateString() : 'N/A'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={handleSaveTradeRequest}
                                className="text-color-4 hover:text-color-4/80 text-sm font-semibold"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditingTradeRequest}
                                className="text-n-4 hover:text-n-2 text-sm font-semibold"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditingTradeRequest(request)}
                                className="text-color-4 hover:text-color-4/80 text-sm font-semibold"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteTradeRequest(request._id)}
                                className="text-red-400 hover:text-red-300 text-sm font-semibold"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {tradeRequestsRestricted && !debouncedTradeSearch && tradeStatusFilter === 'all' && (
          <div className="mt-3 text-xs text-n-4">
            Showing the 10 most recent pages. Use search to access older trade requests.
          </div>
        )}

        {renderPagination({
          page: tradeRequestsPage,
          totalPages: tradeRequestsTotalPages,
          totalCount: tradeRequestsTotalCount,
          onPageChange: setTradeRequestsPage
        })}

        {filteredTradeRequests.length === 0 && (
          <div className="text-center py-8 text-n-4">
            No trade requests found matching your search.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
