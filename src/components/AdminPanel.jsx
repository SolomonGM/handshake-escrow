import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import Button from './Button';
import { getRankLabel, normalizeRank } from '../utils/rankDisplay';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [tradeRequests, setTradeRequests] = useState([]);
  const [tradeSearchTerm, setTradeSearchTerm] = useState('');
  const [tradeRequestsPage, setTradeRequestsPage] = useState(1);
  const [tradeRequestsTotalPages, setTradeRequestsTotalPages] = useState(1);
  const [tradeRequestsTotalCount, setTradeRequestsTotalCount] = useState(0);
  const [tradeRequestsRestricted, setTradeRequestsRestricted] = useState(false);
  const [editingTradeRequestId, setEditingTradeRequestId] = useState(null);
  const [tradeRequestDraft, setTradeRequestDraft] = useState(null);
  const [tradeTickets, setTradeTickets] = useState([]);
  const [ticketSearchTerm, setTicketSearchTerm] = useState('');
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsTotalPages, setTicketsTotalPages] = useState(1);
  const [ticketsTotalCount, setTicketsTotalCount] = useState(0);
  const [ticketsRestricted, setTicketsRestricted] = useState(false);

  const PAGE_SIZE = 25;
  const navigate = useNavigate();

  useEffect(() => {
    loadUsersAndStats();
  }, []);

  useEffect(() => {
    loadTradeRequests();
  }, [tradeSearchTerm, tradeRequestsPage]);

  useEffect(() => {
    loadTradeTickets();
  }, [ticketSearchTerm, ticketsPage]);

  const loadUsersAndStats = async () => {
    try {
      setLoading(true);
      const [usersData, statsData] = await Promise.all([
        adminAPI.getAllUsers(),
        adminAPI.getSiteStats()
      ]);
      setUsers(usersData.users);
      setStats(statsData);
    } catch (error) {
      setMessage('Error loading data: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const loadTradeRequests = async () => {
    try {
      const tradeRequestsData = await adminAPI.getTradeRequests(
        tradeSearchTerm,
        tradeRequestsPage,
        PAGE_SIZE
      );
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
      const tradeTicketsData = await adminAPI.getTradeTickets(
        ticketSearchTerm,
        ticketsPage,
        PAGE_SIZE
      );
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

  const filteredUsers = users.filter(user => 
    user.username?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

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
            <p className="text-n-4 text-sm mb-1">Verified Users</p>
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

      {/* Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search users by username or email..."
          value={userSearchTerm}
          onChange={(e) => setUserSearchTerm(e.target.value)}
          className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
        />
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

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search tickets by sender, receiver, or ticket ID..."
            value={ticketSearchTerm}
            onChange={(e) => {
              setTicketSearchTerm(e.target.value);
              setTicketsPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
          />
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

        {ticketsRestricted && !ticketSearchTerm && (
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

      {/* Trade Requests Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <h3 className="h4 text-n-1">Trade Requests</h3>
          <Button onClick={loadTradeRequests}>Refresh Trade Requests</Button>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search trade requests by request ID, creator, or item..."
            value={tradeSearchTerm}
            onChange={(e) => {
              setTradeSearchTerm(e.target.value);
              setTradeRequestsPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#ef4444] focus:ring-1 focus:ring-[#ef4444] transition-all"
          />
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

        {tradeRequestsRestricted && !tradeSearchTerm && (
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
