import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import Button from './Button';
import { getRankLabel, normalizeRank } from '../utils/rankDisplay';
import { cryptoBrandLogos } from '../assets/currencies';
import LoadingState from './LoadingState';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
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
  const [runtimeConfig, setRuntimeConfig] = useState(null);
  const [runtimeDraft, setRuntimeDraft] = useState(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeAvailabilitySaving, setRuntimeAvailabilitySaving] = useState(false);
  const [runtimeWorkflowBusy, setRuntimeWorkflowBusy] = useState(false);
  const [runtimePauseReason, setRuntimePauseReason] = useState('Runtime configuration update in progress');
  const [walletInfrastructure, setWalletInfrastructure] = useState(null);
  const [walletInfrastructureLoading, setWalletInfrastructureLoading] = useState(false);
  const [revealedAddressChain, setRevealedAddressChain] = useState(null);

  const PAGE_SIZE = 10;
  const navigate = useNavigate();
  const runtimeWalletCoins = [
    { key: 'bitcoin', label: 'Bitcoin', code: 'BTC', chain: 'bitcoin' },
    { key: 'litecoin', label: 'Litecoin', code: 'LTC', chain: 'litecoin' },
    { key: 'ethereum', label: 'Ethereum', code: 'ETH', chain: 'ethereum' },
    { key: 'solana', label: 'Solana', code: 'SOL', chain: 'solana' },
    { key: 'usdt-erc20', label: 'USDT', code: 'ERC-20', chain: 'ethereum' },
    { key: 'usdc-erc20', label: 'USDC', code: 'ERC-20', chain: 'ethereum' },
    { key: 'usdt-spl', label: 'USDT', code: 'SOL', chain: 'solana' },
    { key: 'usdc-spl', label: 'USDC', code: 'SOL', chain: 'solana' }
  ];
  const runtimeTicketCoins = runtimeWalletCoins;

  useEffect(() => {
    loadUsersAndStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await Promise.all([loadUsers(), loadStats(), loadOverview(), loadRuntimeConfig(), loadWalletInfrastructure()]);
      setLastRefreshedAt(new Date());
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

  const loadOverview = async () => {
    const overviewData = await adminAPI.getOverview();
    setOverview(overviewData);
  };

  const cloneRuntimeConfigForDraft = (runtime) => {
    if (!runtime) return null;
    return {
      networkModes: {
        bitcoin: runtime.networkModes?.bitcoin || 'testnet',
        litecoin: runtime.networkModes?.litecoin || 'mainnet',
        ethereum: runtime.networkModes?.ethereum || 'testnet',
        solana: runtime.networkModes?.solana || 'mainnet'
      },
      wallets: Object.fromEntries(
        runtimeWalletCoins.map(({ key }) => [
          key,
          {
            mainnet: runtime.wallets?.[key]?.mainnet || '',
            testnet: runtime.wallets?.[key]?.testnet || ''
          }
        ])
      ),
      ticketAvailability: Object.fromEntries(
        runtimeTicketCoins.map(({ key }) => [
          key,
          Boolean(runtime.ticketAvailability?.[key])
        ])
      )
    };
  };

  const loadRuntimeConfig = async () => {
    try {
      setRuntimeLoading(true);
      const response = await adminAPI.getRuntimeConfig();
      const nextRuntime = response.runtimeConfig || null;
      setRuntimeConfig(nextRuntime);
      setRuntimeDraft(cloneRuntimeConfigForDraft(nextRuntime));
      if (nextRuntime?.pauseReason) {
        setRuntimePauseReason(nextRuntime.pauseReason);
      }
    } catch (error) {
      setMessage('Error loading runtime config: ' + (error.response?.data?.message || error.message));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const loadWalletInfrastructure = async () => {
    try {
      setWalletInfrastructureLoading(true);
      const response = await adminAPI.getWalletInfrastructure();
      setWalletInfrastructure(response);
    } catch (error) {
      setMessage('Error loading wallet infrastructure: ' + (error.response?.data?.message || error.message));
    } finally {
      setWalletInfrastructureLoading(false);
    }
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

  const updateRuntimeDraftTicketAvailability = (coin, enabled) => {
    setRuntimeDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ticketAvailability: {
          ...(prev.ticketAvailability || {}),
          [coin]: Boolean(enabled)
        }
      };
    });
  };

  const handlePauseTicketWorkflow = async () => {
    try {
      setRuntimeWorkflowBusy(true);
      const response = await adminAPI.pauseTicketWorkflow(runtimePauseReason);
      const nextRuntime = response.runtimeConfig || null;
      setRuntimeConfig(nextRuntime);
      setRuntimeDraft(cloneRuntimeConfigForDraft(nextRuntime));
      setMessage(response.message || 'Ticket workflow paused successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error pausing ticket workflow: ' + (error.response?.data?.message || error.message));
    } finally {
      setRuntimeWorkflowBusy(false);
    }
  };

  const handleResumeTicketWorkflow = async () => {
    try {
      setRuntimeWorkflowBusy(true);
      const response = await adminAPI.resumeTicketWorkflow();
      const nextRuntime = response.runtimeConfig || null;
      setRuntimeConfig(nextRuntime);
      setRuntimeDraft(cloneRuntimeConfigForDraft(nextRuntime));
      setMessage(response.message || 'Ticket workflow resumed successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error resuming ticket workflow: ' + (error.response?.data?.message || error.message));
    } finally {
      setRuntimeWorkflowBusy(false);
    }
  };

  const handleSaveTicketAvailability = async () => {
    if (!runtimeDraft?.ticketAvailability) return;

    try {
      setRuntimeAvailabilitySaving(true);
      const response = await adminAPI.updateRuntimeConfig({
        ticketAvailability: runtimeDraft.ticketAvailability
      });
      const nextRuntime = response.runtimeConfig || null;
      setRuntimeConfig(nextRuntime);
      setRuntimeDraft(cloneRuntimeConfigForDraft(nextRuntime));
      setMessage(response.message || 'Ticket availability updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error updating ticket availability: ' + (error.response?.data?.message || error.message));
    } finally {
      setRuntimeAvailabilitySaving(false);
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
      sold: 'bg-blue-500/20 text-blue-300',
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

  const formatNumber = (value) => Number(value || 0).toLocaleString();
  const lastRefreshLabel = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Not refreshed yet';

  const consoleSections = [
    { key: 'overview', label: 'Overview' },
    { key: 'tickets', label: 'Tickets', count: (overview?.tickets?.open || 0) + (overview?.tickets?.inProgress || 0) + (overview?.tickets?.awaitingClose || 0) },
    { key: 'users', label: 'Users', count: overview?.users?.total },
    { key: 'trade-requests', label: 'Trade Requests', count: overview?.tradeRequests?.active },
    { key: 'moderation', label: 'Moderation', count: overview?.moderation?.activeBans },
    { key: 'infrastructure', label: 'Infrastructure', count: overview?.payments?.enabledCurrencies }
  ];

  const renderMetricCard = ({ label, value, detail, tone = 'neutral' }) => {
    const toneClass = {
      neutral: 'border-n-5 bg-n-7/70',
      green: 'border-[#10B981]/30 bg-[#10B981]/10',
      amber: 'border-amber-400/30 bg-amber-400/10',
      red: 'border-red-400/30 bg-red-400/10',
      cyan: 'border-cyan-400/30 bg-cyan-400/10'
    }[tone] || 'border-n-5 bg-n-7/70';

    return (
      <div className={`rounded-lg border p-4 ${toneClass}`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-n-4">{label}</p>
        <p className="mt-3 text-2xl font-semibold text-n-1">{value}</p>
        {detail ? <p className="mt-1 text-xs text-n-3">{detail}</p> : null}
      </div>
    );
  };

  const renderOverview = () => (
    <div className={activeSection === 'overview' ? 'space-y-6' : 'hidden'}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {renderMetricCard({
          label: 'Ticket Queue',
          value: formatNumber((overview?.tickets?.open || 0) + (overview?.tickets?.inProgress || 0)),
          detail: `${formatNumber(overview?.tickets?.disputed)} disputed, ${formatNumber(overview?.tickets?.awaitingClose)} awaiting close`,
          tone: overview?.tickets?.disputed ? 'red' : 'green'
        })}
        {renderMetricCard({
          label: 'Users',
          value: formatNumber(overview?.users?.total),
          detail: `${formatNumber(overview?.users?.admins)} admins, ${formatNumber(overview?.users?.moderators)} moderators`,
          tone: 'cyan'
        })}
        {renderMetricCard({
          label: 'Active Bans',
          value: formatNumber(overview?.moderation?.activeBans),
          detail: `${formatNumber(overview?.moderation?.temporaryBans)} temporary, ${formatNumber(overview?.moderation?.permanentBans)} permanent`,
          tone: overview?.moderation?.activeBans ? 'amber' : 'neutral'
        })}
        {renderMetricCard({
          label: 'Payments',
          value: overview?.payments?.ticketWorkflowPaused ? 'Paused' : 'Active',
          detail: `${formatNumber(overview?.payments?.enabledCurrencies)} currencies enabled, ${formatNumber(overview?.payments?.configuredChains)} chains configured`,
          tone: overview?.payments?.ticketWorkflowPaused ? 'amber' : 'green'
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-n-5 bg-n-6">
          <div className="flex items-center justify-between border-b border-n-5 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-n-1">Recent Tickets</h3>
              <p className="text-xs text-n-4">Latest queue movement across all escrow tickets</p>
            </div>
            <button onClick={() => setActiveSection('tickets')} className="text-xs font-semibold text-color-4 hover:text-color-4/80">
              View queue
            </button>
          </div>
          <div className="divide-y divide-n-5">
            {(overview?.activity?.latestTickets || []).map((ticket) => (
              <button
                key={ticket._id}
                type="button"
                onClick={() => navigate(`/trade-ticket?ticketId=${encodeURIComponent(ticket.ticketId)}`)}
                className="grid w-full gap-2 px-5 py-4 text-left transition-colors hover:bg-n-7/60 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-n-2">{ticket.ticketId}</p>
                  <p className="mt-1 truncate text-sm text-n-1">
                    @{ticket.sender?.username || 'Pending'} to @{ticket.receiver?.username || 'Pending'}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${getTicketStatusStyle(ticket.status)}`}>
                    {ticket.status}
                  </span>
                  <span className="text-xs uppercase text-n-4">{ticket.cryptocurrency}</span>
                </div>
              </button>
            ))}
            {(overview?.activity?.latestTickets || []).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-n-4">No recent tickets.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-n-5 bg-n-6">
          <div className="flex items-center justify-between border-b border-n-5 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-n-1">Audit Activity</h3>
              <p className="text-xs text-n-4">Latest moderation and operational records</p>
            </div>
            <button onClick={() => setActiveSection('moderation')} className="text-xs font-semibold text-color-4 hover:text-color-4/80">
              View audit
            </button>
          </div>
          <div className="divide-y divide-n-5">
            {(overview?.activity?.latestModerationActions || []).map((action) => (
              <div key={action._id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${getModerationActionStyle(action.actionType)}`}>
                    {String(action.actionType || 'unknown').replaceAll('_', ' ')}
                  </span>
                  <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${getModerationScopeStyle(action.scope)}`}>
                    {action.scope || 'system'}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-n-2">{action.reason || 'No reason provided'}</p>
                <p className="mt-1 text-xs text-n-4">
                  {action.createdAt ? new Date(action.createdAt).toLocaleString() : 'N/A'}
                </p>
              </div>
            ))}
            {(overview?.activity?.latestModerationActions || []).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-n-4">No audit activity.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <LoadingState
        variant="page"
        label="Loading admin console"
        detail="Preparing site metrics, audit trails, and infrastructure controls."
      />
    );
  }

  return (
    <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 border-b border-n-6 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex rounded-md border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-red-300">
            Developer Console
          </div>
          <h2 className="text-2xl font-semibold text-n-1 md:text-3xl">Administration</h2>
          <p className="mt-1 text-sm text-n-4">
            Site operations, user controls, moderation audit, and payment infrastructure.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-n-4">Last refresh: <span className="text-n-2">{lastRefreshLabel}</span></span>
          <Button onClick={async () => {
            await Promise.all([
              loadUsersAndStats(),
              loadTradeTickets(),
              loadTradeRequests(),
              loadModerationActions(),
              loadActiveBans()
            ]);
            setLastRefreshedAt(new Date());
          }}>
            Refresh Data
          </Button>
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.includes('success') ? 'bg-color-4/10 border border-color-4/50 text-color-4' : 'bg-red-500/10 border border-red-500/50 text-red-400'}`}>
          {message}
        </div>
      )}

      <div className="mb-6 overflow-x-auto">
        <div className="flex min-w-max gap-2 rounded-lg border border-n-6 bg-n-7/40 p-1">
          {consoleSections.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                activeSection === section.key
                  ? 'bg-n-1 text-n-8'
                  : 'text-n-3 hover:bg-n-6 hover:text-n-1'
              }`}
            >
              {section.label}
              {Number.isFinite(section.count) ? (
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                  activeSection === section.key ? 'bg-n-8/10 text-n-8' : 'bg-n-6 text-n-3'
                }`}>
                  {formatNumber(section.count)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {renderOverview()}

      {/* Stats Cards */}
      {stats && (
        <div className={activeSection === 'overview' ? 'grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 mb-8' : 'hidden'}>
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

      {/* Payment Infrastructure Section */}
      <div className={activeSection === 'infrastructure' ? 'mb-10 rounded-lg border border-n-5 bg-n-6' : 'hidden'}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-n-5 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-n-1">Payment Infrastructure</h3>
            <p className="mt-0.5 text-xs text-n-4">
              HD-derived deposit addresses across 4 chains and 8 currencies.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs ${
                runtimeConfig?.ticketWorkflowPaused
                  ? 'border-n-4 bg-n-7 text-n-2'
                  : 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                runtimeConfig?.ticketWorkflowPaused ? 'bg-n-3' : 'bg-[#10B981]'
              }`} />
              {runtimeConfig?.ticketWorkflowPaused ? 'Paused' : 'Active'}
            </span>
            {runtimeConfig?.ticketWorkflowPaused ? (
              <button
                onClick={handleResumeTicketWorkflow}
                disabled={runtimeWorkflowBusy}
                className="rounded-md border border-n-5 bg-n-7 px-3 py-1.5 text-xs font-medium text-n-1 transition-colors hover:bg-n-5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runtimeWorkflowBusy ? 'Resuming...' : 'Resume'}
              </button>
            ) : (
              <button
                onClick={handlePauseTicketWorkflow}
                disabled={runtimeWorkflowBusy}
                className="rounded-md border border-n-5 bg-n-7 px-3 py-1.5 text-xs font-medium text-n-1 transition-colors hover:bg-n-5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runtimeWorkflowBusy ? 'Pausing...' : 'Pause'}
              </button>
            )}
            <button
              onClick={() => { loadRuntimeConfig(); loadWalletInfrastructure(); }}
              disabled={runtimeLoading || walletInfrastructureLoading}
              className="rounded-md border border-n-5 bg-n-7 px-3 py-1.5 text-xs font-medium text-n-2 transition-colors hover:bg-n-5 disabled:cursor-not-allowed disabled:opacity-50"
              title="Reload"
            >
              <svg className={`h-3.5 w-3.5 ${(runtimeLoading || walletInfrastructureLoading) ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {(runtimeLoading || walletInfrastructureLoading) && !walletInfrastructure ? (
          <LoadingState
            variant="panel"
            label="Loading infrastructure"
            detail="Checking wallets, chains, and live payment monitors."
            className="rounded-none border-0"
          />
        ) : (
          <div className="p-5 space-y-5">

            {/* ── HD Wallet Chain Status ── */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-n-3">Chains</h4>
                {walletInfrastructure?.generatedAt && (
                  <span className="text-[10px] text-n-4">
                    Updated {new Date(walletInfrastructure.generatedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(walletInfrastructure?.chains || []).map((chain) => {
                  const isRevealed = revealedAddressChain === chain.chain;
                  const chainLabel = { bitcoin: 'Bitcoin', litecoin: 'Litecoin', ethereum: 'Ethereum', solana: 'Solana' }[chain.chain];
                  const logo = cryptoBrandLogos[chain.chain];
                  return (
                    <div
                      key={chain.chain}
                      className="rounded-md border border-n-5 bg-n-7 p-3"
                    >
                      {/* Header row: logo + name + status dot */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <img src={logo} alt={chainLabel} className="h-6 w-6 flex-shrink-0 rounded-full" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-n-1 truncate">{chainLabel}</p>
                            <p className="text-[10px] text-n-4 capitalize">{chain.networkMode}</p>
                          </div>
                        </div>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            chain.configured ? 'bg-[#10B981]' : 'bg-n-3'
                          }`}
                          title={chain.configured ? 'Configured' : 'Not configured'}
                        />
                      </div>

                      {/* Stats row */}
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-n-4">Index</p>
                          <p className="mt-0.5 text-xs font-semibold text-n-1 font-mono">#{chain.nextDerivationIndex}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-n-4">Tickets</p>
                          <p className="mt-0.5 text-xs font-semibold text-n-1">{chain.activeTickets}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-n-4">Orders</p>
                          <p className="mt-0.5 text-xs font-semibold text-n-1">{chain.activeOrders}</p>
                        </div>
                      </div>

                      {/* Address row */}
                      {chain.configured ? (
                        <div className="mt-3 flex items-center gap-1 rounded border border-n-5 bg-n-6 px-2 py-1.5">
                          <code className="flex-1 truncate text-[10px] font-mono text-n-2">
                            {isRevealed
                              ? chain.sampleAddressAtIndex0
                              : `${chain.sampleAddressAtIndex0?.slice(0, 8)}…${chain.sampleAddressAtIndex0?.slice(-6)}`}
                          </code>
                          <button
                            type="button"
                            onClick={() => setRevealedAddressChain(isRevealed ? null : chain.chain)}
                            className="text-n-4 transition-colors hover:text-n-1"
                            title={isRevealed ? 'Hide' : 'Reveal'}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {isRevealed
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                              }
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(chain.sampleAddressAtIndex0 || '')}
                            className="text-n-4 transition-colors hover:text-n-1"
                            title="Copy address"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 rounded border border-n-5 bg-n-6 px-2 py-1.5 text-[10px] text-n-4">
                          Not configured in env
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Currency Availability ── */}
            {runtimeDraft && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-n-3">Currencies</h4>
                  <button
                    onClick={handleSaveTicketAvailability}
                    disabled={runtimeAvailabilitySaving}
                    className="rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1 text-xs font-medium text-[#10B981] transition-colors hover:bg-[#10B981]/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {runtimeAvailabilitySaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
                  {runtimeTicketCoins.map((coin) => {
                    const enabled = Boolean(runtimeDraft.ticketAvailability?.[coin.key]);
                    const chainConfigured = (walletInfrastructure?.chains || []).find((c) => c.chain === coin.chain)?.configured;
                    const blocked = !chainConfigured;
                    const logo = cryptoBrandLogos[coin.key];
                    return (
                      <button
                        type="button"
                        key={coin.key}
                        onClick={() => !blocked && updateRuntimeDraftTicketAvailability(coin.key, !enabled)}
                        disabled={blocked}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-all ${
                          blocked
                            ? 'border-n-5 bg-n-7/40 cursor-not-allowed opacity-50'
                            : enabled
                              ? 'border-[#10B981]/30 bg-[#10B981]/5 hover:bg-[#10B981]/10'
                              : 'border-n-5 bg-n-7 hover:border-n-4'
                        }`}
                      >
                        <img src={logo} alt={coin.label} className="h-7 w-7 flex-shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-n-1 truncate">{coin.label}</p>
                          <p className="text-[10px] text-n-4">{coin.code}</p>
                        </div>
                        <span
                          className={`h-2 w-2 flex-shrink-0 rounded-full ${
                            blocked ? 'bg-n-4' : enabled ? 'bg-[#10B981]' : 'bg-n-4'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Integrations ── */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-n-5 bg-n-7 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-n-3">Solana RPC</span>
                  {walletInfrastructure?.solana && (
                    <span className="text-[10px] text-n-4 capitalize">{walletInfrastructure.solana.network}</span>
                  )}
                </div>
                <code className="block truncate text-[11px] font-mono text-n-2">
                  {walletInfrastructure?.solana?.rpc || '—'}
                </code>
                <div className="mt-2 flex gap-2 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      walletInfrastructure?.solana?.splMintsConfigured?.['usdt-spl'] ? 'bg-[#10B981]' : 'bg-n-3'
                    }`} />
                    <span className="text-n-3">USDT-SOL mint</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      walletInfrastructure?.solana?.splMintsConfigured?.['usdc-spl'] ? 'bg-[#10B981]' : 'bg-n-3'
                    }`} />
                    <span className="text-n-3">USDC-SOL mint</span>
                  </span>
                </div>
              </div>

              <div className="rounded-md border border-n-5 bg-n-7 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-n-3">ERC-20 Contracts</span>
                  {walletInfrastructure?.ethereum && (
                    <span className="text-[10px] text-n-4 capitalize">{walletInfrastructure.ethereum.network}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <img src={cryptoBrandLogos['usdt-erc20']} alt="USDT" className="h-4 w-4 rounded-full" />
                    <code className="flex-1 truncate text-[11px] font-mono text-n-2">
                      {walletInfrastructure?.ethereum?.contracts?.['usdt-erc20'] || '—'}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <img src={cryptoBrandLogos['usdc-erc20']} alt="USDC" className="h-4 w-4 rounded-full" />
                    <code className="flex-1 truncate text-[11px] font-mono text-n-2">
                      {walletInfrastructure?.ethereum?.contracts?.['usdc-erc20'] || '—'}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Maintenance message (collapsed when not paused) ── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-n-3">Maintenance Message</h4>
                <span className="text-[10px] text-n-4">
                  {runtimeConfig?.ticketWorkflowPaused ? 'Shown to users while paused' : 'Stored for next pause'}
                </span>
              </div>
              <textarea
                rows={2}
                value={runtimePauseReason}
                onChange={(e) => setRuntimePauseReason(e.target.value)}
                placeholder="e.g. Maintenance window in progress. Ticket actions resume in 10 minutes."
                className="w-full resize-none rounded-md border border-n-5 bg-n-7 px-3 py-2 text-sm text-n-1 placeholder-n-4 focus:border-[#10B981] focus:outline-none"
              />
            </div>

            {/* ── Footer hint ── */}
            <div className="border-t border-n-5 pt-3 text-[11px] text-n-4">
              Per-ticket addresses are derived from xpubs in <code className="rounded bg-n-7 px-1 py-0.5 text-n-2">.env</code>.
              Match is by destination address — two deposits can never collide. Tickets do not expire; cancel via user/admin, refund via admin.
            </div>
          </div>
        )}
      </div>

      <div className={activeSection === 'users' ? '' : 'hidden'}>
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
        <div className="px-4 py-2 border-b border-n-5 bg-n-7/50 text-xs text-n-4">
          Scroll sideways to view all user fields.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px]">
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
                      <span className="text-n-1 font-medium max-w-[220px] truncate" title={user.username}>
                        {user.username}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-n-3 text-sm max-w-[280px]">
                    <span className="block truncate" title={user.email}>
                      {user.email}
                    </span>
                  </td>
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
      </div>

      {/* Trade Tickets Section */}
      <div className={activeSection === 'tickets' ? '' : 'hidden'}>
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
          <div className="px-4 py-2 border-b border-n-5 bg-n-7/50 text-xs text-n-4">
            Scroll sideways to view all ticket columns.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
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
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1 max-w-[220px]">
                      <span className="block truncate" title={ticket.sender?.username ? `@${ticket.sender.username}` : 'Pending'}>
                        {ticket.sender?.username ? `@${ticket.sender.username}` : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1 max-w-[220px]">
                      <span className="block truncate" title={ticket.receiver?.username ? `@${ticket.receiver.username}` : 'Pending'}>
                        {ticket.receiver?.username ? `@${ticket.receiver.username}` : 'Pending'}
                      </span>
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
      <div className={activeSection === 'moderation' ? 'mt-0' : 'hidden'}>
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
      <div className={activeSection === 'moderation' ? 'mt-8' : 'hidden'}>
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
      <div className={activeSection === 'trade-requests' ? '' : 'hidden'}>
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
            <option value="sold">Sold</option>
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
                            <option value="sold">Sold</option>
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
