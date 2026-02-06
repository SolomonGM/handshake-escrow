import User from '../models/User.js';
import TradeRequest from '../models/TradeRequest.js';
import { refreshLeaderboard } from '../services/leaderboardService.js';

// Get all users (Admin only)
export const getAllUsers = async (req, res) => {
  try {
    // Check if user is admin with developer rank
    if (req.user.rank !== 'developer') {
      return res.status(403).json({ message: 'Access denied. Developer rank required.' });
    }

    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
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
    const validRanks = ['client', 'rich client', 'top client', 'whale', 'developer'];

    if (!validRanks.includes(rank)) {
      return res.status(400).json({ message: 'Invalid rank' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { rank },
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
    const validRoles = ['user', 'admin'];

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

    if (xp < 0) {
      return res.status(400).json({ message: 'XP cannot be negative' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { xp },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
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

    if (totalUSDValue < 0) {
      return res.status(400).json({ message: 'Total USD value cannot be negative' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { totalUSDValue },
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
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    
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

    const { search } = req.query;

    let tradeRequests = await TradeRequest.find()
      .populate('creator', 'username avatar')
      .sort({ createdAt: -1 });

    if (search) {
      const query = search.toLowerCase();
      tradeRequests = tradeRequests.filter((request) => {
        const creatorName = request.creator?.username?.toLowerCase() || '';
        const itemOffered = request.itemOffered?.toLowerCase() || '';
        const itemDescription = request.itemDescription?.toLowerCase() || '';
        const requestId = request.requestId?.toLowerCase() || '';
        const recordId = request._id?.toString().toLowerCase() || '';
        return (
          creatorName.includes(query) ||
          itemOffered.includes(query) ||
          itemDescription.includes(query) ||
          requestId.includes(query) ||
          recordId.includes(query)
        );
      });
    }

    res.json({ tradeRequests });
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
