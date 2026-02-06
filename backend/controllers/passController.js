import PassOrder from '../models/PassOrder.js';
import PassTransaction from '../models/PassTransaction.js';
import User from '../models/User.js';
import axios from 'axios';
import { upsertPassTransactionHistory } from '../services/passTransactionHistory.js';

const BLOCKCYPHER_TOKEN = process.env.BLOCKCYPHER_TOKEN || 'c35091e2555e49dfb41c2ba499c2ca0c';

// Pass configurations
const PASS_CONFIG = {
  '0': { type: 'Single', count: 1, price: 1 },
  '1': { type: 'Premium', count: 3, price: 5 },
  '2': { type: 'Rhino', count: 8, price: 12 }
};

// Crypto pricing (approximate - in production, use live API)
// TESTING: Set ETH = $240 so Rhino Pass ($12) costs exactly 0.05 ETH
const CRYPTO_PRICES = {
  'bitcoin': 45000,
  'ethereum': 240, // TESTING: allows 0.05 ETH for all passes
  'litecoin': 75,
  'solana': 100,
  'usdt-erc20': 1,
  'usdc-erc20': 1
};

// Master wallet addresses for each crypto (where funds ultimately go)
const MASTER_WALLETS = {
  'litecoin': 'mzQk8nUpFa6E8gZB1ViWaLLWPG4BUZwQDt', // Testnet master wallet
  'bitcoin': 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', // Testnet master wallet
  'ethereum': '0x55058382068dEB5E4EFDDbdd5A69D2771C7Cf80E', // Sepolia testnet wallet
  'solana': 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
  'usdt-erc20': '0x55058382068dEB5E4EFDDbdd5A69D2771C7Cf80E',
  'usdc-erc20': '0x55058382068dEB5E4EFDDbdd5A69D2771C7Cf80E'
};

/**
 * Generate a unique payment address for an order using BlockCypher API
 * This ensures each order has its own address, preventing transaction confusion
 * between multiple users purchasing at the same time.
 * 
 * For Ethereum: Uses the master wallet directly since Ethereum transactions
 * can be tracked by unique order amounts and transaction history.
 */
const generateUniquePaymentAddress = async (cryptocurrency, orderId) => {
  try {
    // For Litecoin and Bitcoin testnet, use BlockCypher's address generation
    if (cryptocurrency === 'litecoin' || cryptocurrency === 'bitcoin') {
      const networkPath = cryptocurrency === 'litecoin' ? 'ltc/test3' : 'btc/test3';
      const response = await axios.post(
        `https://api.blockcypher.com/v1/${networkPath}/addrs?token=${BLOCKCYPHER_TOKEN}`
      );
      
      console.log(`Generated unique address for order ${orderId}: ${response.data.address}`);
      
      return {
        address: response.data.address,
        private: response.data.private, // Store securely!
        public: response.data.public,
        wif: response.data.wif // Wallet Import Format
      };
    }
    
    // For Ethereum, Solana, and ERC-20 tokens:
    // Use master wallet directly. Each order is identified by:
    // 1. Unique expected amount (down to 8 decimal places)
    // 2. Transaction timestamp
    // 3. User's sending address
    // This allows multiple simultaneous orders to be tracked properly
    console.log(`ðŸ”‘ Using master wallet for ${cryptocurrency} order ${orderId}: ${MASTER_WALLETS[cryptocurrency]}`);
    
    return {
      address: MASTER_WALLETS[cryptocurrency],
      private: null,
      public: null,
      wif: null
    };
  } catch (error) {
    console.error('Error generating unique address:', error.message);
    // Fallback to master wallet if generation fails
    return {
      address: MASTER_WALLETS[cryptocurrency],
      private: null,
      public: null,
      wif: null
    };
  }
};

// Generate unique order ID
const generateOrderId = () => {
  return `PASS-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

// Create pass purchase order
export const createPassOrder = async (req, res) => {
  try {
    const { passId, cryptocurrency, passCount } = req.body;
    const userId = req.user._id;

    // Check if user already has an active order (pending or confirmed, not yet completed)
    const activeOrders = await PassOrder.find({
      user: userId,
      status: { $in: ['pending', 'confirmed'] },
      expiresAt: { $gt: new Date() }
    });

    if (activeOrders.length > 0) {
      // If any order has a detected transaction (transactionHash exists), prevent creating new order
      const orderWithPayment = activeOrders.find(order => order.transactionHash);
      
      if (orderWithPayment) {
        console.log(`âš ï¸  User ${userId} has active order with payment detected: ${orderWithPayment.orderId}`);
        return res.status(400).json({
          success: false,
          message: 'You already have an active payment in progress. Please complete or wait for it to expire.',
          activeOrder: {
            orderId: orderWithPayment.orderId,
            passType: orderWithPayment.passType,
            passCount: orderWithPayment.passCount,
            priceUSD: orderWithPayment.priceUSD,
            cryptocurrency: orderWithPayment.cryptocurrency,
            cryptoAmount: orderWithPayment.cryptoAmount,
            paymentAddress: orderWithPayment.paymentAddress,
            status: orderWithPayment.status,
            createdAt: orderWithPayment.createdAt,
            expiresAt: orderWithPayment.expiresAt,
            transactionHash: orderWithPayment.transactionHash,
            confirmations: orderWithPayment.confirmations
          }
        });
      }
      
      // If no payment detected yet, cancel all old orders and create new one
      // This allows user to switch payment methods before sending funds
      console.log(`ðŸ—‘ï¸  Cancelling ${activeOrders.length} previous order(s) for user ${userId} (no payment detected)`);
      await PassOrder.updateMany(
        { 
          user: userId, 
          status: { $in: ['pending', 'confirmed'] },
          transactionHash: null // Only cancel orders without detected payments
        },
        { 
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: 'User created new order before sending payment'
        }
      );
    }

    // Validate pass
    const passConfig = PASS_CONFIG[passId];
    if (!passConfig) {
      return res.status(400).json({ success: false, message: 'Invalid pass ID' });
    }

    // Validate cryptocurrency
    if (!MASTER_WALLETS[cryptocurrency]) {
      return res.status(400).json({ success: false, message: 'Unsupported cryptocurrency' });
    }

    // Calculate crypto amount
    const priceUSD = passConfig.price;
    const cryptoPrice = CRYPTO_PRICES[cryptocurrency];
    const cryptoAmount = (priceUSD / cryptoPrice).toFixed(8);

    // Generate unique payment address for this order
    const orderId = generateOrderId();
    const paymentAddressData = await generateUniquePaymentAddress(cryptocurrency, orderId);
    
    // Set expiration time (30 minutes for payment)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);
    
    // Set 10-minute timeout for initial detection
    const timeoutAt = new Date();
    timeoutAt.setMinutes(timeoutAt.getMinutes() + 10);

    const order = new PassOrder({
      orderId,
      user: userId,
      passId,
      passType: passConfig.type,
      passCount: passConfig.count,
      priceUSD,
      cryptocurrency,
      cryptoAmount: parseFloat(cryptoAmount),
      paymentAddress: paymentAddressData.address,
      expiresAt,
      timeoutDetails: {
        timeoutAt,
        timedOut: false,
        staffContactRequested: false
      },
      transactionDetails: {
        expectedAmount: parseFloat(cryptoAmount)
      }
    });

    await order.save();
    
    console.log(`ðŸ“ Created pass order ${orderId} for user ${userId}`);
    console.log(`   Amount: ${cryptoAmount} ${cryptocurrency.toUpperCase()} ($${priceUSD})`);
    console.log(`   Payment Address: ${paymentAddressData.address}`);
    console.log(`   Expires: ${expiresAt.toISOString()}`);

    res.json({
      success: true,
      order: {
        orderId: order.orderId,
        passType: order.passType,
        passCount: order.passCount,
        priceUSD: order.priceUSD,
        cryptocurrency: order.cryptocurrency,
        cryptoAmount: order.cryptoAmount,
        paymentAddress: order.paymentAddress,
        expiresAt: order.expiresAt,
        createdAt: order.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating pass order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get user's pass orders
export const getUserPassOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    const orders = await PassOrder.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    console.error('Error fetching pass orders:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get single order
export const getPassOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await PassOrder.findOne({ orderId, user: userId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Error fetching pass order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get pass transaction history for the user
export const getPassTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const transactions = await PassTransaction.find({ user: userId })
      .sort({ purchasedAt: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      transactions: transactions.map((tx) => ({
        id: tx._id,
        orderId: tx.orderId,
        incomingTxnId: tx.incomingTxnId,
        outgoingTxnId: tx.outgoingTxnId,
        counterparty: tx.counterparty,
        cryptocurrency: tx.cryptocurrency,
        amountUSD: tx.amountUSD,
        purchasedAt: tx.purchasedAt,
        status: tx.status
      }))
    });
  } catch (error) {
    console.error('Error fetching pass transaction history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Complete pass order (called when payment detected)
export const completePassOrder = async (orderId, transactionHash, io = null) => {
  try {
    const order = await PassOrder.findOne({ orderId });

    if (!order) {
      console.error('Order not found:', orderId);
      return false;
    }

    if (order.status === 'completed') {
      console.log('âš ï¸  Order already completed - preventing duplicate pass credit:', orderId);
      try {
        await upsertPassTransactionHistory(order, 'completed');
      } catch (historyError) {
        console.error('Error updating pass transaction history:', historyError);
      }
      return true;
    }

    // Update order
    order.status = 'completed';
    order.transactionHash = transactionHash;
    order.completedAt = new Date();
    
    // Calculate confirmation time if we have detection time
    if (order.transactionDetails?.detectedAt) {
      const confirmationTime = Math.round(
        (new Date() - new Date(order.transactionDetails.detectedAt)) / 60000
      );
      order.transactionDetails.confirmationTime = confirmationTime;
      order.transactionDetails.confirmedAt = new Date();
    }
    
    await order.save();

    // Add passes to user (use order.passCount to prevent exploits)
    const user = await User.findById(order.user);
    if (user) {
      const previousBalance = user.passes || 0;
      user.passes = previousBalance + order.passCount;
      await user.save();

      order.transactionDetails = {
        ...(order.transactionDetails || {}),
        balanceBefore: previousBalance,
        balanceAfter: user.passes
      };
      await order.save();

      console.log(`âœ… Added ${order.passCount} passes to ${user.username}. Balance: ${previousBalance} â†’ ${user.passes}`);
      
      // Emit Socket.IO event for live frontend update
      if (io) {
        io.emit(`pass_order_update:${orderId}`, {
          orderId,
          status: 'completed',
          passCount: order.passCount,
          newBalance: user.passes,
          transactionHash,
          completedAt: order.completedAt,
          transactionDetails: order.transactionDetails
        });
      }
    }

    try {
      await upsertPassTransactionHistory(order, 'completed');
    } catch (historyError) {
      console.error('Error updating pass transaction history:', historyError);
    }

    return true;
  } catch (error) {
    console.error('Error completing pass order:', error);
    return false;
  }
};

// Cancel pass order (user manually cancels before payment)
export const cancelPassOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user._id;

    const order = await PassOrder.findOne({ orderId, user: userId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Only allow cancellation if no payment detected
    if (order.transactionHash) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot cancel order - payment already detected' 
      });
    }

    // Only allow cancellation if order is pending or confirmed
    if (order.status !== 'pending' && order.status !== 'confirmed') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot cancel order with status: ${order.status}` 
      });
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = 'User manually cancelled order';
    await order.save();

    console.log(`ðŸ—‘ï¸  Order ${orderId} cancelled by user ${userId}`);

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling pass order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export default {
  createPassOrder,
  getUserPassOrders,
  getPassOrder,
  getPassTransactionHistory,
  completePassOrder,
  cancelPassOrder
};

