import TradeRequest from '../models/TradeRequest.js';
import User from '../models/User.js';

// Create a new trade request
export const createTradeRequest = async (req, res) => {
  try {
    const {
      type,
      itemOffered,
      itemDescription,
      priceAmount,
      priceCurrency,
      cryptoOffered,
      paymentMethods,
      warrantyAvailable,
      warrantyDuration,
      expiryHours
    } = req.body;

    const userId = req.user._id;

    // Validate required fields
    if (!type || !itemOffered || !priceAmount || !priceCurrency || !paymentMethods || paymentMethods.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if user already has 5 active trade requests
    const activeRequestsCount = await TradeRequest.countDocuments({
      creator: userId,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });

    if (activeRequestsCount >= 5) {
      return res.status(400).json({ 
        success: false,
        message: 'You already have 5 active trade requests. Please delete or wait for one to expire before creating a new one.' 
      });
    }

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (expiryHours || 24));

    const tradeRequest = new TradeRequest({
      creator: userId,
      type,
      itemOffered,
      itemDescription: itemDescription || '',
      priceAmount,
      priceCurrency,
      cryptoOffered: cryptoOffered || null,
      paymentMethods,
      warrantyAvailable: warrantyAvailable || false,
      warrantyDuration: warrantyDuration || 'none',
      expiresAt
    });

    await tradeRequest.save();

    // Populate creator details
    await tradeRequest.populate('creator', 'username avatar badges totalTrades completedTrades');

    res.status(201).json({
      success: true,
      tradeRequest
    });
  } catch (error) {
    console.error('Error creating trade request:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all active trade requests
export const getTradeRequests = async (req, res) => {
  try {
    const { type, crypto, minAmount, maxAmount, paymentMethod, search } = req.query;

    // Build filter
    const filter = { status: 'active', expiresAt: { $gt: new Date() } };

    if (type) filter.type = type;
    if (crypto) filter.cryptoOffered = crypto;
    if (paymentMethod) filter.paymentMethods = paymentMethod;
    if (minAmount) filter.maxTrade = { $gte: parseInt(minAmount) };
    if (maxAmount) filter.minTrade = { $lte: parseInt(maxAmount) };

    let tradeRequests = await TradeRequest.find(filter)
      .populate('creator', 'username avatar badges totalTrades completedTrades')
      .sort({ createdAt: -1 })
      .limit(100);

    // Search by username if provided
    if (search) {
      tradeRequests = tradeRequests.filter(req => 
        req.creator.username.toLowerCase().includes(search.toLowerCase())
      );
    }

    res.json({
      success: true,
      tradeRequests
    });
  } catch (error) {
    console.error('Error fetching trade requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single trade request
export const getTradeRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const tradeRequest = await TradeRequest.findById(requestId)
      .populate('creator', 'username avatar badges totalTrades completedTrades');

    if (!tradeRequest) {
      return res.status(404).json({ message: 'Trade request not found' });
    }

    // Increment view count
    tradeRequest.totalViews += 1;
    await tradeRequest.save();

    res.json({
      success: true,
      tradeRequest
    });
  } catch (error) {
    console.error('Error fetching trade request:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete trade request
export const deleteTradeRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const tradeRequest = await TradeRequest.findById(requestId);

    if (!tradeRequest) {
      return res.status(404).json({ message: 'Trade request not found' });
    }

    // Only creator can delete
    if (tradeRequest.creator.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this request' });
    }

    tradeRequest.status = 'deleted';
    await tradeRequest.save();

    res.json({
      success: true,
      message: 'Trade request deleted'
    });
  } catch (error) {
    console.error('Error deleting trade request:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update trade request
export const updateTradeRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;
    const updateData = req.body;

    const tradeRequest = await TradeRequest.findById(requestId);

    if (!tradeRequest) {
      return res.status(404).json({ message: 'Trade request not found' });
    }

    // Only creator can update
    if (tradeRequest.creator.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this request' });
    }

    // Update allowed fields
    const allowedUpdates = [
      'itemOffered',
      'itemDescription',
      'priceAmount',
      'priceCurrency',
      'minTrade',
      'maxTrade',
      'paymentMethods',
      'warrantyAvailable',
      'warrantyDuration',
      'termsAndConditions'
    ];

    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        tradeRequest[field] = updateData[field];
      }
    });

    await tradeRequest.save();
    await tradeRequest.populate('creator', 'username avatar badges totalTrades completedTrades');

    res.json({
      success: true,
      tradeRequest
    });
  } catch (error) {
    console.error('Error updating trade request:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark trade request as sold
export const markAsSold = async (req, res) => {
  try {
    const { requestId } = req.params;

    const tradeRequest = await TradeRequest.findById(requestId);

    if (!tradeRequest) {
      return res.status(404).json({ message: 'Trade request not found' });
    }

    tradeRequest.status = 'sold';
    await tradeRequest.save();

    res.json({
      success: true,
      message: 'Trade request marked as sold'
    });
  } catch (error) {
    console.error('Error marking as sold:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Pause/Resume trade request
export const toggleTradeRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const tradeRequest = await TradeRequest.findById(requestId);

    if (!tradeRequest) {
      return res.status(404).json({ message: 'Trade request not found' });
    }

    // Only creator can toggle
    if (tradeRequest.creator.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    tradeRequest.status = tradeRequest.status === 'active' ? 'paused' : 'active';
    await tradeRequest.save();

    res.json({
      success: true,
      tradeRequest
    });
  } catch (error) {
    console.error('Error toggling trade request:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
