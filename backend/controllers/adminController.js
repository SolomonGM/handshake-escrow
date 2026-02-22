import mongoose from 'mongoose';
import User from '../models/User.js';
import TradeRequest from '../models/TradeRequest.js';
import TradeTicket from '../models/TradeTicket.js';
import { refreshLeaderboard } from '../services/leaderboardService.js';
import { getRankForTotalUSD, getXpForTotalUSD, isStaffRank } from '../utils/rankUtils.js';
import { isStaffUser } from '../utils/staffUtils.js';

const MAX_RECENT_PAGES = 10;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePageParams = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 100);
  return { page, pageSize };
};

const resolveSortOrder = (value, fallback = 'desc') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return normalized === 'asc' ? 1 : -1;
};

const resolveSortField = (requested, mapping, fallback) => (
  mapping[requested] || mapping[fallback] || fallback
);

const buildSort = (field, order) => {
  const sort = { [field]: order };
  if (field !== '_id') {
    sort._id = -1;
  }
  return sort;
};

const toTrimmedString = (value, fallback = '') => String(value || fallback).trim();

// Get all users (Admin only)
export const getAllUsers = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const search = toTrimmedString(req.query.search);
    const roleFilter = toTrimmedString(req.query.role, 'all').toLowerCase();
    const rankFilter = toTrimmedString(req.query.rank, 'all').toLowerCase();
    const twoFactorFilter = toTrimmedString(req.query.twoFactor, 'all').toLowerCase();
    const { page, pageSize } = parsePageParams(req);

    const sortFieldMap = {
      createdAt: 'createdAt',
      username: 'username',
      email: 'email',
      role: 'role',
      rank: 'rank',
      xp: 'xp',
      passes: 'passes',
      totalUSDValue: 'totalUSDValue',
      totalDeals: 'totalDeals',
      lastLogin: 'lastLogin',
      twoFactor: 'twoFactor.enabled'
    };
    const requestedSortBy = toTrimmedString(req.query.sortBy, 'createdAt');
    const sortField = resolveSortField(requestedSortBy, sortFieldMap, 'createdAt');
    const sortOrder = resolveSortOrder(req.query.sortOrder, 'desc');
    const sort = buildSort(sortField, sortOrder);

    const query = {};

    if (search) {
      const regex = new RegExp(escapeRegExp(search), 'i');
      const orConditions = [
        { username: regex },
        { email: regex },
        { userId: regex }
      ];

      if (mongoose.Types.ObjectId.isValid(search)) {
        orConditions.push({ _id: new mongoose.Types.ObjectId(search) });
      }

      query.$or = orConditions;
    }

    if (['user', 'admin', 'moderator'].includes(roleFilter)) {
      query.role = roleFilter;
    }

    if (rankFilter && rankFilter !== 'all') {
      query.rank = rankFilter;
    }

    if (twoFactorFilter === 'enabled') {
      query['twoFactor.enabled'] = true;
    } else if (twoFactorFilter === 'disabled') {
      query['twoFactor.enabled'] = { $ne: true };
    }

    const totalCount = await User.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(page, totalPages);

    let usersQuery = User.find(query)
      .select('-password')
      .sort(sort)
      .skip((safePage - 1) * pageSize)
      .limit(pageSize);

    if (['username', 'email', 'role', 'rank'].includes(requestedSortBy)) {
      usersQuery = usersQuery.collation({ locale: 'en', strength: 2 });
    }

    const users = await usersQuery;

    res.json({
      users,
      page: safePage,
      pageSize,
      totalCount,
      totalPages
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user rank (Admin only)
export const updateUserRank = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { userId, rank } = req.body;
    const normalizedRank = typeof rank === 'string' ? rank.trim().toLowerCase() : rank;
    const rankAliases = {
      whale: 'ruby rich',
      moderator: 'manager'
    };
    const resolvedRank = rankAliases[normalizedRank] || normalizedRank;
    const validRanks = ['client', 'rich client', 'top client', 'ruby rich', 'manager', 'admin', 'owner', 'developer'];

    if (!validRanks.includes(resolvedRank)) {
      return res.status(400).json({ message: 'Invalid rank' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { rank: resolvedRank },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User rank updated successfully', user });
  } catch (error) {
    console.error('Update user rank error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user role (Admin only)
export const updateUserRole = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { userId, role } = req.body;
    const validRoles = ['user', 'admin', 'moderator'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User role updated successfully', user });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user XP (Admin only)
export const updateUserXP = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { userId, xp } = req.body;
    const xpValue = Number(xp);

    if (!Number.isFinite(xpValue) || xpValue < 0) {
      return res.status(400).json({ message: 'XP must be a non-negative number' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (isStaffRank(user.rank)) {
      user.xp = xpValue;
      await user.save();
    } else {
      const computedXp = getXpForTotalUSD(user.totalUSDValue);
      user.xp = computedXp;
      await user.save();
    }

    res.json({ message: 'User XP updated successfully', user });
  } catch (error) {
    console.error('Update user XP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user passes (Admin only)
export const updateUserPasses = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { userId, passes } = req.body;

    if (passes < 0) {
      return res.status(400).json({ message: 'Passes cannot be negative' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { passes },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User passes updated successfully', user });
  } catch (error) {
    console.error('Update user passes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user total USD value (Admin only)
export const updateUserTotalUSDValue = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { userId, totalUSDValue } = req.body;
    const totalValue = Number(totalUSDValue);

    if (!Number.isFinite(totalValue) || totalValue < 0) {
      return res.status(400).json({ message: 'Total USD value must be a non-negative number' });
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData = { totalUSDValue: totalValue };
    if (!isStaffRank(existingUser.rank)) {
      updateData.rank = getRankForTotalUSD(totalValue);
      updateData.xp = getXpForTotalUSD(totalValue);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await refreshLeaderboard({ force: true });
    res.json({ message: 'User total USD value updated successfully', user });
  } catch (error) {
    console.error('Update user total USD value error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user total deals (Admin only)
export const updateUserTotalDeals = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { userId, totalDeals } = req.body;

    if (totalDeals < 0) {
      return res.status(400).json({ message: 'Total deals cannot be negative' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { totalDeals },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await refreshLeaderboard({ force: true });
    res.json({ message: 'User total deals updated successfully', user });
  } catch (error) {
    console.error('Update user total deals error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete user (Admin only)
export const deleteUser = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { userId } = req.params;

    // Prevent deleting yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get site statistics (Admin only)
export const getSiteStats = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const verifiedUsers = await User.countDocuments({ 'twoFactor.enabled': true });
    
    const rankCounts = await User.aggregate([
      { $group: { _id: '$rank', count: { $sum: 1 } } }
    ]);

    res.json({
      totalUsers,
      adminUsers,
      verifiedUsers,
      rankCounts
    });
  } catch (error) {
    console.error('Get site stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all trade requests (Admin only)
export const getTradeRequests = async (req, res) => {
  try {
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const search = toTrimmedString(req.query.search);
    const statusFilter = toTrimmedString(req.query.status, 'all').toLowerCase();
    const { page, pageSize } = parsePageParams(req);
    const isSearch = Boolean(search);
    const hasStatusFilter = ['active', 'paused', 'expired', 'deleted'].includes(statusFilter);
    const hasScopedQuery = isSearch || hasStatusFilter;
    const query = {};

    const sortFieldMap = {
      createdAt: 'createdAt',
      expiresAt: 'expiresAt',
      priceAmount: 'priceAmount',
      status: 'status',
      requestId: 'requestId',
      type: 'type'
    };
    const requestedSortBy = toTrimmedString(req.query.sortBy, 'createdAt');
    const sortField = resolveSortField(requestedSortBy, sortFieldMap, 'createdAt');
    const sortOrder = resolveSortOrder(req.query.sortOrder, 'desc');
    const sort = buildSort(sortField, sortOrder);

    if (isSearch) {
      const regex = new RegExp(escapeRegExp(search), 'i');
      const userMatches = await User.find({ username: regex }).select('_id');
      const userIds = userMatches.map((user) => user._id);
      const orConditions = [
        { itemOffered: regex },
        { itemDescription: regex },
        { requestId: regex }
      ];

      if (userIds.length) {
        orConditions.push({ creator: { $in: userIds } });
      }

      if (mongoose.Types.ObjectId.isValid(search)) {
        orConditions.push({ _id: new mongoose.Types.ObjectId(search) });
      }

      query.$or = orConditions;
    }

    if (hasStatusFilter) {
      query.status = statusFilter;
    }

    const totalCount = await TradeRequest.countDocuments(query);
    const rawTotalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const totalPages = hasScopedQuery ? rawTotalPages : Math.min(MAX_RECENT_PAGES, rawTotalPages);

    if (!hasScopedQuery && page > MAX_RECENT_PAGES) {
      return res.json({
        tradeRequests: [],
        page,
        pageSize,
        totalCount,
        totalPages,
        restricted: true
      });
    }

    const safePage = Math.min(page, totalPages);
    let tradeRequestsQuery = TradeRequest.find(query)
      .populate('creator', 'username avatar')
      .sort(sort)
      .skip((safePage - 1) * pageSize)
      .limit(pageSize);

    if (['status', 'requestId', 'type'].includes(requestedSortBy)) {
      tradeRequestsQuery = tradeRequestsQuery.collation({ locale: 'en', strength: 2 });
    }

    const tradeRequests = await tradeRequestsQuery;

    res.json({
      tradeRequests,
      page: safePage,
      pageSize,
      totalCount,
      totalPages,
      restricted: !hasScopedQuery && rawTotalPages > MAX_RECENT_PAGES
    });
  } catch (error) {
    console.error('Get trade requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update trade request (Admin only)
export const updateTradeRequest = async (req, res) => {
  try {
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { requestId } = req.params;
    const updateData = req.body;

    const tradeRequest = await TradeRequest.findById(requestId);

    if (!tradeRequest) {
      return res.status(404).json({ message: 'Trade request not found' });
    }

    const allowedUpdates = [
      'type',
      'itemOffered',
      'itemDescription',
      'priceAmount',
      'priceCurrency',
      'cryptoOffered',
      'paymentMethods',
      'warrantyAvailable',
      'warrantyDuration',
      'termsAndConditions',
      'expiresAt',
      'status'
    ];

    allowedUpdates.forEach((field) => {
      if (updateData[field] !== undefined) {
        tradeRequest[field] = updateData[field];
      }
    });

    await tradeRequest.save();
    await tradeRequest.populate('creator', 'username avatar');

    res.json({ tradeRequest });
  } catch (error) {
    console.error('Update trade request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete trade request (Admin only)
export const deleteTradeRequest = async (req, res) => {
  try {
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const { requestId } = req.params;
    const tradeRequest = await TradeRequest.findByIdAndDelete(requestId);

    if (!tradeRequest) {
      return res.status(404).json({ message: 'Trade request not found' });
    }

    res.json({ message: 'Trade request deleted successfully' });
  } catch (error) {
    console.error('Delete trade request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const resolveTicketRoleUser = (ticket, role) => {
  if (!ticket || !role) return null;

  if (ticket.creatorRole === role && ticket.creator) {
    return ticket.creator;
  }

  const participant = ticket.participants?.find(
    (p) => p?.status === 'accepted' && p?.role === role && p?.user
  );

  return participant?.user || null;
};

const formatTicketUser = (user) => {
  if (!user) return null;
  return {
    _id: user._id,
    username: user.username,
    userId: user.userId,
    avatar: user.avatar
  };
};

// Get all trade tickets (Staff only - admin/moderator/developer)
export const getTradeTickets = async (req, res) => {
  try {
    if (!isStaffUser(req.user)) {
      return res.status(403).json({ message: 'Access denied. Staff only.' });
    }

    const search = toTrimmedString(req.query.search);
    const statusFilter = toTrimmedString(req.query.status, 'all').toLowerCase();
    const { page, pageSize } = parsePageParams(req);
    const isSearch = Boolean(search);
    const hasStatusFilter = ['open', 'in-progress', 'awaiting-close', 'closing', 'completed', 'cancelled', 'disputed', 'refunded'].includes(statusFilter);
    const hasScopedQuery = isSearch || hasStatusFilter;
    const query = {};

    const sortFieldMap = {
      updatedAt: 'updatedAt',
      createdAt: 'createdAt',
      status: 'status',
      ticketId: 'ticketId',
      cryptocurrency: 'cryptocurrency'
    };
    const requestedSortBy = toTrimmedString(req.query.sortBy, 'updatedAt');
    const sortField = resolveSortField(requestedSortBy, sortFieldMap, 'updatedAt');
    const sortOrder = resolveSortOrder(req.query.sortOrder, 'desc');
    const sort = buildSort(sortField, sortOrder);

    if (isSearch) {
      const regex = new RegExp(escapeRegExp(search), 'i');
      const userMatches = await User.find({ username: regex }).select('_id');
      const userIds = userMatches.map((user) => user._id);
      const orConditions = [
        { ticketId: regex }
      ];

      if (userIds.length) {
        orConditions.push({ creator: { $in: userIds } });
        orConditions.push({ 'participants.user': { $in: userIds } });
      }

      if (mongoose.Types.ObjectId.isValid(search)) {
        orConditions.push({ _id: new mongoose.Types.ObjectId(search) });
      }

      query.$or = orConditions;
    }

    if (hasStatusFilter) {
      query.status = statusFilter;
    }

    const totalCount = await TradeTicket.countDocuments(query);
    const rawTotalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const totalPages = hasScopedQuery ? rawTotalPages : Math.min(MAX_RECENT_PAGES, rawTotalPages);

    if (!hasScopedQuery && page > MAX_RECENT_PAGES) {
      return res.json({
        tickets: [],
        page,
        pageSize,
        totalCount,
        totalPages,
        restricted: true
      });
    }

    const safePage = Math.min(page, totalPages);

    let ticketsQuery = TradeTicket.find(query)
      .select('ticketId status cryptocurrency createdAt updatedAt creator creatorRole rolesConfirmed participants')
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar')
      .sort(sort)
      .skip((safePage - 1) * pageSize)
      .limit(pageSize);

    if (['status', 'ticketId', 'cryptocurrency'].includes(requestedSortBy)) {
      ticketsQuery = ticketsQuery.collation({ locale: 'en', strength: 2 });
    }

    const tickets = await ticketsQuery.lean();

    const formattedTickets = tickets.map((ticket) => {
      const senderUser = resolveTicketRoleUser(ticket, 'sender');
      const receiverUser = resolveTicketRoleUser(ticket, 'receiver');

      return {
        _id: ticket._id,
        ticketId: ticket.ticketId,
        status: ticket.status,
        cryptocurrency: ticket.cryptocurrency,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        creatorRole: ticket.creatorRole,
        rolesConfirmed: ticket.rolesConfirmed,
        creator: formatTicketUser(ticket.creator),
        participants: (ticket.participants || []).map((p) => ({
          status: p.status,
          role: p.role,
          user: formatTicketUser(p.user)
        })),
        sender: formatTicketUser(senderUser),
        receiver: formatTicketUser(receiverUser)
      };
    });

    res.json({
      tickets: formattedTickets,
      page: safePage,
      pageSize,
      totalCount,
      totalPages,
      restricted: !hasScopedQuery && rawTotalPages > MAX_RECENT_PAGES
    });
  } catch (error) {
    console.error('Get trade tickets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
