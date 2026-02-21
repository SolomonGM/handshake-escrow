import TradeTicket from '../models/TradeTicket.js';
import User from '../models/User.js';
import { ethers } from 'ethers';
import { BOT_WALLETS, calculateTotalAmount, EXCHANGE_RATES, ETH_RPC_CONFIG, ETH_NETWORK_MODE } from '../config/wallets.js';
import { scheduleTicketClosure } from '../services/ticketClosureService.js';
import { isStaffUser } from '../utils/staffUtils.js';

const ACTIVE_TICKET_LIMIT = 12;
const ACTIVE_TICKET_STATUSES = ['open', 'in-progress'];

const getEthProvider = () => {
  const config = ETH_RPC_CONFIG[ETH_NETWORK_MODE];
  if (!config?.rpcUrl) {
    return null;
  }
  return new ethers.JsonRpcProvider(config.rpcUrl);
};

const getEthWallet = () => {
  const privateKey = process.env.BOT_ETH_PRIVATE_KEY || process.env.ETH_BOT_PRIVATE_KEY;
  if (!privateKey) {
    return null;
  }
  const provider = getEthProvider();
  if (!provider) {
    return null;
  }
  return new ethers.Wallet(privateKey, provider);
};

const getAddressPrefixMatch = (rawValue, crypto) => {
  const patterns = {
    ethereum: /^(0x[a-fA-F0-9]{40})/,
    bitcoin: /^((?:bc1|tb1)[0-9a-z]{20,}|[13mn2][a-zA-Z0-9]{25,34})/,
    litecoin: /^((?:ltc1|tltc1)[0-9a-z]{20,}|[LM3mn2Q][a-zA-Z0-9]{25,34})/
  };
  const pattern = patterns[crypto];
  if (!pattern) {
    return null;
  }
  const match = rawValue.match(pattern);
  return match ? match[1] : null;
};

const getTicketPartyIds = (ticket) => {
  const ids = new Set();
  if (ticket?.creator) {
    ids.add(ticket.creator.toString());
  }
  (ticket?.participants || []).forEach((participant) => {
    if (participant?.status === 'accepted' && participant?.user) {
      ids.add(participant.user.toString());
    }
  });
  return Array.from(ids);
};

const getPrivacySelectionValue = (ticket, userId) => {
  if (!ticket?.privacySelections || !userId) {
    return null;
  }
  const key = userId.toString();
  if (ticket.privacySelections instanceof Map) {
    return ticket.privacySelections.get(key);
  }
  return ticket.privacySelections[key];
};

const hasAllPrivacySelections = (ticket) => {
  const partyIds = getTicketPartyIds(ticket);
  if (!partyIds.length) {
    return false;
  }
  return partyIds.every((partyId) => Boolean(getPrivacySelectionValue(ticket, partyId)));
};

const addStaffActionMessage = (ticket, { title, description, color = 'blue' }) => {
  ticket.messages.push({
    isBot: true,
    content: title,
    type: 'embed',
    embedData: {
      title,
      description,
      color,
      requiresAction: false
    },
    timestamp: new Date()
  });
};

const buildActiveTicketLimitQuery = (userId) => ({
  status: { $in: ACTIVE_TICKET_STATUSES },
  $or: [
    { creator: userId },
    {
      participants: {
        $elemMatch: {
          user: userId,
          status: 'accepted'
        }
      }
    }
  ]
});

const countUserActiveTickets = async (userId) => (
  TradeTicket.countDocuments(buildActiveTicketLimitQuery(userId))
);

const applyRescanTransaction = (ticket) => {
  ticket.rescanAttempts += 1;
  ticket.lastRescanTime = new Date();

  if (ticket.rescanAttempts > 3) {
    ticket.messages = ticket.messages.filter(msg =>
      msg.embedData?.actionType !== 'transaction-timeout'
    );

    ticket.messages.push({
      isBot: true,
      content: 'Maximum Attempts Reached',
      type: 'embed',
      embedData: {
        title: 'Maximum Attempts Reached',
        description: 'After 3 rescan attempts, we cannot proceed with automatic detection.\n\nPlease type <strong>/ping</strong> to contact staff for manual verification.',
        color: 'red',
        requiresAction: false
      },
      timestamp: new Date()
    });

    ticket.awaitingTransaction = false;
    ticket.transactionTimedOut = true;
    return { maxAttemptsReached: true };
  }

  ticket.messages = ticket.messages.filter(msg =>
    msg.embedData?.actionType !== 'transaction-timeout'
  );

  ticket.messages.push({
    isBot: true,
    content: 'Rescanning for Transaction',
    type: 'embed',
    embedData: {
      title: 'Rescanning for Transaction',
      description: `Attempt ${ticket.rescanAttempts} of 3. Scanning for payment...\n\nTime limit: ${ticket.rescanAttempts === 1 ? '10' : ticket.rescanAttempts === 2 ? '8' : '12'} minutes`,
      color: 'blue',
      requiresAction: false
    },
    timestamp: new Date()
  });

  ticket.transactionTimedOut = false;
  ticket.awaitingTransaction = true;
  ticket.transactionTimeoutAt = null;

  return { maxAttemptsReached: false };
};

const applyCancelTransaction = (ticket) => {
  ticket.messages = ticket.messages.filter(msg =>
    msg.embedData?.actionType !== 'transaction-timeout'
  );

  ticket.messages.push({
    isBot: true,
    content: 'Transaction Cancelled',
    type: 'embed',
    embedData: {
      title: 'Transaction Cancelled',
      description: 'Transaction monitoring has been cancelled.\n\nIf you need assistance, please type <strong>/ping</strong> to contact staff.',
      color: 'red',
      requiresAction: false
    },
    timestamp: new Date()
  });

  ticket.awaitingTransaction = false;
  ticket.transactionTimedOut = true;
};

const normalizeAttachmentsInput = (attachments, maxDataUrlLength) => {
  let list = attachments;

  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch (error) {
      const matches = list.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g);
      list = matches && matches.length ? matches : [list];
    }
  }

  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((attachment) => {
    const rawUrl = typeof attachment === 'string'
      ? attachment
      : (attachment?.url || attachment?.data || attachment?.dataUrl);

    if (typeof rawUrl !== 'string' || !rawUrl.startsWith('data:image/')) {
      return null;
    }

    if (maxDataUrlLength && rawUrl.length > maxDataUrlLength) {
      return null;
    }

    const size = Number(attachment?.size);
    const width = Number(attachment?.width);
    const height = Number(attachment?.height);

    return {
      url: rawUrl,
      name: attachment?.name || 'image',
      type: attachment?.type || 'image',
      size: Number.isFinite(size) ? size : undefined,
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined
    };
  }).filter(Boolean);
};

const buildPayoutDetails = (ticket) => {
  const exchangeRate = EXCHANGE_RATES[ticket.cryptocurrency] || 1;
  const dealAmount = Number(ticket.dealAmount ?? ticket.expectedAmount ?? 0);
  if (!Number.isFinite(dealAmount) || dealAmount <= 0) {
    throw new Error('Invalid deal amount for payout');
  }
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('Invalid exchange rate for payout');
  }
  const usedPass = ticket.feeDecision === 'with-pass' || Boolean(ticket.passUsedBy);
  const totalAmount = calculateTotalAmount(dealAmount, ticket.cryptocurrency, usedPass);
  const payoutUsd = usedPass ? totalAmount : dealAmount;
  if (!Number.isFinite(payoutUsd) || payoutUsd <= 0) {
    throw new Error('Invalid payout amount');
  }
  const payoutEth = (payoutUsd / exchangeRate).toFixed(8);

  return {
    payoutEth,
    payoutUsd
  };
};

const sendEthPayout = async (ticket, toAddress) => {
  const wallet = getEthWallet();
  if (!wallet) {
    throw new Error('Bot wallet private key not configured');
  }
  const provider = wallet.provider;
  if (!provider) {
    throw new Error('Ethereum provider not configured');
  }

  const { payoutEth, payoutUsd } = buildPayoutDetails(ticket);
  const value = ethers.parseEther(payoutEth);

  const feeData = await provider.getFeeData();
  const txRequest = {
    to: toAddress,
    value
  };

  if (feeData?.maxFeePerGas && feeData?.maxPriorityFeePerGas) {
    txRequest.maxFeePerGas = feeData.maxFeePerGas;
    txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData?.gasPrice) {
    txRequest.gasPrice = feeData.gasPrice;
  }

  try {
    txRequest.gasLimit = await wallet.estimateGas(txRequest);
  } catch (error) {
    txRequest.gasLimit = 21000n;
  }

  const tx = await wallet.sendTransaction(txRequest);

  return {
    txHash: tx.hash,
    payoutEth,
    payoutUsd
  };
};

const startPayoutConfirmationWatcher = ({ ticketId, txHash, receiverName }) => {
  const provider = getEthProvider();
  const config = ETH_RPC_CONFIG[ETH_NETWORK_MODE];
  const requiredConfirmations = config?.confirmationsRequired || 2;
  if (!provider) {
    return;
  }

  setImmediate(async () => {
    try {
      await provider.waitForTransaction(txHash, requiredConfirmations);
      const ticket = await TradeTicket.findOne({ ticketId });
      if (!ticket) {
        return;
      }

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'payout-confirming'
      );

      ticket.fundsReleased = true;
      ticket.transactionCompletedAt = ticket.transactionCompletedAt || new Date();
      ticket.status = 'awaiting-close';

      const hasCompleteMessage = ticket.messages.some(
        msg => msg.embedData?.title === 'Complete'
      );

      if (!hasCompleteMessage) {
        ticket.messages.push({
          isBot: true,
          content: 'Complete',
          type: 'embed',
          embedData: {
            title: 'Complete',
            description: `\u{1F389} @${receiverName || 'Receiver'} has received their funds.\n\n\u{2728} Thank you for using Handshake!`,
            color: 'blurple'
          },
          timestamp: new Date()
        });
      }

      const hasPrivacyPrompt = ticket.messages.some(
        msg => msg.embedData?.actionType === 'privacy-selection'
      );

      if (!hasPrivacyPrompt) {
        ticket.messages.push({
          isBot: true,
          content: 'Broadcast Privacy',
          type: 'embed',
          embedData: {
            title: 'Broadcast Privacy',
            description: 'Before we broadcast this completed trade, choose how your name appears on the public feed. You can choose <strong>Anonymous</strong> or <strong>Global</strong>.',
            color: 'blue',
            requiresAction: true,
            actionType: 'privacy-selection'
          },
          timestamp: new Date()
        });
        ticket.privacyPromptShown = true;
      }

      await ticket.save();
    } catch (error) {
      console.error('❌ Payout confirmation watcher error:', error);
    }
  });
};

// Create a new trade ticket
export const createTicket = async (req, res) => {
  try {
    const { cryptocurrency } = req.body;
    const userId = req.user._id;
    
    console.log('🎫 Creating ticket for user:', userId);
    console.log('📦 Request body:', req.body);
    console.log('💰 Cryptocurrency value:', cryptocurrency, 'Type:', typeof cryptocurrency);

    // Validate cryptocurrency parameter
    if (!cryptocurrency || cryptocurrency.trim() === '') {
      console.log('❌ Cryptocurrency validation failed');
      return res.status(400).json({
        success: false,
        message: 'Cryptocurrency is required'
      });
    }

    const activeTicketCount = await countUserActiveTickets(userId);
    if (activeTicketCount >= ACTIVE_TICKET_LIMIT) {
      return res.status(400).json({
        success: false,
        message: `Too many active tickets. You can only have ${ACTIVE_TICKET_LIMIT} active tickets at a time.`,
        code: 'ACTIVE_TICKET_LIMIT_REACHED',
        activeTicketLimit: ACTIVE_TICKET_LIMIT
      });
    }

    // Generate unique ticket ID
    const ticketId = `#${Math.floor(Math.random() * 9000000) + 1000000}`;

    // Validate and normalize cryptocurrency value
    const cryptoUpper = cryptocurrency ? cryptocurrency.toUpperCase() : 'CRYPTO';
    const cryptoCapitalized = cryptocurrency ? cryptocurrency.charAt(0).toUpperCase() + cryptocurrency.slice(1) : 'Crypto';

    // Create initial bot messages
    const initialMessages = [
      {
        isBot: true,
        content: `${cryptoUpper} Ticket Created Successfully!`,
        type: 'embed',
        embedData: {
          title: `${cryptoCapitalized} Ticket Created Successfully!`,
          description: 'Welcome to our automated cryptocurrency Middleman system! Your cryptocurrency will be stored securely for the duration of this deal. Please notify support for assistance.',
          color: 'green',
          footer: `Ticket ${ticketId}`
        }
      },
      {
        isBot: true,
        content: 'Security notification',
        type: 'embed',
        embedData: {
          title: 'Security Notification',
          description: 'Our bot and staff team will NEVER direct message you. Ensure all conversations related to the deal are done within this ticket. Failure to do so may put you at risk of being scammed.',
          color: 'red'
        }
      }
    ];

    const ticket = await TradeTicket.create({
      ticketId,
      creator: userId,
      cryptocurrency,
      messages: initialMessages,
      status: 'open'
    });

    console.log('✅ Ticket created:', ticketId, 'status:', ticket.status);

    // Populate creator info
    await ticket.populate('creator', 'username userId avatar');

    res.status(201).json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket',
      error: error.message
    });
  }
};

// Get ticket by ID
export const getTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;
    
    console.log('🔍 Looking for ticket:', ticketId);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar')
      .populate('messages.sender', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user has access to this ticket
    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user && p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );
    const isStaff = isStaffUser(req.user);

    if (!isCreator && !isParticipant && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket',
      error: error.message
    });
  }
};

// Add user to ticket
export const addUserToTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userIdentifier } = req.body; // Can be username or userId
    const requesterId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if requester is the creator
    if (ticket.creator._id.toString() !== requesterId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only ticket creator can add users'
      });
    }

    // Find user by userId (17-digit ID only)
    let targetUser;
    
    // Only accept 17-digit userId
    targetUser = await User.findOne({ userId: userIdentifier })
      .select('username userId avatar');

    if (!targetUser) {
      // Add error message to ticket
      ticket.messages.push({
        isBot: true,
        content: 'Invalid User ID',
        type: 'embed',
        embedData: {
          title: 'Invalid User ID',
          description: 'User not found. Please enter a valid 17-digit User ID. You can find a user\'s ID by clicking on their profile picture in the live chat.',
          color: 'red'
        }
      });
      await ticket.save();
      await ticket.populate('participants.user', 'username userId avatar');
      
      return res.status(200).json({
        success: false,
        message: 'User not found. Please use the 17-digit User ID.',
        error: 'invalid_user',
        ticket
      });
    }

    // Check if user is trying to add themselves
    if (targetUser._id.toString() === requesterId.toString()) {
      ticket.messages.push({
        isBot: true,
        content: 'Cannot Add Yourself',
        type: 'embed',
        embedData: {
          title: 'Cannot Add Yourself',
          description: 'You cannot add yourself to your own ticket. Please enter the User ID of the person you want to trade with.',
          color: 'red'
        }
      });
      await ticket.save();
      await ticket.populate('participants.user', 'username userId avatar');
      
      return res.status(200).json({
        success: false,
        message: 'You cannot add yourself to the ticket',
        error: 'self_add',
        ticket
      });
    }

    // Check if user is already in ticket
    const alreadyAdded = ticket.participants.some(
      p => p.user.toString() === targetUser._id.toString()
    );

    if (alreadyAdded) {
      return res.status(400).json({
        success: false,
        message: 'User already added to ticket',
        error: 'already_added'
      });
    }

    // Add user to participants
    ticket.participants.push({
      user: targetUser._id,
      status: 'pending'
    });

    // Add system message
    ticket.messages.push({
      isBot: true,
      content: 'Invitation Sent',
      type: 'embed',
      embedData: {
        title: 'Waiting for Response',
        description: `An invitation has been sent to @${targetUser.username} (ID: ${targetUser.userId}). Waiting for them to accept or decline the invitation.`,
        color: 'orange'
      }
    });

    await ticket.save();
    await ticket.populate('participants.user', 'username userId avatar');

    res.json({
      success: true,
      message: `Successfully added ${targetUser.username}`,
      ticket
    });
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add user',
      error: error.message
    });
  }
};

// Send message in ticket
export const sendMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { content = '', attachments = [] } = req.body;
    const userId = req.user._id;
    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    const MAX_ATTACHMENTS = 4;
    const MAX_DATA_URL_LENGTH = 6000000; // ~4.5MB base64 payload

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user has access
    const isCreator = ticket.creator.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user.toString() === userId.toString() && p.status === 'accepted'
    );
    const isStaff = isStaffUser(req.user);

    if (!isCreator && !isParticipant && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (isStaff && trimmedContent.startsWith('/staff')) {
      const parts = trimmedContent.split(' ').filter(Boolean);
      const staffCommand = (parts[1] || 'help').toLowerCase();

      const sendStaffHelp = async () => {
        const description = [
          '<strong>/staff rescan</strong> - Rescan for a transaction',
          '<strong>/staff cancel-transaction</strong> - Cancel transaction monitoring',
          '<strong>/staff close</strong> - Close this ticket (60s countdown)',
          '<strong>/staff cancel</strong> - Cancel this ticket immediately',
          '<strong>/staff dispute</strong> - Mark ticket as disputed',
          '<strong>/staff refund</strong> - Mark ticket as refunded'
        ].join('<br/>');
        addStaffActionMessage(ticket, {
          title: 'Staff Commands',
          description,
          color: 'blue'
        });
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      };

      if (staffCommand === 'help') {
        return sendStaffHelp();
      }

      if (staffCommand === 'rescan') {
        applyRescanTransaction(ticket);
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'cancel-transaction') {
        applyCancelTransaction(ticket);
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'close') {
        const alreadyClosed = ['completed', 'cancelled', 'refunded'].includes(ticket.status);
        if (alreadyClosed) {
          return res.status(400).json({
            success: false,
            message: 'Ticket is already closed.'
          });
        }

        const closeAt = new Date(Date.now() + 60 * 1000);
        ticket.status = 'closing';
        ticket.closeScheduledAt = closeAt;
        ticket.closeInitiatedBy = userId;

        const hasClosingMessage = ticket.messages.some(
          (msg) => msg.embedData?.actionType === 'ticket-closing'
        );
        if (!hasClosingMessage) {
          ticket.messages.push({
            isBot: true,
            content: 'Ticket Closing',
            type: 'embed',
            embedData: {
              title: 'Ticket Closing',
              description: 'Staff initiated closure. This ticket will close in 1 minute.',
              color: 'yellow',
              requiresAction: false,
              actionType: 'ticket-closing'
            },
            timestamp: new Date()
          });
        }

        await ticket.save();
        scheduleTicketClosure(ticket._id, ticket.closeScheduledAt);
        await ticket.populate('messages.sender', 'username userId avatar');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'cancel') {
        ticket.status = 'cancelled';
        ticket.closedAt = new Date();
        ticket.closedBy = userId;
        addStaffActionMessage(ticket, {
          title: 'Ticket Cancelled',
          description: 'A staff member cancelled this ticket.',
          color: 'red'
        });
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'dispute') {
        ticket.status = 'disputed';
        addStaffActionMessage(ticket, {
          title: 'Ticket Disputed',
          description: 'This ticket has been marked as disputed by staff.',
          color: 'orange'
        });
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      if (staffCommand === 'refund') {
        ticket.status = 'refunded';
        ticket.closedAt = new Date();
        ticket.closedBy = userId;
        addStaffActionMessage(ticket, {
          title: 'Ticket Refunded',
          description: 'This ticket has been marked as refunded by staff.',
          color: 'red'
        });
        await ticket.save();
        await ticket.populate('messages.sender', 'username userId avatar');
        return res.json({ success: true, message: ticket.messages[ticket.messages.length - 1] });
      }

      return res.status(400).json({
        success: false,
        message: 'Unknown staff command. Use /staff help for options.'
      });
    }

    const normalizedIncoming = normalizeAttachmentsInput(attachments, MAX_DATA_URL_LENGTH);

    if (!trimmedContent && normalizedIncoming.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content or image attachment is required'
      });
    }

    if (normalizedIncoming.length > MAX_ATTACHMENTS) {
      return res.status(400).json({
        success: false,
        message: `You can send up to ${MAX_ATTACHMENTS} images at once`
      });
    }

    const sanitizedAttachments = normalizedIncoming;

    if (!trimmedContent && sanitizedAttachments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Only image attachments are supported'
      });
    }

    // Normalize any existing attachments on the ticket to avoid casting errors
    let didNormalizeExisting = false;
    if (Array.isArray(ticket.messages)) {
      ticket.messages.forEach((message) => {
        if (message && message.attachments !== undefined) {
          const normalizedExisting = normalizeAttachmentsInput(message.attachments, MAX_DATA_URL_LENGTH);
          message.attachments = normalizedExisting;
          didNormalizeExisting = true;
        }
      });
    }

    ticket.messages.push({
      sender: userId,
      content: trimmedContent,
      type: 'text',
      attachments: sanitizedAttachments
    });

    if (didNormalizeExisting) {
      ticket.markModified('messages');
    }

    await ticket.save();
    await ticket.populate('messages.sender', 'username userId avatar');

    res.json({
      success: true,
      message: ticket.messages[ticket.messages.length - 1]
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Get user's tickets
export const getUserTickets = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('📋 Fetching tickets for user:', userId);

    // Get tickets where user is creator or participant
    const tickets = await TradeTicket.find({
      $or: [
        { creator: userId },
        { 'participants.user': userId }
      ]
    })
    .populate('creator', 'username userId avatar')
    .populate('participants.user', 'username userId avatar')
    .sort({ createdAt: -1 });

    console.log(`📦 Found ${tickets.length} total tickets`);

    // Separate into different categories
    
    // Invitations - tickets where user is invited but hasn't responded
    const invitations = tickets.filter(t => {
      const participant = t.participants.find(p => p.user && p.user._id.toString() === userId.toString());
      return participant && participant.status === 'pending';
    });
    console.log(`📨 Invitations: ${invitations.length}`);
    
    // Active - tickets that are open or in-progress where user is creator or accepted participant
    const activeTickets = tickets.filter(t => {
      const isCreator = t.creator._id.toString() === userId.toString();
      const participant = t.participants.find(p => p.user && p.user._id.toString() === userId.toString());
      const isAcceptedParticipant = participant && participant.status === 'accepted';
      // Show tickets that are open OR in-progress AND user is either creator or accepted participant
      const isActive = (isCreator || isAcceptedParticipant) && (
        t.status === 'open' ||
        t.status === 'in-progress' ||
        t.status === 'awaiting-close' ||
        t.status === 'closing'
      );
      if (isActive) {
        console.log(`🔥 Active ticket found: ${t.ticketId}, status: ${t.status}, isCreator: ${isCreator}`);
      }
      return isActive;
    });
    console.log(`🔥 Active Tickets: ${activeTickets.length}`);
    
    // My Tickets - ONLY finished tickets (completed, cancelled, refunded) where user is creator OR accepted participant
    const myTickets = tickets.filter(t => {
      const isCreator = t.creator._id.toString() === userId.toString();
      const participant = t.participants.find(p => p.user && p.user._id.toString() === userId.toString());
      const isAcceptedParticipant = participant && participant.status === 'accepted';
      const isFinished = ['completed', 'cancelled', 'refunded'].includes(t.status);
      return (isCreator || isAcceptedParticipant) && isFinished;
    });
    console.log(`✅ My Tickets (finished): ${myTickets.length}`);

    res.json({
      success: true,
      myTickets,
      invitations,
      activeTickets
    });
  } catch (error) {
    console.error('Get user tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error.message
    });
  }
};

// Respond to ticket invitation
export const respondToInvitation = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { action } = req.body; // 'accept' or 'decline'
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const participant = ticket.participants.find(
      p => p.user.toString() === userId.toString()
    );

    if (!participant) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    // Get user info
    const user = await User.findById(userId).select('username userId');

    // Add embed notification to ticket
    if (action === 'accept') {
      const activeTicketCount = await countUserActiveTickets(userId);
      if (activeTicketCount >= ACTIVE_TICKET_LIMIT) {
        return res.status(400).json({
          success: false,
          message: `Too many active tickets. You can only have ${ACTIVE_TICKET_LIMIT} active tickets at a time.`,
          code: 'ACTIVE_TICKET_LIMIT_REACHED',
          activeTicketLimit: ACTIVE_TICKET_LIMIT
        });
      }

      participant.status = 'accepted';
      
      // Only add acceptance message if none exists (check for any user added message)
      const hasAcceptanceMessage = ticket.messages.some(msg => 
        msg.embedData?.title?.includes('has been added to the ticket')
      );
      
      if (!hasAcceptanceMessage) {
        ticket.messages.push({
          isBot: true,
          content: `User Accepted`,
          type: 'embed',
          embedData: {
            title: `@${user.username} has been added to the ticket`,
            description: 'You may now proceed with your deal.',
            color: 'green'
          },
          timestamp: new Date()
        });
      }
      
      // Update ticket status to in-progress
      if (ticket.status === 'open') {
        ticket.status = 'in-progress';
      }

      // Only add role selection prompt if it doesn't exist
      const hasRoleSelectionPrompt = ticket.messages.some(msg => 
        msg.embedData?.actionType === 'role-selection'
      );
      
      if (!hasRoleSelectionPrompt) {
        ticket.messages.push({
          isBot: true,
          content: 'Select Your Role',
          type: 'embed',
          embedData: {
            title: 'Select Your Role',
            description: 'Please select whether you are the <strong>Sender</strong> (sending cryptocurrency) or the <strong>Receiver</strong> (receiving cryptocurrency).',
            color: 'blue',
            requiresAction: true,
            actionType: 'role-selection'
          },
          timestamp: new Date()
        });
      }

      ticket.roleSelectionShown = true;

      await ticket.save();
    } else {
      // When declined, remove the participant from the ticket instead of cancelling it
      ticket.participants = ticket.participants.filter(
        p => p.user.toString() !== userId.toString()
      );
      
      ticket.messages.push({
        isBot: true,
        content: 'Invitation Declined',
        type: 'embed',
        embedData: {
          title: `@${user.username} has declined the invitation`,
          description: 'The user has been removed from this ticket. You can invite another user if needed.',
          color: 'red'
        },
        timestamp: new Date()
      });
      
      // Ticket remains active for creator to invite someone else
      await ticket.save();
    }

    res.json({
      success: true,
      message: `Invitation ${action}ed successfully`
    });
  } catch (error) {
    console.error('Respond to invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to invitation',
      error: error.message
    });
  }
};

// Trigger user prompt after 10 seconds (only once)
export const triggerUserPrompt = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Only creator can trigger prompt
    if (ticket.creator.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only ticket creator can trigger prompt'
      });
    }

    // Check if prompt already shown
    if (ticket.hasShownPrompt) {
      return res.json({
        success: true,
        alreadyShown: true,
        message: 'Prompt already shown'
      });
    }

    // Add prompt message to database
    ticket.messages.push({
      isBot: true,
      content: 'Add User to Ticket',
      type: 'embed',
      embedData: {
        title: 'Add User by pasting User ID in the chat',
        description: 'To proceed with this deal, add the other party to this ticket. Click on their profile picture in the live chat to view and copy their 17-digit User ID, then paste it in the message box below.',
        color: 'green'
      },
      timestamp: new Date()
    });

    ticket.hasShownPrompt = true;
    ticket.promptShownAt = new Date();

    await ticket.save();
    
    // Populate the ticket before sending response
    await ticket.populate('creator', 'username userId avatar');
    await ticket.populate('participants.user', 'username userId avatar');

    res.json({
      success: true,
      message: 'Prompt triggered',
      newMessage: ticket.messages[ticket.messages.length - 1],
      ticket
    });
  } catch (error) {
    console.error('Trigger prompt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger prompt',
      error: error.message
    });
  }
};

// Close ticket
export const closeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user has access to this ticket (creator or accepted participant)
    const isCreator = ticket.creator.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to close this ticket'
      });
    }

    const completionReady = ticket.fundsReleased || ['awaiting-close', 'closing', 'completed'].includes(ticket.status);

    if (completionReady) {
      if (ticket.status === 'completed') {
        await ticket.populate('creator', 'username userId avatar');
        await ticket.populate('participants.user', 'username userId avatar');
        return res.json({
          success: true,
          message: 'Ticket already closed',
          ticket
        });
      }

      if (!hasAllPrivacySelections(ticket)) {
        return res.status(400).json({
          success: false,
          message: 'Both users must select privacy options before closing the ticket'
        });
      }

      if (!ticket.closeScheduledAt || ticket.status !== 'closing') {
        ticket.status = 'closing';
        ticket.closeScheduledAt = new Date(Date.now() + 60 * 1000);
        ticket.closeInitiatedBy = userId;

        const hasClosingMessage = ticket.messages.some(
          msg => msg.embedData?.actionType === 'ticket-closing'
        );

        if (!hasClosingMessage) {
          ticket.messages.push({
            isBot: true,
            content: 'Closing Ticket',
            type: 'embed',
            embedData: {
              title: 'Closing Ticket',
              description: 'This ticket will close in 1 minute. You will be redirected to the Trade Hub when it completes.',
              color: 'orange',
              requiresAction: false,
              actionType: 'ticket-closing'
            },
            timestamp: new Date()
          });
        }

        await ticket.save();
      } else {
        await ticket.save();
      }

      scheduleTicketClosure(ticket._id, ticket.closeScheduledAt);

      await ticket.populate('creator', 'username userId avatar');
      await ticket.populate('participants.user', 'username userId avatar');

      return res.json({
        success: true,
        message: 'Ticket will close in 1 minute',
        ticket
      });
    }

    ticket.status = 'cancelled';
    ticket.closedAt = new Date();
    ticket.closedBy = userId;

    await ticket.save();

    res.json({
      success: true,
      message: 'Ticket closed successfully',
      ticket
    });
  } catch (error) {
    console.error('Close ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close ticket',
      error: error.message
    });
  }
};

// Select broadcast privacy (anonymous or global)
export const selectPrivacy = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { preference } = req.body;
    const userId = req.user._id;

    if (!['anonymous', 'global'].includes(preference)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid privacy option. Must be anonymous or global.'
      });
    }

    const ticket = await TradeTicket.findOne({ ticketId });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user has access to this ticket (creator or accepted participant)
    const isCreator = ticket.creator.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update privacy for this ticket'
      });
    }

    if (!ticket.fundsReleased && !['awaiting-close', 'closing', 'completed'].includes(ticket.status)) {
      return res.status(400).json({
        success: false,
        message: 'Ticket is not ready for privacy selection'
      });
    }

    if (!ticket.privacySelections) {
      ticket.privacySelections = new Map();
    }

    if (ticket.privacySelections instanceof Map) {
      ticket.privacySelections.set(userId.toString(), preference);
    } else {
      ticket.privacySelections = {
        ...(ticket.privacySelections || {}),
        [userId.toString()]: preference
      };
    }

    await ticket.save();

    await ticket.populate('creator', 'username userId avatar');
    await ticket.populate('participants.user', 'username userId avatar');

    res.json({
      success: true,
      message: 'Privacy selection saved',
      ticket,
      allSelected: hasAllPrivacySelections(ticket)
    });
  } catch (error) {
    console.error('Select privacy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update privacy selection',
      error: error.message
    });
  }
};

// Select role (sender or receiver)
export const selectRole = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { role } = req.body; // 'sender' or 'receiver'
    const userId = req.user._id;

    console.log(`\n🎯 SELECT ROLE REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Requested Role: ${role}`);

    if (!['sender', 'receiver'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be sender or receiver'
      });
    }

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();
    
    // Find THIS user's participant entry (if they're a participant)
    const thisUserParticipant = ticket.participants.find(
      p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );
    
    // Find the OTHER user's participant entry (the one who is NOT the current user)
    const otherParticipant = ticket.participants.find(
      p => p.user._id.toString() !== userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !thisUserParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get user info
    const user = await User.findById(userId).select('username');
    const currentUserRole = isCreator ? ticket.creatorRole : thisUserParticipant?.role;
    const otherUserRole = isCreator ? otherParticipant?.role : ticket.creatorRole;
    
    console.log(`📊 CURRENT STATE:`);
    console.log(`   This User (${user.username}): ${currentUserRole || 'null'}`);
    console.log(`   Other User: ${otherUserRole || 'null'}`);
    console.log(`   Wants to select: ${role}`);

    // Check if other user has already selected this role
    if (otherUserRole && otherUserRole === role) {
      console.log(`❌ Cannot select ${role} - already taken by other user`);
      return res.status(400).json({
        success: false,
        message: `The ${role} role has already been selected by the other user. Please select ${role === 'sender' ? 'receiver' : 'sender'}.`,
        error: 'role_taken'
      });
    }

    // If selecting same role they already have, just return current state (no changes needed)
    if (currentUserRole === role) {
      console.log(`✅ User already has ${role} selected - no changes needed`);
      return res.json({
        success: true,
        message: 'Role already selected',
        ticket
      });
    }

    // Update this user's role selection (switching or first-time selection)
    if (isCreator) {
      ticket.creatorRole = role;
    } else {
      // For subdocument modification, we need to explicitly mark as modified
      const participantIndex = ticket.participants.findIndex(
        p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
      );
      if (participantIndex !== -1) {
        ticket.participants[participantIndex].role = role;
        ticket.markModified('participants');
      }
    }

    console.log(`✅ ${user.username} role updated to: ${role}`);

    // Remove this user's previous "selected their role" message if it exists
    const messageCountBefore = ticket.messages.length;
    ticket.messages = ticket.messages.filter(msg => 
      !(msg.embedData?.title?.includes('selected their role') &&
        msg.embedData?.title?.includes(`@${user.username}`))
    );
    
    if (messageCountBefore !== ticket.messages.length) {
      console.log(`🧹 Removed previous role selection message for ${user.username}`);
    }

    // Also remove any old confirmation prompts (user switched roles, so old confirmation is invalid)
    ticket.messages = ticket.messages.filter(msg => 
      !(msg.embedData?.actionType === 'role-confirmation')
    );

    // Add this user's new role selection message
    ticket.messages.push({
      isBot: true,
      content: 'Role Selected',
      type: 'embed',
      embedData: {
        title: `@${user.username} selected their role`,
        description: `@${user.username} will be the <strong>${role}</strong>. Waiting for the other user to select their role.`,
        color: 'green'
      },
      timestamp: new Date()
    });
    console.log(`💬 Added "@${user.username} selected their role" message`);

    // Check if BOTH users have now selected roles AND they're DIFFERENT
    const finalCreatorRole = isCreator ? role : ticket.creatorRole;
    const finalParticipantRole = isCreator ? otherParticipant?.role : role;
    
    console.log(`🔍 Final Role Check:`);
    console.log(`   Creator role: ${finalCreatorRole}`);
    console.log(`   Participant role: ${finalParticipantRole}`);

    if (finalCreatorRole && finalParticipantRole && finalCreatorRole !== finalParticipantRole) {
      console.log(`🎉 BOTH USERS SELECTED DIFFERENT ROLES - Adding confirmation prompt`);
      
      // Remove the "Select Your Role" prompt (no longer needed)
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'role-selection')
      );

      const creatorUser = ticket.creator;
      // Use the accepted participant (the "other user" if creator is making selection, or thisUserParticipant if participant is making selection)
      const participantUser = isCreator ? otherParticipant.user : thisUserParticipant.user;
      
      const senderUser = finalCreatorRole === 'sender' ? creatorUser : participantUser;
      const receiverUser = finalCreatorRole === 'receiver' ? creatorUser : participantUser;

      // Add confirmation prompt
      ticket.messages.push({
        isBot: true,
        content: 'Role Confirmation',
        type: 'embed',
        embedData: {
          title: 'Confirm Trade Roles',
          description: `<strong>Sender:</strong> @${senderUser.username} (will send ${ticket.cryptocurrency})\n<strong>Receiver:</strong> @${receiverUser.username} (will receive ${ticket.cryptocurrency})\n\nPlease confirm if this is correct.`,
          color: 'blue',
          requiresAction: true,
          actionType: 'role-confirmation'
        },
        timestamp: new Date()
      });
      console.log(`✅ Confirmation prompt added`);
    } else {
      console.log(`⏳ Waiting for other user to select (or both to select different roles)`);
    }

    // Save ticket
    await ticket.save();
    
    // Re-populate to ensure fresh data
    await ticket.populate('creator', 'username userId avatar');
    await ticket.populate('participants.user', 'username userId avatar');
    
    console.log(`💾 Ticket saved - ${ticket.messages.length} messages total\n`);

    res.json({
      success: true,
      message: 'Role selected successfully',
      ticket
    });
  } catch (error) {
    console.error('❌ Select role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to select role',
      error: error.message
    });
  }
};

// Confirm or reject role selection
export const confirmRoles = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed } = req.body; // true or false
    const userId = req.user._id;

    console.log(`\n🎯 CONFIRM ROLES REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Confirmed: ${confirmed}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();

    const acceptedParticipants = ticket.participants.filter(
      p => p.user && p.status === 'accepted'
    );

    // Find THIS user's participant entry
    const thisUserParticipant = acceptedParticipants.find(
      p => p.user._id.toString() === userId.toString()
    );

    if (!isCreator && !thisUserParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId).select('username');

    if (confirmed) {
      const alreadyConfirmed = ticket.roleConfirmations.get(userId.toString()) === true;
      if (alreadyConfirmed) {
        return res.json({
          success: true,
          message: 'Role already confirmed',
          ticket
        });
      }

      // Mark user as confirmed
      ticket.roleConfirmations.set(userId.toString(), true);
      console.log(`✅ User ${user.username} confirmed roles`);

      // Check if both users confirmed (works regardless of who confirms first)
      const creatorId = ticket.creator._id.toString();
      const participantIds = acceptedParticipants.map(p => p.user._id.toString());
      const creatorConfirmed = ticket.roleConfirmations.get(creatorId);
      const participantConfirmed = participantIds.length > 0
        ? participantIds.every(id => ticket.roleConfirmations.get(id) === true)
        : false;
      
      console.log(`📊 Confirmation status:`);
      console.log(`   Creator confirmed: ${creatorConfirmed}`);
      console.log(`   Participant confirmed: ${participantConfirmed}`);

      if (creatorConfirmed && participantConfirmed) {
        // BOTH CONFIRMED - Finalize roles and save to database
        ticket.rolesConfirmed = true;
        console.log(`🎉 BOTH USERS CONFIRMED! Finalizing roles in database...`);
        console.log(`   Sender: ${ticket.creatorRole === 'sender' ? 'Creator' : 'Participant'}`);
        console.log(`   Receiver: ${ticket.creatorRole === 'receiver' ? 'Creator' : 'Participant'}`);

        // Remove ALL role-related prompts including confirmations
        const messageCountBefore = ticket.messages.length;
        ticket.messages = ticket.messages.filter(msg => 
          !(msg.embedData?.actionType === 'role-confirmation' ||
            msg.embedData?.title?.includes('confirmed their role'))
        );
        console.log(`🧹 Cleaned up ${messageCountBefore - ticket.messages.length} confirmation messages`);

        // Add final success message
        const creatorUser = ticket.creator;
        const participantUser = acceptedParticipants[0]?.user;
        
        const senderUser = ticket.creatorRole === 'sender' ? creatorUser : participantUser;
        const receiverUser = ticket.creatorRole === 'receiver' ? creatorUser : participantUser;

        ticket.messages.push({
          isBot: true,
          content: 'Roles Confirmed',
          type: 'embed',
          embedData: {
            title: 'Trade Roles Confirmed!',
            description: `<strong>Sender:</strong> @${senderUser.username}\n<strong>Receiver:</strong> @${receiverUser.username}\n\nYou may now proceed with your deal.`,
            color: 'green'
          },
          timestamp: new Date()
        });

        await ticket.save();
        console.log(`💾 ✅ ROLES FINALIZED AND SAVED TO DATABASE`);
        console.log(`   Ticket ${ticket.ticketId} - Roles are now permanent\n`);

        // Schedule amount prompt to show after 3-5 seconds
        const delay = 3000 + Math.random() * 2000; // 3-5 seconds
        setTimeout(async () => {
          try {
            const updatedTicket = await TradeTicket.findOne({ ticketId })
              .populate('creator', 'username userId avatar')
              .populate('participants.user', 'username userId avatar');
            
            if (updatedTicket && updatedTicket.rolesConfirmed && !updatedTicket.amountPromptShown) {
              const senderIsCreator = updatedTicket.creatorRole === 'sender';
              const senderUser = senderIsCreator ? updatedTicket.creator : updatedTicket.participants.find(p => p.status === 'accepted')?.user;
              
              updatedTicket.messages.push({
                isBot: true,
                content: 'Enter Deal Amount',
                type: 'embed',
                embedData: {
                  title: 'Enter Deal Amount',
                  description: `@${senderUser.username} (Sender), please type the amount you will be sending to the Handshake BOT.\n\nExample: 100, $100, or 100.00`,
                  color: 'blue',
                  requiresAction: true,
                  actionType: 'amount-entry'
                },
                timestamp: new Date()
              });
              
              updatedTicket.amountPromptShown = true;
              await updatedTicket.save();
              console.log(`💰 Amount prompt shown for ticket ${ticketId}`);
            }
          } catch (error) {
            console.error('Error showing amount prompt:', error);
          }
        }, delay);

        res.json({
          success: true,
          message: 'Roles confirmed! Ready to proceed.',
          ticket
        });
      } else {
        // Waiting for other user to confirm
        console.log(`⏳ Waiting for other user to confirm...`);
        
        // Remove previous "confirmed their role" messages to avoid spam
        ticket.messages = ticket.messages.filter(msg => 
          !msg.embedData?.title?.includes('confirmed their role')
        );
        
        ticket.messages.push({
          isBot: true,
          content: 'Confirmation Received',
          type: 'embed',
          embedData: {
            title: `@${user.username} confirmed their role`,
            description: 'Waiting for the other user to confirm...',
            color: 'blue'
          },
          timestamp: new Date()
        });

        await ticket.save();
        console.log(`💾 Saved confirmation status (waiting for other user)\n`);

        res.json({
          success: true,
          message: 'Waiting for other user to confirm',
          ticket
        });
      }
    } else {
      // REJECTED - Reset everything and start over
      console.log(`❌ User ${user.username} rejected roles - RESETTING EVERYTHING`);
      
      // Reset roles completely
      ticket.creatorRole = null;
      // Reset ALL participant roles (in case there are multiple)
      ticket.participants.forEach(p => {
        if (p.status === 'accepted') {
          p.role = null;
        }
      });
      ticket.markModified('participants');
      ticket.roleConfirmations = new Map();
      ticket.rolesConfirmed = false;

      console.log(`🔄 All roles cleared`);

      // Remove ALL role-related messages (clean slate)
      const messageCountBefore = ticket.messages.length;
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.title?.includes('Select Your Role') || 
          msg.embedData?.title?.includes('selected their role') ||
          msg.embedData?.title?.includes('Confirm Trade Roles') ||
          msg.embedData?.title?.includes('confirmed their role') ||
          msg.embedData?.title?.includes('Role Already Selected') ||
          msg.embedData?.actionType === 'role-confirmation' ||
          msg.embedData?.actionType === 'role-selection')
      );
      console.log(`🧹 Deleted ${messageCountBefore - ticket.messages.length} role-related messages`);

      // Add rejection message
      ticket.messages.push({
        isBot: true,
        content: 'Roles Rejected',
        type: 'embed',
        embedData: {
          title: 'Role Selection Restarted',
          description: `@${user.username} indicated the roles were incorrect. Please select your roles again.`,
          color: 'red'
        },
        timestamp: new Date()
      });

      // Add fresh role selection prompt
      ticket.messages.push({
        isBot: true,
        content: 'Select Your Role',
        type: 'embed',
        embedData: {
          title: 'Select Your Role',
          description: 'Please select whether you are the <strong>Sender</strong> (sending cryptocurrency) or the <strong>Receiver</strong> (receiving cryptocurrency).',
          color: 'blue',
          requiresAction: true,
          actionType: 'role-selection'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Ticket reset complete - starting fresh\n`);

      res.json({
        success: true,
        message: 'Roles reset. Please select again.',
        ticket
      });
    }
  } catch (error) {
    console.error('❌ Confirm roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm roles',
      error: error.message
    });
  }
};

// Trigger role selection prompt
export const triggerRoleSelection = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user has access
    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if role selection should be shown
    if (ticket.status === 'in-progress' && 
        ticket.roleSelectionTriggeredAt && 
        !ticket.roleSelectionShown &&
        !ticket.rolesConfirmed) {
      
      console.log('🎯 Adding role selection prompt to ticket:', ticketId);
      
      // Add role selection prompt
      ticket.messages.push({
        isBot: true,
        content: 'Select Your Role',
        type: 'embed',
        embedData: {
          title: 'Select Your Role',
          description: 'Please select whether you are the <strong>Sender</strong> (sending cryptocurrency) or the <strong>Receiver</strong> (receiving cryptocurrency).',
          color: 'blue',
          requiresAction: true,
          actionType: 'role-selection'
        },
        timestamp: new Date()
      });

      ticket.roleSelectionShown = true;
      await ticket.save();

      console.log('✅ Role selection prompt added, requiresAction:', true, 'actionType:', 'role-selection');

      res.json({
        success: true,
        message: 'Role selection prompt added',
        newMessage: ticket.messages[ticket.messages.length - 1],
        ticket
      });
    } else {
      res.json({
        success: false,
        message: 'Role selection not needed'
      });
    }
  } catch (error) {
    console.error('Trigger role selection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger role selection',
      error: error.message
    });
  }
};

// Detect and process amount from sender
export const detectAmount = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    console.log(`\n💰 DETECT AMOUNT REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Message: ${message}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if roles are confirmed but amount not yet confirmed
    if (!ticket.rolesConfirmed || ticket.dealAmountConfirmed) {
      return res.json({
        success: false,
        message: 'Not in amount entry phase'
      });
    }

    // Determine who is the sender
    const senderIsCreator = ticket.creatorRole === 'sender';
    const senderId = senderIsCreator ? ticket.creator._id.toString() : ticket.participants.find(p => p.status === 'accepted')?.user._id.toString();
    
    // Check if this message is from the sender
    if (userId.toString() !== senderId) {
      console.log(`⏭️ Ignoring message - not from sender`);
      return res.json({
        success: false,
        message: 'Only sender can enter amount'
      });
    }

    // Extract amount from message using regex
    // Matches: 100, $100, 100.00, $100.00, etc.
    const amountRegex = /\$?\s*(\d+(?:[,]\d{3})*(?:\.\d{1,2})?)/;
    const match = message.match(amountRegex);

    if (!match) {
      console.log(`❌ No amount detected in message`);
      return res.json({
        success: false,
        message: 'No amount detected'
      });
    }

    // Parse the amount (remove commas)
    const amountStr = match[1].replace(/,/g, '');
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
      console.log(`❌ Invalid amount: ${amountStr}`);
      return res.json({
        success: false,
        message: 'Invalid amount'
      });
    }

    console.log(`✅ Amount detected: $${amount.toFixed(2)}`);

    // Update the amount entry prompt to orange
    const amountPromptIndex = ticket.messages.findIndex(msg => 
      msg.embedData?.actionType === 'amount-entry'
    );
    
    if (amountPromptIndex !== -1) {
      ticket.messages[amountPromptIndex].embedData.color = 'orange';
      ticket.messages[amountPromptIndex].embedData.description += `\n\n✅ Amount detected: **$${amount.toFixed(2)} USD**`;
    }

    // Remove any previous amount confirmation prompts
    ticket.messages = ticket.messages.filter(msg => 
      msg.embedData?.actionType !== 'amount-confirmation'
    );

    // Reset confirmations for new amount
    ticket.amountConfirmations = new Map();
    ticket.dealAmountConfirmed = false;
    ticket.markModified('amountConfirmations');

    // Add confirmation prompt
    ticket.messages.push({
      isBot: true,
      content: 'Confirm Amount',
      type: 'embed',
      embedData: {
        title: 'Confirm Deal Amount',
        description: `The sender will send <strong>$${amount.toFixed(2)} USD</strong> worth of ${ticket.cryptocurrency}.\n\nPlease confirm if this is the correct amount.`,
        color: 'blue',
        requiresAction: true,
        actionType: 'amount-confirmation'
      },
      timestamp: new Date()
    });

    // Store the amount temporarily (not confirmed yet)
    ticket.dealAmount = amount;
    ticket.markModified('messages');
    await ticket.save();

    console.log(`💾 Amount saved temporarily: $${amount.toFixed(2)}\n`);

    res.json({
      success: true,
      message: 'Amount detected and confirmation requested',
      amount: amount,
      ticket
    });
  } catch (error) {
    console.error('❌ Detect amount error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to detect amount',
      error: error.message
    });
  }
};

// Confirm deal amount
export const confirmAmount = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed } = req.body;
    const userId = req.user._id;

    console.log(`\n💰 CONFIRM AMOUNT REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Confirmed: ${confirmed}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();

    const acceptedParticipants = ticket.participants.filter(
      p => p.user && p.status === 'accepted'
    );

    const thisUserParticipant = acceptedParticipants.find(
      p => p.user._id.toString() === userId.toString()
    );

    if (!isCreator && !thisUserParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId).select('username');

    if (confirmed) {
      if (ticket.dealAmountConfirmed) {
        return res.json({
          success: true,
          message: 'Amount already confirmed',
          ticket
        });
      }

      const alreadyConfirmed = ticket.amountConfirmations.get(userId.toString()) === true;
      if (alreadyConfirmed) {
        return res.json({
          success: true,
          message: 'Amount already confirmed',
          ticket
        });
      }

      // Mark user as confirmed
      ticket.amountConfirmations.set(userId.toString(), true);
      console.log(`✅ User ${user.username} confirmed amount`);

      // Check if both users confirmed
      const creatorConfirmed = ticket.amountConfirmations.get(ticket.creator._id.toString());
      const participantIds = acceptedParticipants.map(p => p.user._id.toString());
      const participantConfirmed = participantIds.length > 0
        ? participantIds.every(id => ticket.amountConfirmations.get(id) === true)
        : false;
      
      console.log(`📊 Amount confirmation status:`);
      console.log(`   Creator confirmed: ${creatorConfirmed}`);
      console.log(`   Participant confirmed: ${participantConfirmed}`);

      if (creatorConfirmed && participantConfirmed) {
        // BOTH CONFIRMED
        ticket.dealAmountConfirmed = true;
        console.log(`🎉 BOTH USERS CONFIRMED AMOUNT!`);

        // Remove ALL amount-related prompts including confirmations
        const messageCountBefore = ticket.messages.length;
        ticket.messages = ticket.messages.filter(msg => 
          !(msg.embedData?.actionType === 'amount-entry' ||
            msg.embedData?.actionType === 'amount-confirmation' ||
            msg.embedData?.title?.includes('confirmed the amount'))
        );
        console.log(`🧹 Cleaned up ${messageCountBefore - ticket.messages.length} amount messages`);

        // Add final success message
        ticket.addUniqueMessage({
          isBot: true,
          content: 'Amount Confirmed',
          type: 'embed',
          embedData: {
            title: 'Deal Amount Confirmed!',
            description: `The deal amount of <strong>$${ticket.dealAmount.toFixed(2)} USD</strong> has been confirmed.\n\nYou may now proceed with the transaction.`,
            color: 'green'
          },
          timestamp: new Date()
        });

        // Schedule fee prompt to show after 2 seconds (only once)
        setTimeout(async () => {
          try {
            const feeTicket = await TradeTicket.findOne({ ticketId })
              .populate('creator', 'username userId avatar')
              .populate('participants.user', 'username userId avatar');
            
            if (feeTicket && feeTicket.dealAmountConfirmed && !feeTicket.feesConfirmed) {
              const hasFeePrompt = feeTicket.messages.some(msg => msg.embedData?.actionType === 'fee-selection');
              if (hasFeePrompt) {
                return;
              }

              feeTicket.messages.push({
                isBot: true,
                content: 'Fee Options',
                type: 'embed',
                embedData: {
                  title: 'Use a Pass?',
                  description: `You can use a <strong>Pass</strong> to skip transaction fees, or proceed with our standard fees.\n\n<strong>Fee Structure:</strong>\n• Deals $250+: 1%\n• Deals under $250: $2\n• Deals under $50: $0.50\n• Deals under $10: FREE\n• USDT & USDC: $1 surcharge\n\nPasses allow you to skip these fees entirely.`,
                  color: 'blue',
                  requiresAction: true,
                  actionType: 'fee-selection'
                },
                timestamp: new Date()
              });
              
              await feeTicket.save();
              console.log(`💳 Fee prompt shown for ticket ${ticketId}`);
            }
          } catch (error) {
            console.error('Error showing fee prompt:', error);
          }
        }, 2000);

        await ticket.save();
        console.log(`💾 ✅ AMOUNT FINALIZED AND SAVED TO DATABASE`);
        console.log(`   Ticket ${ticket.ticketId} - Amount: $${ticket.dealAmount.toFixed(2)}\n`);

        res.json({
          success: true,
          message: 'Amount confirmed!',
          ticket
        });
      } else {
        // Waiting for other user to confirm
        console.log(`⏳ Waiting for other user to confirm amount...`);
        
        // Remove previous "confirmed the amount" messages to avoid spam
        ticket.messages = ticket.messages.filter(msg => 
          !msg.embedData?.title?.includes('confirmed the amount')
        );
        
        ticket.messages.push({
          isBot: true,
          content: 'Confirmation Received',
          type: 'embed',
          embedData: {
            title: `@${user.username} confirmed the amount`,
            description: 'Waiting for the other user to confirm...',
            color: 'blue'
          },
          timestamp: new Date()
        });

        await ticket.save();
        console.log(`💾 Saved amount confirmation status (waiting for other user)\n`);

        res.json({
          success: true,
          message: 'Waiting for other user to confirm',
          ticket
        });
      }
    } else {
      // REJECTED - Reset and re-prompt
      console.log(`❌ User ${user.username} rejected amount - RESETTING`);
      
      // Reset amount
      ticket.dealAmount = null;
      ticket.amountConfirmations = new Map();
      ticket.dealAmountConfirmed = false;
      ticket.markModified('amountConfirmations');

      console.log(`🔄 Amount cleared`);

      // Remove ALL amount-related messages
      const messageCountBefore = ticket.messages.length;
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'amount-entry' || 
          msg.embedData?.actionType === 'amount-confirmation' ||
          msg.embedData?.title?.includes('confirmed the amount'))
      );
      console.log(`🧹 Deleted ${messageCountBefore - ticket.messages.length} amount-related messages`);

      // Add rejection message and re-prompt
      const senderIsCreator = ticket.creatorRole === 'sender';
      const senderUser = senderIsCreator
        ? ticket.creator
        : acceptedParticipants[0]?.user;

      ticket.messages.push({
        isBot: true,
        content: 'Amount Rejected',
        type: 'embed',
        embedData: {
          title: 'Amount Entry Restarted',
          description: `@${user.username} indicated the amount was incorrect. Please enter the amount again.`,
          color: 'red'
        },
        timestamp: new Date()
      });

      // Re-add amount entry prompt
      ticket.messages.push({
        isBot: true,
        content: 'Enter Deal Amount',
        type: 'embed',
        embedData: {
          title: 'Enter Deal Amount',
          description: `@${senderUser.username} (Sender), please type the amount you will be sending to the Handshake BOT.\n\nExample: 100, $100, or 100.00`,
          color: 'blue',
          requiresAction: true,
          actionType: 'amount-entry'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Amount entry reset - ready for new amount\n`);

      res.json({
        success: true,
        message: 'Amount rejected, please enter again',
        ticket
      });
    }
  } catch (error) {
    console.error('❌ Confirm amount error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm amount',
      error: error.message
    });
  }
};

// Select fee option (proceed with fees or use pass)
export const selectFeeOption = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { option } = req.body; // 'with-fees' or 'use-pass'
    const userId = req.user._id;

    console.log(`\n💳 FEE OPTION REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Option: ${option}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar passes')
      .populate('participants.user', 'username userId avatar passes');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const isCreator = ticket.creator._id.toString() === userId.toString();
    const thisUserParticipant = ticket.participants.find(
      p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );
    const otherParticipant = ticket.participants.find(
      p => p.user._id.toString() !== userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !thisUserParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId).select('username passes');

    if (option === 'use-pass') {
      // Show private pass prompt to this user only
      console.log(`🎫 User ${user.username} wants to use a pass. Available passes: ${user.passes}`);
      
      if (user.passes <= 0) {
        return res.status(400).json({
          success: false,
          message: 'You do not have any passes available'
        });
      }

      res.json({
        success: true,
        showPassPrompt: true,
        availablePasses: user.passes,
        message: 'Show pass confirmation to user'
      });
    } else if (option === 'with-fees') {
      // User wants to proceed with fees - need other user to confirm
      console.log(`💰 User ${user.username} selected to proceed with fees`);

      // Remove previous fee-related messages
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'fee-selection' ||
          msg.embedData?.actionType === 'fee-confirmation')
      );

      // Mark this user's choice and track who initiated it
      ticket.feeDecision = 'with-fees';
      ticket.feeInitiatedBy = userId; // Track who clicked "Proceed with Fees"

      // Add confirmation prompt for OTHER user only
      const otherUser = isCreator ? otherParticipant.user : ticket.creator;
      
      ticket.messages.push({
        isBot: true,
        content: 'Confirm Fees',
        type: 'embed',
        embedData: {
          title: 'Confirm Fee Decision',
          description: `@${user.username} has chosen to proceed with fees. @${otherUser.username}, please confirm if this is correct.`,
          color: 'blue',
          requiresAction: true,
          actionType: 'fee-confirmation'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Fee decision saved - awaiting confirmation\n`);

      res.json({
        success: true,
        message: 'Awaiting fee confirmation',
        ticket
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid fee option'
      });
    }
  } catch (error) {
    console.error('❌ Select fee option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to select fee option',
      error: error.message
    });
  }
};

// Confirm using a pass
export const confirmPassUse = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    console.log(`\n🎫 CONFIRM PASS USE:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const user = await User.findById(userId).select('username passes');

    if (user.passes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No passes available'
      });
    }

    // Check if pass already used (race condition protection)
    if (ticket.passUsedBy) {
      return res.status(400).json({
        success: false,
        message: 'A pass has already been used for this transaction'
      });
    }

    // Deduct pass from user
    user.passes -= 1;
    await user.save();

    // Update ticket
    ticket.feeDecision = 'with-pass';
    ticket.passUsedBy = userId;
    ticket.feesConfirmed = true;

    // Remove all fee-related prompts
    ticket.messages = ticket.messages.filter(msg => 
      !(msg.embedData?.actionType === 'fee-selection' ||
        msg.embedData?.actionType === 'fee-confirmation')
    );

    // Add success message
    ticket.addUniqueMessage({
      isBot: true,
      content: 'Pass Used',
      type: 'embed',
      embedData: {
        title: 'Pass Used!',
        description: `@${user.username} used a pass. No fees will be charged for this transaction.`,
        color: 'green'
      },
      timestamp: new Date()
    });

    // Add transaction prompt immediately
    const senderUser = ticket.creatorRole === 'sender'
      ? ticket.creator
      : ticket.participants.find(p => p.status === 'accepted' && p.role === 'sender')?.user
        || ticket.participants.find(p => p.status === 'accepted')?.user;

    if (senderUser) {
      const totalAmount = calculateTotalAmount(
        ticket.dealAmount, 
        ticket.cryptocurrency,
        true // Pass was used
      );
      const botWallet = BOT_WALLETS[ticket.cryptocurrency];
      const exchangeRate = EXCHANGE_RATES[ticket.cryptocurrency];
      const cryptoAmount = (totalAmount / exchangeRate).toFixed(8);

      if (!botWallet) {
        ticket.messages.push({
          isBot: true,
          content: 'Wallet Not Configured',
          type: 'embed',
          embedData: {
            title: 'Wallet Not Configured',
            description: `Handshake does not have a ${ticket.cryptocurrency?.toUpperCase() || 'crypto'} wallet configured for this network. Please contact staff.`,
            color: 'red'
          },
          timestamp: new Date()
        });
        await ticket.save();

        return res.status(500).json({
          success: false,
          message: 'Bot wallet not configured for selected cryptocurrency',
          ticket
        });
      }

      ticket.messages.push({
        isBot: true,
        content: 'Send Funds',
        type: 'embed',
        embedData: {
          title: 'Send Funds to Handshake',
          description: `@${senderUser.username} (Sender), please send the <strong>EXACT</strong> amount to the Handshake bot wallet address below.\n\n<strong>Amount to Send:</strong> ${cryptoAmount} ${ticket.cryptocurrency.toUpperCase()}\n<strong>USD Value:</strong> $${totalAmount.toFixed(2)}\n\n<strong>Bot Wallet Address:</strong>\n${botWallet}\n\n⚠️ <strong>Important:</strong> Send the EXACT amount to ensure the bot can detect your transaction. If you experience issues, type /ping in chat to alert staff.`,
          color: 'blue',
          requiresAction: true,
          actionType: 'transaction-send',
          metadata: {
            botWallet,
            cryptoAmount,
            totalAmount,
            exchangeRate: `1 ${ticket.cryptocurrency.toUpperCase()} = $${exchangeRate.toLocaleString()} USD`
          }
        },
        timestamp: new Date()
      });

      ticket.transactionPromptShown = true;
      ticket.awaitingTransaction = true;
      ticket.botWalletAddress = botWallet;
      ticket.expectedAmount = totalAmount;
      console.log(`📤 Transaction prompt added for ${senderUser.username}`);
    }

    await ticket.save();
    console.log(`✅ Pass used by ${user.username}. Fees confirmed.\n`);

    res.json({
      success: true,
      message: 'Pass used successfully',
      remainingPasses: user.passes,
      ticket
    });
  } catch (error) {
    console.error('❌ Confirm pass use error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to use pass',
      error: error.message
    });
  }
};

// Confirm fee decision
export const confirmFees = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed } = req.body;
    const userId = req.user._id;

    console.log(`\n💳 CONFIRM FEES REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Confirmed: ${confirmed}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const user = await User.findById(userId).select('username');

    // Check if this user is allowed to confirm (must be the OTHER user, not the one who clicked "Proceed with Fees")
    if (ticket.feeInitiatedBy && ticket.feeInitiatedBy.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot confirm your own fee decision. Waiting for the other user to confirm.'
      });
    }

    if (confirmed) {
      // Confirmed - finalize with fees
      ticket.feesConfirmed = true;
      console.log(`✅ Fees confirmed`);

      // Remove fee prompts
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'fee-selection' ||
          msg.embedData?.actionType === 'fee-confirmation')
      );

      // Add confirmation message
      ticket.addUniqueMessage({
        isBot: true,
        content: 'Fees Confirmed',
        type: 'embed',
        embedData: {
          title: 'Transaction with Fees Confirmed!',
          description: `Both users have agreed to proceed with standard fees.\n\nYou can now proceed with the transaction.`,
          color: 'green'
        },
        timestamp: new Date()
      });

    // Add transaction prompt immediately
    const senderUser = ticket.creatorRole === 'sender'
      ? ticket.creator
      : ticket.participants.find(p => p.status === 'accepted' && p.role === 'sender')?.user
        || ticket.participants.find(p => p.status === 'accepted')?.user;

      if (senderUser) {
        const totalAmount = calculateTotalAmount(
          ticket.dealAmount, 
          ticket.cryptocurrency,
          false // Fees are being charged
        );
        const botWallet = BOT_WALLETS[ticket.cryptocurrency];
        const exchangeRate = EXCHANGE_RATES[ticket.cryptocurrency];
        const cryptoAmount = (totalAmount / exchangeRate).toFixed(8);

        if (!botWallet) {
          ticket.messages.push({
            isBot: true,
            content: 'Wallet Not Configured',
            type: 'embed',
            embedData: {
              title: 'Wallet Not Configured',
              description: `Handshake does not have a ${ticket.cryptocurrency?.toUpperCase() || 'crypto'} wallet configured for this network. Please contact staff.`,
              color: 'red'
            },
            timestamp: new Date()
          });
          await ticket.save();

          return res.status(500).json({
            success: false,
            message: 'Bot wallet not configured for selected cryptocurrency',
            ticket
          });
        }

        ticket.messages.push({
          isBot: true,
          content: 'Send Funds',
          type: 'embed',
          embedData: {
            title: 'Send Funds to Handshake',
            description: `@${senderUser.username} (Sender), please send the <strong>EXACT</strong> amount to the Handshake bot wallet address below.\n\n<strong>Amount to Send:</strong> ${cryptoAmount} ${ticket.cryptocurrency.toUpperCase()}\n<strong>USD Value:</strong> $${totalAmount.toFixed(2)}\n\n<strong>Bot Wallet Address:</strong>\n${botWallet}\n\n⚠️ <strong>Important:</strong> Send the EXACT amount to ensure the bot can detect your transaction. If you experience issues, type /ping in chat to alert staff.`,
            color: 'blue',
            requiresAction: true,
            actionType: 'transaction-send',
            metadata: {
              botWallet,
              cryptoAmount,
              totalAmount,
              exchangeRate: `1 ${ticket.cryptocurrency.toUpperCase()} = $${exchangeRate.toLocaleString()} USD`
            }
          },
          timestamp: new Date()
        });

        ticket.transactionPromptShown = true;
        ticket.awaitingTransaction = true;
        ticket.botWalletAddress = botWallet;
        ticket.expectedAmount = totalAmount;
        console.log(`📤 Transaction prompt added for ${senderUser.username}`);
      }

      await ticket.save();
      console.log(`💾 Fees confirmed for ticket ${ticketId}\n`);

      res.json({
        success: true,
        message: 'Fees confirmed',
        ticket
      });
    } else {
      // Rejected - re-prompt
      console.log(`❌ User ${user.username} rejected fee decision - RESETTING`);
      
      ticket.feeDecision = null;
      ticket.feeInitiatedBy = null;

      // Remove fee messages
      ticket.messages = ticket.messages.filter(msg => 
        !(msg.embedData?.actionType === 'fee-selection' ||
          msg.embedData?.actionType === 'fee-confirmation')
      );

      // Add rejection message
      ticket.messages.push({
        isBot: true,
        content: 'Fee Decision Restarted',
        type: 'embed',
        embedData: {
          title: 'Fee Selection Restarted',
          description: `@${user.username} indicated this was incorrect. Please select your fee option again.`,
          color: 'red'
        },
        timestamp: new Date()
      });

      // Re-add fee prompt
      ticket.messages.push({
        isBot: true,
        content: 'Fee Options',
        type: 'embed',
        embedData: {
          title: 'Use a Pass?',
          description: `You can use a <strong>Pass</strong> to skip transaction fees, or proceed with our standard fees.\\n\\n<strong>Fee Structure:</strong>\\n• Deals $250+: 1%\\n• Deals under $250: $2\\n• Deals under $50: $0.50\\n• Deals under $10: FREE\\n• USDT & USDC: $1 surcharge\\n\\nPasses allow you to skip these fees entirely.`,
          color: 'blue',
          requiresAction: true,
          actionType: 'fee-selection'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Fee selection reset\n`);

      res.json({
        success: true,
        message: 'Fee selection restarted',
        ticket
      });
    }
  } catch (error) {
    console.error('❌ Confirm fees error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm fees',
      error: error.message
    });
  }
};

// Copy transaction details to chat (limited to 3 times)
export const copyTransactionDetails = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    console.log(`\n📋 COPY TRANSACTION DETAILS:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user has access
    const isCreator = ticket.creator._id.toString() === userId.toString();
    const isParticipant = ticket.participants.some(
      p => p.user._id.toString() === userId.toString() && p.status === 'accepted'
    );

    if (!isCreator && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check copy limit
    if (ticket.copyDetailsClickCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Copy limit reached (3 times maximum)'
      });
    }

    // Get transaction details
    const totalAmount = calculateTotalAmount(
      ticket.dealAmount,
      ticket.cryptocurrency,
      ticket.feeDecision === 'with-pass'
    );
    const botWallet = BOT_WALLETS[ticket.cryptocurrency];
    const exchangeRate = EXCHANGE_RATES[ticket.cryptocurrency];
    const cryptoAmount = (totalAmount / exchangeRate).toFixed(8);

    if (!botWallet) {
      return res.status(500).json({
        success: false,
        message: 'Bot wallet not configured for selected cryptocurrency'
      });
    }

    // Increment copy count
    ticket.copyDetailsClickCount += 1;

    // Add wallet address message to chat only
    ticket.messages.push({
      isBot: true,
      content: `${botWallet}`,
      type: 'text',
      embedData: null,
      timestamp: new Date()
    });

    await ticket.save();
    console.log(`✅ Transaction details copied (${ticket.copyDetailsClickCount}/3)\n`);

    res.json({
      success: true,
      message: 'Transaction details copied to chat',
      copyCount: ticket.copyDetailsClickCount,
      ticket
    });
  } catch (error) {
    console.error('❌ Copy transaction details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to copy transaction details',
      error: error.message
    });
  }
};

// Release funds (sender only)
export const releaseFunds = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user._id;

    console.log(`\n💰 RELEASE FUNDS REQUEST:`);
    console.log(`   Ticket: ${ticketId}`);
    console.log(`   User ID: ${userId}`);

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if transaction is confirmed
    if (!ticket.transactionConfirmed) {
      return res.status(400).json({
        success: false,
        message: 'Transaction not yet confirmed'
      });
    }

    // Check if funds already released
    if (ticket.fundsReleased) {
      return res.status(400).json({
        success: false,
        message: 'Funds have already been released'
      });
    }

    if (ticket.releaseInitiated || ticket.awaitingPayoutAddress || ticket.awaitingPayoutConfirmation) {
      return res.status(400).json({
        success: false,
        message: 'Release already initiated. Waiting for receiver address.'
      });
    }

    // Find sender participant
    const senderParticipant = ticket.participants.find(p => p.role === 'sender');
    if (!senderParticipant && ticket.creatorRole !== 'sender') {
      return res.status(400).json({
        success: false,
        message: 'Sender not found'
      });
    }

    const isSender = ticket.creatorRole === 'sender'
      ? ticket.creator._id.toString() === userId.toString()
      : senderParticipant?.user?._id?.toString() === userId.toString();

    if (!isSender) {
      return res.status(403).json({
        success: false,
        message: 'Only the sender can release funds'
      });
    }

    const user = await User.findById(userId).select('username');
    const receiverParticipant = ticket.participants.find(p => p.role === 'receiver');
    let receiverUser = null;

    if (ticket.creatorRole === 'receiver') {
      receiverUser = ticket.creator;
    } else if (receiverParticipant) {
      receiverUser = (ticket.creator._id.toString() === receiverParticipant.user._id.toString()
        ? ticket.creator
        : receiverParticipant.user);
    }

    const senderUser = ticket.creatorRole === 'sender'
      ? ticket.creator
      : senderParticipant?.user || ticket.creator;

    ticket.releaseInitiated = true;
    ticket.releaseInitiatedBy = userId;
    ticket.awaitingPayoutAddress = true;
    ticket.awaitingPayoutConfirmation = false;
    ticket.pendingPayoutAddress = null;

    // Remove release button message
    ticket.messages = ticket.messages.filter(msg => 
      msg.embedData?.actionType !== 'release-funds'
    );

    ticket.messages.push({
      isBot: true,
      content: 'Release Initiated',
      type: 'embed',
        embedData: {
          title: 'Release Initiated',
          description: `@${senderUser?.username || 'Sender'} has confirmed to release the funds.\n\n@${receiverUser?.username || 'Receiver'}, please paste your Ethereum address in the chat below so we can send your payout.\n\n<strong>Tip:</strong> Use a standard <strong>0x...</strong> Ethereum address.`,
        color: 'blue',
        requiresAction: true,
        actionType: 'payout-address'
      },
      timestamp: new Date()
    });

    await ticket.save();
    console.log(`✅ Release initiated for ticket ${ticketId} by ${user.username}\n`);

    res.json({
      success: true,
      message: 'Release initiated successfully',
      ticket
    });
  } catch (error) {
    console.error('❌ Release funds error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to release funds',
      error: error.message
    });
  }
};

// Submit receiver payout address
export const submitPayoutAddress = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { address } = req.body;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (!ticket.awaitingPayoutAddress) {
      return res.status(400).json({
        success: false,
        message: 'Not awaiting a payout address'
      });
    }

    const receiverParticipant = ticket.participants.find(p => p.role === 'receiver');
    const isReceiver = ticket.creatorRole === 'receiver'
      ? ticket.creator._id.toString() === userId.toString()
      : receiverParticipant?.user?._id?.toString() === userId.toString();

    if (!isReceiver) {
      return res.status(403).json({
        success: false,
        message: 'Only the receiver can submit the payout address'
      });
    }

    const rawAddress = String(address || '').trim();
    const extractedAddress = getAddressPrefixMatch(rawAddress, ticket.cryptocurrency);
    const isValid = Boolean(extractedAddress) && (
      ticket.cryptocurrency !== 'ethereum' || ethers.isAddress(extractedAddress)
    );

    if (!isValid) {
      ticket.messages.push({
        isBot: true,
        content: 'Invalid Address',
        type: 'embed',
        embedData: {
          title: 'Invalid Ethereum Address',
          description: `That does not look like a valid ${ticket.cryptocurrency?.toUpperCase() || 'crypto'} address. Please paste a correct address and try again.`,
          color: 'red'
        },
        timestamp: new Date()
      });

      await ticket.save();
      return res.json({
        success: false,
        message: 'Invalid Ethereum address',
        ticket
      });
    }

    const checksumAddress = ticket.cryptocurrency === 'ethereum'
      ? ethers.getAddress(extractedAddress)
      : extractedAddress;
    ticket.pendingPayoutAddress = checksumAddress;
    ticket.awaitingPayoutAddress = false;
    ticket.awaitingPayoutConfirmation = true;

    ticket.messages = ticket.messages.filter(msg =>
      msg.embedData?.actionType !== 'payout-address'
    );

    ticket.messages.push({
      isBot: true,
      content: 'Confirm Payout Address',
      type: 'embed',
      embedData: {
        title: 'Confirm Payout Address',
        description: `Please confirm this address is correct:\\n\\n<strong>${checksumAddress}</strong>\\n\\nIf this is correct, click <strong>This is Correct</strong>. If not, click <strong>This is Wrong</strong> and you can paste it again.`,
        color: 'blue',
        requiresAction: true,
        actionType: 'payout-address-confirmation',
        metadata: {
          address: checksumAddress
        }
      },
      timestamp: new Date()
    });

    await ticket.save();

    res.json({
      success: true,
      message: 'Payout address submitted',
      ticket
    });
  } catch (error) {
    console.error('❌ Submit payout address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit payout address',
      error: error.message
    });
  }
};

// Confirm payout address and send funds
export const confirmPayoutAddress = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { confirmed } = req.body;
    const userId = req.user._id;

    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (!ticket.awaitingPayoutConfirmation || !ticket.pendingPayoutAddress) {
      return res.status(400).json({
        success: false,
        message: 'No payout address awaiting confirmation'
      });
    }

    const receiverParticipant = ticket.participants.find(p => p.role === 'receiver');
    const isReceiver = ticket.creatorRole === 'receiver'
      ? ticket.creator._id.toString() === userId.toString()
      : receiverParticipant?.user?._id?.toString() === userId.toString();

    if (!isReceiver) {
      return res.status(403).json({
        success: false,
        message: 'Only the receiver can confirm the payout address'
      });
    }

    // Remove existing confirmation prompt
    ticket.messages = ticket.messages.filter(msg => 
      msg.embedData?.actionType !== 'payout-address-confirmation'
    );

    if (!confirmed) {
      ticket.pendingPayoutAddress = null;
      ticket.awaitingPayoutConfirmation = false;
      ticket.awaitingPayoutAddress = true;

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'payout-address'
      );

      ticket.messages.push({
        isBot: true,
        content: 'Address Rejected',
        type: 'embed',
        embedData: {
          title: 'Address Rejected',
          description: 'No problem. Please paste the correct Ethereum address below when you are ready.',
          color: 'orange',
          requiresAction: true,
          actionType: 'payout-address'
        },
        timestamp: new Date()
      });

      await ticket.save();
      return res.json({
        success: true,
        message: 'Address rejected',
        ticket
      });
    }

    if (ticket.cryptocurrency !== 'ethereum') {
      return res.status(400).json({
        success: false,
        message: 'Payouts are currently supported only for Ethereum tickets'
      });
    }

    try {
      const payoutAddress = ticket.pendingPayoutAddress;
      const { txHash, payoutEth, payoutUsd } = await sendEthPayout(ticket, payoutAddress);

      ticket.payoutAddress = payoutAddress;
      ticket.payoutAddressConfirmed = true;
      ticket.payoutTransactionHash = txHash;
      ticket.pendingPayoutAddress = null;
      ticket.awaitingPayoutConfirmation = false;
      ticket.awaitingPayoutAddress = false;

      const payoutConfig = ETH_RPC_CONFIG[ETH_NETWORK_MODE];
      const requiredConfirmations = payoutConfig?.confirmationsRequired || 2;

      ticket.messages.push({
        isBot: true,
        content: 'Payout Processing',
        type: 'embed',
        embedData: {
          title: 'Payout Sent',
          description: `Your payout is on the way!\\n\\n<strong>Amount:</strong> <strong>${payoutEth} ETH</strong> (~$${Number(payoutUsd).toFixed(2)} USD)\\n<strong>To:</strong> <strong>${payoutAddress}</strong>\\n\\n<strong>Transaction:</strong> <strong>${txHash.substring(0, 16)}...</strong>`,
          color: 'blue',
          requiresAction: true,
          actionType: 'payout-confirming',
          metadata: {
            txHash,
            confirmations: 0,
            requiredConfirmations
          }
        },
        timestamp: new Date()
      });

      await ticket.save();

      const receiverName = ticket.creatorRole === 'receiver'
        ? ticket.creator?.username
        : receiverParticipant?.user?.username;

      startPayoutConfirmationWatcher({
        ticketId,
        txHash,
        receiverName
      });

      return res.json({
        success: true,
        message: 'Payout sent',
        ticket
      });
    } catch (error) {
      console.error('❌ Payout send error:', error);
      ticket.pendingPayoutAddress = null;
      ticket.awaitingPayoutConfirmation = false;
      ticket.awaitingPayoutAddress = true;

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'payout-address'
      );

      ticket.messages.push({
        isBot: true,
        content: 'Payout Failed',
        type: 'embed',
        embedData: {
          title: 'Payout Failed',
          description: 'We could not send the payout. Please paste your address again or contact staff for help.',
          color: 'red',
          requiresAction: true,
          actionType: 'payout-address'
        },
        timestamp: new Date()
      });

      await ticket.save();
      return res.status(500).json({
        success: false,
        message: 'Failed to send payout',
        ticket
      });
    }
  } catch (error) {
    console.error('❌ Confirm payout address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payout address',
      error: error.message
    });
  }
};

// Rescan for transaction
export const rescanTransaction = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await TradeTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const { maxAttemptsReached } = applyRescanTransaction(ticket);
    await ticket.save();

    res.json({ success: true, ticket, maxAttemptsReached });
  } catch (error) {
    console.error('Error rescanning transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel transaction
export const cancelTransaction = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await TradeTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    applyCancelTransaction(ticket);

    await ticket.save();

    res.json({ success: true, ticket });
  } catch (error) {
    console.error('Error cancelling transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
