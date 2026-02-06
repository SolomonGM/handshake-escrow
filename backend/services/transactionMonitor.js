import axios from 'axios';
import cron from 'node-cron';
import { ethers } from 'ethers';
import TradeTicket from '../models/TradeTicket.js';
import PassOrder from '../models/PassOrder.js';
import { completePassOrder } from '../controllers/passController.js';
import { ETH_RPC_CONFIG, ETH_NETWORK_MODE, EXCHANGE_RATES } from '../config/wallets.js';
import { upsertPassTransactionHistory } from './passTransactionHistory.js';

// BlockCypher API configuration
const BLOCKCYPHER_TOKEN = process.env.BLOCKCYPHER_TOKEN || 'c35091e2555e49dfb41c2ba499c2ca0c';
const UTXO_NETWORKS = {
  litecoin: {
    apiBase: 'https://api.blockcypher.com/v1/ltc/test3',
    explorer: 'https://live.blockcypher.com/ltc-testnet',
    symbol: 'LTC',
    confirmationsRequired: 2
  },
  bitcoin: {
    apiBase: 'https://api.blockcypher.com/v1/btc/test3',
    explorer: 'https://live.blockcypher.com/btc-testnet',
    symbol: 'BTC',
    confirmationsRequired: 2
  }
};

const getExchangeRate = (crypto) => EXCHANGE_RATES[crypto] || 1;

// Convert USD to crypto using configured exchange rate
const convertUSDToCrypto = (usdAmount, crypto) => {
  const rate = getExchangeRate(crypto);
  return (usdAmount / rate).toFixed(8);
};

const ETH_SCAN_INTERVAL_MS = 15000;
const ETH_RATE_LIMIT_COOLDOWN_MS = 30000;
const ethLastScanAtByTicket = new Map();
const ethCooldownByTicket = new Map();
const ethDetectionLoggedByTicket = new Set();

const isRateLimitError = (error) => {
  const status = error?.error?.code || error?.code;
  const message = String(error?.error?.message || error?.shortMessage || error?.message || '');
  return status === 429 || message.includes('exceeded its compute units');
};

const fetchAlchemyTransfers = async (provider, toAddress, fromBlock) => {
  try {
    const payload = {
      fromBlock: ethers.toQuantity(fromBlock),
      toBlock: 'latest',
      toAddress,
      category: ['external'],
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: '0x64'
    };

    const response = await provider.send('alchemy_getAssetTransfers', payload);
    return response?.transfers || [];
  } catch (error) {
    if (isRateLimitError(error)) {
      throw error;
    }
    return null;
  }
};

const getAlchemyTransferValueWei = (transfer) => {
  if (!transfer) {
    return null;
  }

  if (transfer.value !== undefined && transfer.value !== null) {
    try {
      return ethers.parseEther(String(transfer.value));
    } catch (error) {
      return null;
    }
  }

  if (transfer.rawContract?.value) {
    try {
      return BigInt(transfer.rawContract.value);
    } catch (error) {
      return null;
    }
  }

  return null;
};

const getUtxoNetwork = (crypto) => UTXO_NETWORKS[crypto];

const getBlockCypherTxLink = (txHash, crypto) => {
  const network = getUtxoNetwork(crypto);
  if (!network || !txHash) return null;
  return `${network.explorer}/tx/${txHash}`;
};

// Get address transactions from BlockCypher
const getAddressTransactions = async (address, crypto = 'litecoin') => {
  try {
    const network = getUtxoNetwork(crypto);
    if (!network) {
      console.error(`Unsupported UTXO network: ${crypto}`);
      return null;
    }
    const response = await axios.get(
      `${network.apiBase}/addrs/${address}/full?token=${BLOCKCYPHER_TOKEN}&limit=50`
    );
    return response.data;
  } catch (error) {
    console.error(`âŒ Error fetching transactions for ${address}:`, error.message);
    return null;
  }
};

const getUtxoTransaction = async (txHash, crypto = 'litecoin') => {
  try {
    const network = getUtxoNetwork(crypto);
    if (!network || !txHash) {
      return null;
    }
    const response = await axios.get(
      `${network.apiBase}/txs/${txHash}?token=${BLOCKCYPHER_TOKEN}`
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching transaction ${txHash}:`, error.message);
    return null;
  }
};

// Check if transaction matches expected amount (with tolerance for price fluctuations)
const isUtxoAmountMatch = (receivedSatoshis, expectedAmount, expectedUSD, crypto) => {
  const network = getUtxoNetwork(crypto);
  const symbol = network ? network.symbol : 'COIN';
  const receivedCrypto = receivedSatoshis / 100000000; // Convert satoshis to coin
  const expectedValue = parseFloat(expectedAmount);
  
  // 2% tolerance as specified in requirements
  const tolerance = expectedValue * 0.02;
  const minAcceptable = expectedValue - tolerance;
  const maxAcceptable = expectedValue + tolerance;
  
  const difference = Math.abs(receivedCrypto - expectedValue);
  const isMatch = receivedCrypto >= minAcceptable && receivedCrypto <= maxAcceptable;
  
  if (isMatch && difference > 0) {
    console.log(`   Info: Amount within 2% tolerance: ${difference.toFixed(8)} ${symbol} difference (max: ${tolerance.toFixed(8)} ${symbol})`);
  }
  
  return {
    isMatch,
    receivedCrypto,
    expectedCrypto: expectedValue,
    difference,
    tolerance,
    percentDiff: (difference / expectedValue) * 100
  };
};

const getUtxoTxDetails = (addressData, txHash) => {
  if (!addressData?.txs || !txHash) return null;
  return addressData.txs.find((tx) => tx.hash === txHash || tx.tx_hash === txHash) || null;
};

const getUtxoTxTimestamp = (txRef, txDetails) => {
  const timestamp = txRef?.confirmed || txRef?.received || txDetails?.confirmed || txDetails?.received;
  return timestamp ? new Date(timestamp) : null;
};

const getUtxoFromAddress = (txDetails) => {
  const input = txDetails?.inputs?.[0];
  return input?.addresses?.[0] || null;
};

const getUtxoNetworkFee = (txDetails) => {
  if (!txDetails || typeof txDetails.fees !== 'number') return null;
  return txDetails.fees / 100000000;
};

const refreshUtxoConfirmations = async (order, io, crypto = 'litecoin') => {
  const network = getUtxoNetwork(crypto);
  if (!network || !order?.transactionHash) {
    return false;
  }

  try {
    await upsertPassTransactionHistory(order, 'pending');
  } catch (historyError) {
    console.error('Error updating pass transaction history:', historyError);
  }

  const tx = await getUtxoTransaction(order.transactionHash, crypto);
  if (!tx) {
    return false;
  }

  const confirmations = tx.confirmations || 0;
  const reachedRequired = confirmations >= network.confirmationsRequired;
  let shouldSave = false;

  if (order.confirmations !== confirmations) {
    order.confirmations = confirmations;
    shouldSave = true;
  }

  if (!reachedRequired && order.status !== 'confirmed') {
    order.status = 'confirmed';
    shouldSave = true;
  }

  if (shouldSave) {
    await order.save();
  }

  if (io && !reachedRequired) {
    io.emit(`pass_order_update:${order.orderId}`, {
      orderId: order.orderId,
      status: 'confirming',
      confirmations,
      required: network.confirmationsRequired,
      transactionHash: order.transactionHash
    });
  }

  if (reachedRequired) {
    order.confirmations = confirmations;
    await order.save();
    const success = await completePassOrder(order.orderId, order.transactionHash, io);
    if (success) {
      console.log(`${network.symbol} pass order ${order.orderId} completed successfully`);
    }
  }

  return true;
};

const handleTicketTimeout = async (ticket) => {
  const now = new Date();

  if (ticket.transactionDetected || ticket.senderTransactionHash) {
    return false;
  }

  if (ticket.transactionTimeoutAt) {
    const timeoutDate = new Date(ticket.transactionTimeoutAt);
    if (now >= timeoutDate && !ticket.transactionTimedOut) {
      console.log(`⏰ Transaction timeout reached for ticket ${ticket.ticketId}`);
      ticket.transactionTimedOut = true;
      ticket.awaitingTransaction = false;

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'transaction-send'
      );

      ticket.messages.push({
        isBot: true,
        content: 'No Transaction Found',
        type: 'embed',
        embedData: {
          title: 'No Transaction Found',
          description: `It appears no payment has been sent to the provided wallet.\n\nWould you like to continue? If you are having issues, please type <strong>/ping</strong> to alert staff.`,
          color: 'orange',
          requiresAction: true,
          actionType: 'transaction-timeout'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`💾 Timeout prompt added to ticket ${ticket.ticketId}\n`);
      return true;
    }

    return false;
  }

  const timeoutMinutes = 20;
  ticket.transactionTimeoutAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
  await ticket.save();
  console.log(`   ⏰ Timeout set for ${timeoutMinutes} minutes`);
  return false;
};

const addTicketTransactionDetectedMessage = (ticket, txHash, confirmations, requiredConfirmations) => {
  ticket.messages.push({
    isBot: true,
    content: 'Transaction Detected',
    type: 'embed',
    embedData: {
      title: 'Transaction Detected',
      description: `We've detected your transaction!\n\nTransaction Hash: ${txHash.substring(0, 16)}...\n\nWaiting for confirmations...`,
      color: 'blue',
      requiresAction: true,
      actionType: 'transaction-confirming',
      metadata: {
        txHash,
        confirmations,
        requiredConfirmations
      }
    },
    timestamp: new Date()
  });
};

const monitorUtxoTicketTransaction = async (ticket, crypto) => {
  const network = getUtxoNetwork(crypto);
  if (!network) {
    return;
  }

  const addressData = await getAddressTransactions(ticket.botWalletAddress, crypto);
  if (!addressData || !addressData.txs) {
    return;
  }

  const expectedCrypto = convertUSDToCrypto(ticket.expectedAmount, crypto);
  const recentTxs = addressData.txs.slice(0, 10);

  for (const tx of recentTxs) {
    if (ticket.senderTransactionHash === tx.hash) {
      if (!ticket.transactionConfirmed) {
        await updateTransactionConfirmations(
          ticket,
          tx.hash,
          tx.confirmations || 0,
          network.confirmationsRequired
        );
      }
      continue;
    }

    const ourOutputs = tx.outputs.filter(output =>
      output.addresses && output.addresses.includes(ticket.botWalletAddress)
    );

    for (const output of ourOutputs) {
      const matchResult = isUtxoAmountMatch(output.value, expectedCrypto, ticket.expectedAmount, crypto);

      if (matchResult.isMatch) {
        console.log(`✅ TRANSACTION DETECTED for ticket ${ticket.ticketId}!`);
        console.log(`   TX Hash: ${tx.hash}`);
        console.log(`   Amount: ${matchResult.receivedCrypto} ${network.symbol} (expected ${matchResult.expectedCrypto} ${network.symbol})`);
        console.log(`   USD Value: $${ticket.expectedAmount}`);
        console.log(`   Confirmations: ${tx.confirmations}`);

        ticket.transactionDetected = true;
        ticket.senderTransactionHash = tx.hash;
        ticket.confirmationCount = tx.confirmations || 0;
        ticket.transactionTimedOut = false;

        ticket.messages = ticket.messages.filter(msg =>
          msg.embedData?.actionType !== 'transaction-send'
        );

        addTicketTransactionDetectedMessage(
          ticket,
          tx.hash,
          tx.confirmations || 0,
          network.confirmationsRequired
        );

        await ticket.save();
        console.log(`💾 Transaction detected and saved for ticket ${ticket.ticketId}\n`);

        if (tx.confirmations >= network.confirmationsRequired) {
          await updateTransactionConfirmations(ticket, tx.hash, tx.confirmations, network.confirmationsRequired);
        }
        return;
      }
    }
  }
};

const monitorEthTicketTransaction = async (ticket) => {
  const provider = getEthProvider();
  if (!provider) {
    console.error('❌ Ethereum provider not available. Please configure RPC URL.');
    return;
  }

  const config = ETH_RPC_CONFIG[ETH_NETWORK_MODE];
  const requiredConfirmations = config?.confirmationsRequired || 2;

  const now = Date.now();
  const cooldownUntil = ethCooldownByTicket.get(ticket.ticketId);
  if (cooldownUntil && now < cooldownUntil) {
    return;
  }

  if (ticket.senderTransactionHash && !ticket.transactionConfirmed) {
    try {
      const receipt = await provider.getTransactionReceipt(ticket.senderTransactionHash);
      if (receipt && receipt.blockNumber) {
        const currentBlock = await provider.getBlockNumber();
        const confirmations = currentBlock - receipt.blockNumber + 1;
        if (!ethDetectionLoggedByTicket.has(ticket.ticketId)) {
          console.log(`✅ ETH TRANSACTION DETECTED for ticket ${ticket.ticketId}!`);
          console.log(`   TX Hash: ${ticket.senderTransactionHash}`);
          console.log(`   Confirmations: ${confirmations}/${requiredConfirmations}`);
          ethDetectionLoggedByTicket.add(ticket.ticketId);
        }
        await updateTransactionConfirmations(ticket, ticket.senderTransactionHash, confirmations, requiredConfirmations);
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        ethCooldownByTicket.set(ticket.ticketId, now + ETH_RATE_LIMIT_COOLDOWN_MS);
        return;
      }
      console.error(`❌ Error refreshing ETH confirmations for ticket ${ticket.ticketId}:`, error.message);
    }
    return;
  }

  const lastScanAt = ethLastScanAtByTicket.get(ticket.ticketId) || 0;
  if (now - lastScanAt < ETH_SCAN_INTERVAL_MS) {
    return;
  }
  ethLastScanAtByTicket.set(ticket.ticketId, now);

  let currentBlock;
  try {
    currentBlock = await provider.getBlockNumber();
  } catch (error) {
    if (isRateLimitError(error)) {
      ethCooldownByTicket.set(ticket.ticketId, now + ETH_RATE_LIMIT_COOLDOWN_MS);
      return;
    }
    throw error;
  }
  const expectedETH = convertUSDToETH(ticket.expectedAmount);

  let transfers = null;
  const transferFromBlock = Math.max(0, currentBlock - 120);
  try {
    transfers = await fetchAlchemyTransfers(provider, ticket.botWalletAddress, transferFromBlock);
  } catch (error) {
    if (isRateLimitError(error)) {
      ethCooldownByTicket.set(ticket.ticketId, now + ETH_RATE_LIMIT_COOLDOWN_MS);
      return;
    }
    transfers = null;
  }

  if (Array.isArray(transfers) && transfers.length > 0) {
    for (const transfer of transfers.slice(0, 10)) {
      if (!transfer?.hash) {
        continue;
      }
      if (!transfer.to) {
        continue;
      }
      if (transfer.to.toLowerCase() !== ticket.botWalletAddress.toLowerCase()) {
        continue;
      }
      if (ticket.senderTransactionHash && ticket.senderTransactionHash === transfer.hash) {
        continue;
      }

      const valueWei = getAlchemyTransferValueWei(transfer);
      if (!valueWei) {
        continue;
      }

      const matchResult = isEthAmountMatch(valueWei, expectedETH, ticket.expectedAmount);
      if (!matchResult.isMatch) {
        continue;
      }

      let receipt;
      try {
        receipt = await provider.getTransactionReceipt(transfer.hash);
      } catch (error) {
        if (isRateLimitError(error)) {
          ethCooldownByTicket.set(ticket.ticketId, now + ETH_RATE_LIMIT_COOLDOWN_MS);
          return;
        }
        continue;
      }

      if (!receipt || receipt.status !== 1) {
        continue;
      }

      const confirmations = receipt.blockNumber ? currentBlock - receipt.blockNumber + 1 : 0;

      console.log(`✅ ETH TRANSACTION DETECTED for ticket ${ticket.ticketId}!`);
      console.log(`   TX Hash: ${transfer.hash}`);
      console.log(`   Amount: ${matchResult.receivedETH.toFixed(8)} ETH (expected ${matchResult.expectedETH.toFixed(8)} ETH)`);
      console.log(`   USD Value: $${ticket.expectedAmount}`);
      console.log(`   Confirmations: ${confirmations}/${requiredConfirmations}`);
      ethDetectionLoggedByTicket.add(ticket.ticketId);

      ticket.transactionDetected = true;
      ticket.senderTransactionHash = transfer.hash;
      ticket.confirmationCount = confirmations;
      ticket.transactionTimedOut = false;

      ticket.messages = ticket.messages.filter(msg =>
        msg.embedData?.actionType !== 'transaction-send'
      );

      addTicketTransactionDetectedMessage(
        ticket,
        transfer.hash,
        confirmations,
        requiredConfirmations
      );

      await ticket.save();
      console.log(`💾 Transaction detected and saved for ticket ${ticket.ticketId}\n`);

      if (confirmations >= requiredConfirmations) {
        await updateTransactionConfirmations(ticket, transfer.hash, confirmations, requiredConfirmations);
      }
      return;
    }
  }

  const searchFromBlock = Math.max(0, currentBlock - 60);
  const maxBlocksPerScan = 8;
  let blocksScanned = 0;

  for (let blockNum = currentBlock; blockNum >= searchFromBlock; blockNum--) {
    let block;
    try {
      block = await provider.getBlock(blockNum, true);
    } catch (err) {
      if (isRateLimitError(err)) {
        ethCooldownByTicket.set(ticket.ticketId, now + ETH_RATE_LIMIT_COOLDOWN_MS);
        return;
      }
      console.log(`   Warning: Error scanning block ${blockNum}: ${err.message}`);
      break;
    }

    if (!block || !block.transactions) {
      continue;
    }

    const txObjects = block.transactions.filter(tx => typeof tx !== 'string');
    const txHashes = block.transactions.filter(tx => typeof tx === 'string');
    const transactionsToCheck = txObjects;

    if (transactionsToCheck.length === 0 && txHashes.length > 0) {
      // Avoid heavy hash lookups; only sample a few to prevent rate limits
      for (const hash of txHashes.slice(0, 3)) {
        try {
          const txData = await provider.getTransaction(hash);
          if (txData) {
            transactionsToCheck.push(txData);
          }
        } catch (err) {
          if (isRateLimitError(err)) {
            ethCooldownByTicket.set(ticket.ticketId, now + ETH_RATE_LIMIT_COOLDOWN_MS);
            return;
          }
          break;
        }
      }
    }

    for (const txData of transactionsToCheck) {
      if (!txData || !txData.to || txData.to.toLowerCase() !== ticket.botWalletAddress.toLowerCase()) {
        continue;
      }

      if (ticket.senderTransactionHash && ticket.senderTransactionHash === txData.hash) {
        continue;
      }

      const receipt = await provider.getTransactionReceipt(txData.hash);
      if (!receipt || receipt.status !== 1) {
        continue;
      }

      const confirmations = currentBlock - receipt.blockNumber + 1;
      const matchResult = isEthAmountMatch(txData.value, expectedETH, ticket.expectedAmount);

      if (matchResult.isMatch) {
        console.log(`✅ ETH TRANSACTION DETECTED for ticket ${ticket.ticketId}!`);
        console.log(`   TX Hash: ${txData.hash}`);
        console.log(`   Amount: ${matchResult.receivedETH.toFixed(8)} ETH (expected ${matchResult.expectedETH.toFixed(8)} ETH)`);
        console.log(`   USD Value: $${ticket.expectedAmount}`);
        console.log(`   Confirmations: ${confirmations}/${requiredConfirmations}`);
        ethDetectionLoggedByTicket.add(ticket.ticketId);

        ticket.transactionDetected = true;
        ticket.senderTransactionHash = txData.hash;
        ticket.confirmationCount = confirmations;
        ticket.transactionTimedOut = false;

        ticket.messages = ticket.messages.filter(msg =>
          msg.embedData?.actionType !== 'transaction-send'
        );

        addTicketTransactionDetectedMessage(
          ticket,
          txData.hash,
          confirmations,
          requiredConfirmations
        );

        await ticket.save();
        console.log(`💾 Transaction detected and saved for ticket ${ticket.ticketId}\n`);

        if (confirmations >= requiredConfirmations) {
          await updateTransactionConfirmations(ticket, txData.hash, confirmations, requiredConfirmations);
        }
        return;
      }
    }

    blocksScanned += 1;
    if (blocksScanned >= maxBlocksPerScan) {
      break;
    }
  }
};

// Monitor a specific ticket for transactions
export const monitorTicketTransaction = async (ticketId) => {
  try {
    const ticket = await TradeTicket.findOne({ ticketId })
      .populate('creator', 'username userId avatar')
      .populate('participants.user', 'username userId avatar');

    if (!ticket || !ticket.awaitingTransaction || ticket.transactionConfirmed) {
      return;
    }

    console.log(`🔍 Monitoring ticket ${ticketId} - Expecting ${ticket.expectedAmount} USD to ${ticket.botWalletAddress}`);

    const supportedCryptos = ['ethereum', 'litecoin', 'bitcoin'];
    if (!supportedCryptos.includes(ticket.cryptocurrency)) {
      return;
    }

    const timedOut = await handleTicketTimeout(ticket);
    if (timedOut) {
      return;
    }

    if (ticket.cryptocurrency === 'ethereum') {
      await monitorEthTicketTransaction(ticket);
      return;
    }

    if (ticket.cryptocurrency === 'bitcoin' || ticket.cryptocurrency === 'litecoin') {
      await monitorUtxoTicketTransaction(ticket, ticket.cryptocurrency);
    }
  } catch (error) {
    console.error(`❌ Error monitoring ticket ${ticketId}:`, error);
  }
};

// Update confirmation count
const updateTransactionConfirmations = async (ticket, txHash, confirmations, requiredConfirmations = 2) => {
  try {
    ticket.confirmationCount = confirmations;

    // Update the confirmation message
    const confirmingMsg = ticket.messages.find(msg => 
      msg.embedData?.actionType === 'transaction-confirming'
    );

    if (confirmingMsg) {
      confirmingMsg.embedData.metadata = confirmingMsg.embedData.metadata || {};
      confirmingMsg.embedData.metadata.confirmations = confirmations;
      confirmingMsg.embedData.metadata.requiredConfirmations = requiredConfirmations;
      confirmingMsg.embedData.description = `We've detected your transaction!\n\nTransaction Hash: ${txHash.substring(0, 16)}...\n\nConfirmations: ${Math.min(confirmations, requiredConfirmations)}/${requiredConfirmations}`;
      ticket.markModified('messages');
    }

    // If reached required confirmations, mark as confirmed
    if (confirmations >= requiredConfirmations && !ticket.transactionConfirmed) {
      ticket.transactionConfirmed = true;
      
      // Remove confirming message
      ticket.messages = ticket.messages.filter(msg => 
        msg.embedData?.actionType !== 'transaction-confirming'
      );

      await ticket.populate('creator', 'username userId avatar');
      await ticket.populate('participants.user', 'username userId avatar');

      const senderParticipant = ticket.participants.find(p => p.role === 'sender');
      const receiverParticipant = ticket.participants.find(p => p.role === 'receiver');
      const acceptedParticipant = ticket.participants.find(p => p.status === 'accepted');

      let senderUser = null;
      let receiverUser = null;

      if (ticket.creatorRole === 'sender') {
        senderUser = ticket.creator;
        receiverUser = receiverParticipant?.user || acceptedParticipant?.user || null;
      } else if (ticket.creatorRole === 'receiver') {
        receiverUser = ticket.creator;
        senderUser = senderParticipant?.user || acceptedParticipant?.user || null;
      } else {
        senderUser = senderParticipant?.user || null;
        receiverUser = receiverParticipant?.user || null;
      }

      if (!senderUser && ticket.creatorRole === 'sender') {
        senderUser = ticket.creator;
      }

      if (!receiverUser && ticket.creatorRole === 'receiver') {
        receiverUser = ticket.creator;
      }

      // Add confirmed message
      ticket.messages.push({
        isBot: true,
        content: 'Funds Received',
        type: 'embed',
        embedData: {
          title: 'Sender Has Sent Funds',
          description: `@${senderUser?.username || 'Sender'} has successfully sent the funds to Handshake.\n\n<strong>Transaction Confirmed!</strong> (${requiredConfirmations}/${requiredConfirmations} confirmations)\n\nThe bot is now holding <strong>$${ticket.expectedAmount.toFixed(2)} USD</strong> in escrow.\n\n@${receiverUser?.username || 'Receiver'} has been notified.\n\n@${senderUser?.username || 'Sender'}, once the receiver confirms delivery, click the <strong>Release Funds</strong> button below to complete the transaction.`,
          color: 'green',
          requiresAction: true,
          actionType: 'release-funds'
        },
        timestamp: new Date()
      });

      await ticket.save();
      console.log(`âœ… Transaction CONFIRMED for ticket ${ticket.ticketId} (${confirmations} confirmations)\n`);
    } else {
      await ticket.save();
    }
  } catch (error) {
    console.error(`âŒ Error updating confirmations:`, error);
  }
};

// Monitor pass order for payment (UTXO networks)
const monitorUtxoPassOrder = async (orderId, io = null, crypto = 'litecoin') => {
  try {
    const order = await PassOrder.findOne({ orderId }).populate('user', 'username email');

    if (!order || order.status === 'completed' || order.cryptocurrency !== crypto) {
      return;
    }

    const network = getUtxoNetwork(crypto);
    if (!network) {
      console.error(`Unsupported UTXO network for order ${orderId}: ${crypto}`);
      return;
    }

    if (order.status === 'confirmed' && order.transactionHash) {
      await refreshUtxoConfirmations(order, io, crypto);
      return;
    }

    const now = new Date();
    const orderCreatedAt = order.createdAt ? new Date(order.createdAt) : null;
    const earliestAcceptable = orderCreatedAt
      ? new Date(orderCreatedAt.getTime() - 2 * 60 * 1000)
      : null;
    
    // Check if 10-minute timeout has been reached (no transaction detected yet)
    if (order.timeoutDetails?.timeoutAt && !order.transactionHash && !order.timeoutDetails.timedOut) {
      const timeoutDate = new Date(order.timeoutDetails.timeoutAt);
      
      if (now >= timeoutDate) {
        console.log(`Timeout reached for ${network.symbol} pass order ${orderId} - No transaction detected`);
        order.timeoutDetails.timedOut = true;
        order.status = 'timedout';
        order.timeoutDetails.paymentNotes = 'No transaction detected within 10-minute window.';
        await order.save();
        return;
      }
    }

    // Check if order has expired (30 minutes total)
    if (now > order.expiresAt && order.status === 'pending') {
      console.log(`${network.symbol} pass order ${orderId} expired without payment (30 min expiry)`);
      order.status = 'expired';
      await order.save();
      return;
    }
    
    // Stop monitoring if already timed out
    if (order.status === 'timedout') {
      return;
    }

    console.log(`Monitoring ${network.symbol} pass order ${orderId} - Expecting ${order.cryptoAmount} ${network.symbol} to ${order.paymentAddress}`);

    const addressData = await getAddressTransactions(order.paymentAddress, crypto);
    if (!addressData) {
      return;
    }

    const txrefs = [
      ...(addressData.txrefs || []),
      ...(addressData.unconfirmed_txrefs || [])
    ];

    if (txrefs.length === 0) {
      console.log(`   No transactions found yet for ${order.paymentAddress}`);
      return;
    }

    console.log(`   Found ${txrefs.length} transaction(s) to analyze`);

    let matched = false;
    let duplicateMatch = null;

    // Look for matching incoming transactions
    for (const txRef of txrefs) {
      if (txRef.tx_output_n === -1) continue; // Skip outgoing transactions
      
      const txHash = txRef.tx_hash;
      if (!txHash) continue;

      const txDetails = getUtxoTxDetails(addressData, txHash);
      const txTimestamp = getUtxoTxTimestamp(txRef, txDetails);
      if (txTimestamp && earliestAcceptable && txTimestamp < earliestAcceptable) {
        continue;
      }

      // Skip if already processed this transaction
      if (order.transactionHash === txHash) {
        // Update confirmations if still confirming
        if (order.status === 'confirmed') {
          const confirmations = txRef.confirmations || 0;
          const reachedRequired = confirmations >= network.confirmationsRequired;
          
          // Update order confirmations in database
          if (order.confirmations !== confirmations) {
            order.confirmations = confirmations;
            await order.save();
          }
          
          // Emit confirmation progress to frontend
          if (io && !reachedRequired) {
            io.emit(`pass_order_update:${orderId}`, {
              orderId,
              status: 'confirming',
              confirmations,
              required: network.confirmationsRequired,
              transactionHash: txHash
            });
          }
          
          if (reachedRequired) {
            console.log(`${network.symbol} transaction reached ${confirmations} confirmations`);
            const success = await completePassOrder(orderId, txHash, io);
            if (success) {
              console.log(`${network.symbol} pass order ${orderId} completed successfully`);
            }
          } else {
            console.log(`   Waiting for confirmations: ${confirmations}/${network.confirmationsRequired}`);
          }
        }
        continue;
      }

      // Check if amount matches with 2% tolerance
      const expectedAmount = order.cryptoAmount;
      const expectedUSD = order.priceUSD;
      const matchResult = isUtxoAmountMatch(txRef.value, expectedAmount, expectedUSD, crypto);

      if (txHash) {
        const existingOrder = await PassOrder.findOne({
          transactionHash: txHash,
          orderId: { $ne: orderId }
        }).select('orderId status');

        if (existingOrder) {
          if (matchResult.isMatch && !duplicateMatch) {
            duplicateMatch = { txHash, orderId: existingOrder.orderId };
          }
          continue;
        }
      }
      
      if (matchResult.isMatch) {
        const confirmations = txRef.confirmations || 0;
        const fromAddress = getUtxoFromAddress(txDetails);
        const networkFee = getUtxoNetworkFee(txDetails);
        const explorerLink = getBlockCypherTxLink(txHash, crypto);
        
        console.log(`${network.symbol} payment found for pass order ${orderId}`);
        console.log(`   User: ${order.user.username}`);
        console.log(`   TX Hash: ${txHash.slice(0, 16)}...`);
        console.log(`   Amount: ${matchResult.receivedCrypto.toFixed(8)} ${network.symbol}`);
        console.log(`   Expected: ${matchResult.expectedCrypto.toFixed(8)} ${network.symbol}`);
        console.log(`   Difference: ${matchResult.difference.toFixed(8)} ${network.symbol} (${matchResult.percentDiff.toFixed(2)}%)`);
        console.log(`   Confirmations: ${confirmations}/${network.confirmationsRequired}`);
        
        // Save detailed transaction information for business records
        order.transactionHash = txHash;
        order.transactionDetails = {
          detectedAt: new Date(),
          actualAmountReceived: txRef.value,
          actualAmountReceivedCrypto: matchResult.receivedCrypto,
          expectedAmount: matchResult.expectedCrypto,
          amountDifference: matchResult.difference,
          percentageDifference: matchResult.percentDiff,
          networkFee: networkFee ?? undefined,
          blockHeight: txRef.block_height,
          fromAddress: fromAddress || 'unknown',
          isOverpayment: matchResult.receivedCrypto > matchResult.expectedCrypto,
          isUnderpayment: matchResult.receivedCrypto < matchResult.expectedCrypto,
          paymentNotes: `${network.symbol} payment on testnet. BlockCypher: ${explorerLink || 'n/a'}`
        };

        // Emit transaction detected event
        if (io) {
          io.emit(`pass_order_update:${orderId}`, {
            orderId,
            status: 'detected',
            transactionHash: txHash,
            amount: matchResult.receivedCrypto,
            confirmations,
            required: network.confirmationsRequired,
            etherscanLink: explorerLink
          });
        }

        if (confirmations >= network.confirmationsRequired) {
          order.confirmations = confirmations;
          await order.save();
          // Complete the order immediately
          const success = await completePassOrder(orderId, txHash, io);
          if (success) {
            console.log(`${network.symbol} pass order ${orderId} completed successfully`);
          }
        } else {
          // Mark as confirmed, waiting for more confirmations
          order.confirmations = confirmations;
          order.status = 'confirmed';
          await order.save();
          try {
            await upsertPassTransactionHistory(order, 'pending');
          } catch (historyError) {
            console.error('Error updating pass transaction history:', historyError);
          }
          console.log(`   Order marked as confirmed, waiting for ${network.confirmationsRequired} confirmations`);
        }
        matched = true;
        break;
      } else {
        // Transaction found but amount doesn't match
        const receivedCrypto = txRef.value / 100000000;
        const isUnderpayment = receivedCrypto < matchResult.expectedCrypto;
        const isOverpayment = receivedCrypto > matchResult.expectedCrypto;
        const explorerLink = getBlockCypherTxLink(txHash, crypto);
        
        if (isUnderpayment && Math.abs(matchResult.percentDiff) > 2) {
          console.log(`UNDERPAYMENT detected for ${network.symbol} order ${orderId}`);
          console.log(`   Expected: ${matchResult.expectedCrypto.toFixed(8)} ${network.symbol}`);
          console.log(`   Received: ${receivedCrypto.toFixed(8)} ${network.symbol}`);
          console.log(`   Shortfall: ${(matchResult.expectedCrypto - receivedCrypto).toFixed(8)} ${network.symbol}`);
          console.log(`   Order will NOT be processed - payment insufficient`);
          
          // Mark order as failed due to underpayment and save details
          if (order.status === 'pending') {
            const fromAddress = getUtxoFromAddress(txDetails);
            const networkFee = getUtxoNetworkFee(txDetails);

            order.status = 'failed';
            order.transactionHash = txHash;
            order.transactionDetails = {
              detectedAt: new Date(),
              actualAmountReceived: txRef.value,
              actualAmountReceivedCrypto: receivedCrypto,
              expectedAmount: matchResult.expectedCrypto,
              amountDifference: matchResult.difference,
              percentageDifference: matchResult.percentDiff,
              networkFee: networkFee ?? undefined,
              blockHeight: txRef.block_height,
              fromAddress: fromAddress || 'unknown',
              isUnderpayment: true,
              paymentNotes: `UNDERPAYMENT: Received ${receivedCrypto.toFixed(8)} ${network.symbol}, expected ${matchResult.expectedCrypto.toFixed(8)} ${network.symbol}. Shortfall: ${(matchResult.expectedCrypto - receivedCrypto).toFixed(8)} ${network.symbol}. BlockCypher: ${explorerLink || 'n/a'}`
            };
            await order.save();

            if (io) {
              io.emit(`pass_order_update:${orderId}`, {
                orderId,
                status: 'failed',
                transactionHash: txHash,
                message: `Underpayment detected. Sent ${receivedCrypto.toFixed(8)} ${network.symbol}, expected ${matchResult.expectedCrypto.toFixed(8)} ${network.symbol}. Please contact staff.`
              });
            }
          }
          matched = true;
          break;
        } else if (isOverpayment && Math.abs(matchResult.percentDiff) > 2) {
          console.log(`OVERPAYMENT detected for ${network.symbol} order ${orderId}`);
          console.log(`   Expected: ${matchResult.expectedCrypto.toFixed(8)} ${network.symbol}`);
          console.log(`   Received: ${receivedCrypto.toFixed(8)} ${network.symbol}`);
          console.log(`   Excess: ${(receivedCrypto - matchResult.expectedCrypto).toFixed(8)} ${network.symbol}`);
          console.log(`   Order will be processed (user paid more than required)`);
          
          const fromAddress = getUtxoFromAddress(txDetails);
          const networkFee = getUtxoNetworkFee(txDetails);

          // Process order anyway since user overpaid, save details
          order.transactionHash = txHash;
          order.transactionDetails = {
            detectedAt: new Date(),
            actualAmountReceived: txRef.value,
            actualAmountReceivedCrypto: receivedCrypto,
            expectedAmount: matchResult.expectedCrypto,
            amountDifference: matchResult.difference,
            percentageDifference: matchResult.percentDiff,
            networkFee: networkFee ?? undefined,
            blockHeight: txRef.block_height,
            fromAddress: fromAddress || 'unknown',
            isOverpayment: true,
            paymentNotes: `OVERPAYMENT: Received ${receivedCrypto.toFixed(8)} ${network.symbol}, expected ${matchResult.expectedCrypto.toFixed(8)} ${network.symbol}. Excess: ${(receivedCrypto - matchResult.expectedCrypto).toFixed(8)} ${network.symbol}. BlockCypher: ${explorerLink || 'n/a'}`
          };
          
          // Emit overpayment detected event
          if (io) {
            io.emit(`pass_order_update:${orderId}`, {
              orderId,
              status: 'detected',
              transactionHash: txHash,
              amount: receivedCrypto,
              isOverpayment: true,
              confirmations: txRef.confirmations || 0,
              required: network.confirmationsRequired,
              etherscanLink: explorerLink
            });
          }
          
          if ((txRef.confirmations || 0) >= network.confirmationsRequired) {
            order.confirmations = txRef.confirmations || 0;
            await order.save();
            const success = await completePassOrder(orderId, txHash, io);
            if (success) {
              console.log(`${network.symbol} pass order ${orderId} completed with overpayment`);
            }
          } else {
            order.confirmations = txRef.confirmations || 0;
            order.status = 'confirmed';
            await order.save();
            try {
              await upsertPassTransactionHistory(order, 'pending');
            } catch (historyError) {
              console.error('Error updating pass transaction history:', historyError);
            }
          }
          matched = true;
          break;
        }
      }
    }

    if (!matched && duplicateMatch && order.status === 'pending') {
      order.status = 'awaiting-staff';
      order.timeoutDetails = {
        ...(order.timeoutDetails || {}),
        staffContactRequested: true,
        manualVerification: true,
        staffNotes: `Duplicate transaction hash ${duplicateMatch.txHash} already linked to order ${duplicateMatch.orderId}.`
      };
      order.transactionDetails = {
        ...(order.transactionDetails || {}),
        detectedAt: order.transactionDetails?.detectedAt || new Date(),
        paymentNotes: `Duplicate transaction hash ${duplicateMatch.txHash} already linked to order ${duplicateMatch.orderId}. Manual review required.`
      };
      await order.save();

      if (io) {
        io.emit(`pass_order_update:${orderId}`, {
          orderId,
          status: 'awaiting-staff',
          transactionHash: duplicateMatch.txHash,
          message: `Payment requires manual review. A matching transaction is already linked to another order (${duplicateMatch.orderId}).`
        });
      }
    }
  } catch (error) {
    console.error(`Error monitoring ${crypto} pass order ${orderId}:`, error);
  }
};

export const monitorPassOrder = async (orderId, io = null) => {
  await monitorUtxoPassOrder(orderId, io, 'litecoin');
};

export const monitorBitcoinPassOrder = async (orderId, io = null) => {
  await monitorUtxoPassOrder(orderId, io, 'bitcoin');
};

// ============================================
// ETHEREUM MONITORING FUNCTIONS (SEPOLIA TESTNET / MAINNET)
// ============================================

// Get Ethereum provider based on network mode
const getEthProvider = () => {
  const config = ETH_RPC_CONFIG[ETH_NETWORK_MODE];
  if (!config || !config.rpcUrl || config.rpcUrl.includes('YOUR_INFURA_API_KEY')) {
    console.warn('âš ï¸  Ethereum RPC URL not configured. Set SEPOLIA_RPC_URL in .env file');
    return null;
  }
  return new ethers.JsonRpcProvider(config.rpcUrl);
};

// Convert USD to Ethereum (using configured test rate for Sepolia)
const convertUSDToETH = (usdAmount, exchangeRate = getExchangeRate('ethereum')) => {
  return (usdAmount / exchangeRate).toFixed(8);
};

// Check if Ethereum amount matches expected (with 2% tolerance)
const isEthAmountMatch = (receivedWei, expectedETH, expectedUSD) => {
  const receivedETH = parseFloat(ethers.formatEther(receivedWei)); // Convert wei to ETH
  const expectedValue = parseFloat(expectedETH);
  
  // 2% tolerance for price fluctuations
  const tolerance = expectedValue * 0.02;
  const minAcceptable = expectedValue - tolerance;
  const maxAcceptable = expectedValue + tolerance;
  
  const difference = Math.abs(receivedETH - expectedValue);
  const isMatch = receivedETH >= minAcceptable && receivedETH <= maxAcceptable;
  
  if (isMatch && difference > 0) {
    console.log(`   â„¹ï¸  Amount within 2% tolerance: ${difference.toFixed(8)} ETH difference (max: ${tolerance.toFixed(8)} ETH)`);
  }
  
  return {
    isMatch,
    receivedETH,
    expectedETH: expectedValue,
    difference,
    tolerance,
    percentDiff: (difference / expectedValue) * 100
  };
};

const refreshEthConfirmations = async (order, io, provider, config) => {
  if (!order?.transactionHash) {
    return false;
  }

  try {
    await upsertPassTransactionHistory(order, 'pending');
  } catch (historyError) {
    console.error('Error updating pass transaction history:', historyError);
  }

  const receipt = await provider.getTransactionReceipt(order.transactionHash);
  if (!receipt || !receipt.blockNumber) {
    return false;
  }

  const currentBlock = await provider.getBlockNumber();
  const confirmations = currentBlock - receipt.blockNumber + 1;
  const reachedRequired = confirmations >= config.confirmationsRequired;
  let shouldSave = false;

  if (order.confirmations !== confirmations) {
    order.confirmations = confirmations;
    shouldSave = true;
  }

  if (!reachedRequired && order.status !== 'confirmed') {
    order.status = 'confirmed';
    shouldSave = true;
  }

  if (shouldSave) {
    await order.save();
  }

  if (io && !reachedRequired) {
    io.emit(`pass_order_update:${order.orderId}`, {
      orderId: order.orderId,
      status: 'confirming',
      confirmations,
      required: config.confirmationsRequired,
      transactionHash: order.transactionHash
    });
  }

  if (reachedRequired) {
    order.confirmations = confirmations;
    await order.save();
    const success = await completePassOrder(order.orderId, order.transactionHash, io);
    if (success) {
      console.log(`Ethereum pass order ${order.orderId} completed successfully`);
    }
  }

  return true;
};

// Monitor Ethereum pass order for payment
export const monitorEthPassOrder = async (orderId, io = null) => {
  try {
    const order = await PassOrder.findOne({ orderId }).populate('user', 'username email');

    if (!order || order.status === 'completed' || order.cryptocurrency !== 'ethereum') {
      return;
    }

    const provider = getEthProvider();
    if (!provider) {
      console.error('âŒ Ethereum provider not available. Please configure RPC URL.');
      return;
    }

    const config = ETH_RPC_CONFIG[ETH_NETWORK_MODE];
    if (order.status === 'confirmed' && order.transactionHash) {
      await refreshEthConfirmations(order, io, provider, config);
      return;
    }

    const now = new Date();
    const orderCreatedAt = order.createdAt ? new Date(order.createdAt) : null;
    const earliestAcceptable = orderCreatedAt
      ? new Date(orderCreatedAt.getTime() - 2 * 60 * 1000)
      : null;
    
    // Check if 10-minute timeout has been reached (no transaction detected yet)
    if (order.timeoutDetails?.timeoutAt && !order.transactionHash && !order.timeoutDetails.timedOut) {
      const timeoutDate = new Date(order.timeoutDetails.timeoutAt);
      
      if (now >= timeoutDate) {
        console.log(`â° 10-minute timeout reached for Ethereum pass order ${orderId} - No transaction detected`);
        order.timeoutDetails.timedOut = true;
        order.status = 'timedout';
        order.timeoutDetails.paymentNotes = 'No transaction detected within 10-minute window.';
        await order.save();
        
        console.log(`â±ï¸  Order ${orderId} marked as timedout`);
        return;
      }
    }

    // Check if order has expired (30 minutes total)
    if (now > order.expiresAt && order.status === 'pending') {
      console.log(`â° Ethereum pass order ${orderId} expired without payment (30 min expiry)`);
      order.status = 'expired';
      await order.save();
      return;
    }
    
    // Stop monitoring if already timed out
    if (order.status === 'timedout') {
      return;
    }

    console.log(`ðŸ” Monitoring Ethereum pass order ${orderId} - Expecting ${order.cryptoAmount} ETH ($${order.priceUSD}) to ${order.paymentAddress}`);
    console.log(`   Network: ${config.name.toUpperCase()}, Explorer: ${config.blockExplorer}`);

    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    
    // Search last 100 blocks for transactions (about 20 minutes on Ethereum)
    const searchFromBlock = Math.max(0, currentBlock - 100);
    
    console.log(`   Scanning blocks ${searchFromBlock} to ${currentBlock} for transactions...`);
    
    // Scan recent blocks for transactions to our address
    let foundTransactions = [];
    
    // Check recent blocks (batching to avoid rate limits)
    for (let blockNum = currentBlock; blockNum >= searchFromBlock && foundTransactions.length === 0; blockNum--) {
      try {
        const block = await provider.getBlock(blockNum, true); // true = include transactions
        
        if (block && block.transactions) {
          // Filter transactions sent to our payment address
          for (const txHash of block.transactions) {
            if (typeof txHash === 'string') {
              // Hash only, need to fetch full transaction
              const tx = await provider.getTransaction(txHash);
              if (tx && tx.to && tx.to.toLowerCase() === order.paymentAddress.toLowerCase()) {
                tx.blockTimestamp = block.timestamp;
                foundTransactions.push(tx);
              }
            } else if (txHash.to && txHash.to.toLowerCase() === order.paymentAddress.toLowerCase()) {
              // Full transaction object
              txHash.blockTimestamp = block.timestamp;
              foundTransactions.push(txHash);
            }
          }
        }
        
        // Only scan last 20 blocks per cycle to avoid rate limits
        if (currentBlock - blockNum >= 20) {
          break;
        }
      } catch (err) {
        console.log(`   Warning: Error scanning block ${blockNum}: ${err.message}`);
        break; // Stop scanning on error
      }
    }
    
    if (foundTransactions.length === 0) {
      console.log(`   No transactions found yet for ${order.paymentAddress}`);
      return;
    }

    console.log(`   Found ${foundTransactions.length} transaction(s) to analyze`);

    // Check each transaction
    let matched = false;
    let duplicateMatch = null;
    for (const tx of foundTransactions) {
      // Skip if we've already processed this transaction
      if (order.transactionHash === tx.hash) {
        // Update confirmations if still confirming
        if (order.status === 'confirmed') {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          if (receipt && receipt.blockNumber) {
            const confirmations = currentBlock - receipt.blockNumber + 1;
            const reachedRequired = confirmations >= config.confirmationsRequired;
            
            // Update order confirmations in database
            if (order.confirmations !== confirmations) {
              order.confirmations = confirmations;
              await order.save();
            }
            
            // Emit confirmation progress to frontend
            if (io && !reachedRequired) {
              io.emit(`pass_order_update:${orderId}`, {
                orderId,
                status: 'confirming',
                confirmations,
                required: config.confirmationsRequired,
                transactionHash: tx.hash
              });
            }
            
            if (reachedRequired) {
              console.log(`?o. Ethereum transaction reached ${confirmations} confirmations!`);
              const success = await completePassOrder(orderId, tx.hash, io);
              if (success) {
                console.log(`?YZ% Ethereum pass order ${orderId} completed successfully!\n`);
              }
            } else {
              console.log(`   ??? Waiting for confirmations: ${confirmations}/${config.confirmationsRequired}`);
            }
          }
        }
        continue;
      }

      const txTimestamp = tx.blockTimestamp ? new Date(tx.blockTimestamp * 1000) : null;
      if (txTimestamp && earliestAcceptable && txTimestamp < earliestAcceptable) {
        continue;
      }

      // Only process transactions TO our payment address
      if (tx.to && tx.to.toLowerCase() !== order.paymentAddress.toLowerCase()) {
        continue;
      }

      // Check if transaction was successful (not reverted)
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (!receipt || receipt.status !== 1) {
        console.log(`   âš ï¸  Transaction ${tx.hash.slice(0, 16)}... failed or reverted, skipping`);
        continue;
      }

      const confirmations = currentBlock - receipt.blockNumber + 1;
      const expectedETH = order.cryptoAmount;
      const expectedUSD = order.priceUSD;
      
      // Validate amount
      const matchResult = isEthAmountMatch(tx.value, expectedETH, expectedUSD);

      if (tx.hash) {
        const existingOrder = await PassOrder.findOne({
          transactionHash: tx.hash,
          orderId: { $ne: orderId }
        }).select('orderId status');

        if (existingOrder) {
          if (matchResult.isMatch && !duplicateMatch) {
            duplicateMatch = { txHash: tx.hash, orderId: existingOrder.orderId };
          }
          continue;
        }
      }

      if (matchResult.isMatch) {
        console.log(`âœ… Ethereum payment found!`);
        console.log(`   Order ID: ${orderId}`);
        console.log(`   User: ${order.user.username}`);
        console.log(`   TX Hash: ${tx.hash}`);
        console.log(`   Amount: ${matchResult.receivedETH.toFixed(8)} ETH`);
        console.log(`   Expected: ${matchResult.expectedETH.toFixed(8)} ETH`);
        console.log(`   Difference: ${matchResult.difference.toFixed(8)} ETH (${matchResult.percentDiff.toFixed(2)}%)`);
        console.log(`   Block: ${receipt.blockNumber}`);
        console.log(`   Confirmations: ${confirmations}/${config.confirmationsRequired}`);
        console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
        console.log(`   Gas Price: ${ethers.formatUnits(tx.gasPrice || 0, 'gwei')} Gwei`);
        console.log(`   Etherscan: ${config.blockExplorer}/tx/${tx.hash}`);
        
        // Calculate gas fee in ETH
        const gasFee = receipt.gasUsed * (tx.gasPrice || 0n);
        const gasFeeETH = parseFloat(ethers.formatEther(gasFee));
        
        // Save detailed transaction information
        order.transactionHash = tx.hash;
        order.transactionDetails = {
          detectedAt: new Date(),
          actualAmountReceived: tx.value.toString(), // Store as string to preserve precision
          actualAmountReceivedCrypto: matchResult.receivedETH,
          expectedAmount: matchResult.expectedETH,
          amountDifference: matchResult.difference,
          percentageDifference: matchResult.percentDiff,
          networkFee: gasFeeETH,
          blockHeight: receipt.blockNumber,
          fromAddress: tx.from,
          isOverpayment: matchResult.receivedETH > matchResult.expectedETH,
          isUnderpayment: matchResult.receivedETH < matchResult.expectedETH,
          paymentNotes: `Ethereum payment on ${config.name}. Gas fee: ${gasFeeETH.toFixed(8)} ETH. Etherscan: ${config.blockExplorer}/tx/${tx.hash}`
        };

        // Emit transaction detected event
        if (io) {
          io.emit(`pass_order_update:${orderId}`, {
            orderId,
            status: 'detected',
            transactionHash: tx.hash,
            amount: matchResult.receivedETH,
            confirmations: 0,
            required: config.confirmationsRequired,
            etherscanLink: `${config.blockExplorer}/tx/${tx.hash}`
          });
        }

        if (confirmations >= config.confirmationsRequired) {
          order.confirmations = confirmations;
          await order.save();

          // Complete the order immediately
          const success = await completePassOrder(orderId, tx.hash, io);
          if (success) {
            console.log(`ðŸŽ‰ Ethereum pass order ${orderId} completed successfully!\n`);
          }
        } else {
          // Mark as confirmed, waiting for more confirmations
          order.confirmations = confirmations;
          order.status = 'confirmed';
          await order.save();
          try {
            await upsertPassTransactionHistory(order, 'pending');
          } catch (historyError) {
            console.error('Error updating pass transaction history:', historyError);
          }
          console.log(`   ðŸ•’ Order marked as confirmed, waiting for ${config.confirmationsRequired} confirmations\n`);
        }
        matched = true;
        break;
      } else {
        // Transaction found but amount doesn't match
        const isUnderpayment = matchResult.receivedETH < matchResult.expectedETH;
        const isOverpayment = matchResult.receivedETH > matchResult.expectedETH;
        
        if (isUnderpayment && Math.abs(matchResult.percentDiff) > 2) {
          console.log(`âš ï¸  UNDERPAYMENT detected for Ethereum order ${orderId}`);
          console.log(`   Expected: ${matchResult.expectedETH.toFixed(8)} ETH`);
          console.log(`   Received: ${matchResult.receivedETH.toFixed(8)} ETH`);
          console.log(`   Shortfall: ${(matchResult.expectedETH - matchResult.receivedETH).toFixed(8)} ETH`);
          console.log(`   âŒ Order will NOT be processed - payment insufficient\n`);
          console.log(`   Etherscan: ${config.blockExplorer}/tx/${tx.hash}`);
          
          if (order.status === 'pending') {
            const gasFee = receipt.gasUsed * (tx.gasPrice || 0n);
            const gasFeeETH = parseFloat(ethers.formatEther(gasFee));
            
            order.status = 'failed';
            order.transactionHash = tx.hash;
            order.transactionDetails = {
              detectedAt: new Date(),
              actualAmountReceived: tx.value.toString(),
              actualAmountReceivedCrypto: matchResult.receivedETH,
              expectedAmount: matchResult.expectedETH,
              amountDifference: matchResult.difference,
              percentageDifference: matchResult.percentDiff,
              networkFee: gasFeeETH,
              blockHeight: receipt.blockNumber,
              fromAddress: tx.from,
              isUnderpayment: true,
              paymentNotes: `UNDERPAYMENT: Received ${matchResult.receivedETH.toFixed(8)} ETH, expected ${matchResult.expectedETH.toFixed(8)} ETH. Shortfall: ${(matchResult.expectedETH - matchResult.receivedETH).toFixed(8)} ETH. Etherscan: ${config.blockExplorer}/tx/${tx.hash}`
            };
            await order.save();

            if (io) {
              io.emit(`pass_order_update:${orderId}`, {
                orderId,
                status: 'failed',
                transactionHash: tx.hash,
                message: `Underpayment detected. Sent ${matchResult.receivedETH.toFixed(8)} ETH, expected ${matchResult.expectedETH.toFixed(8)} ETH. Please contact staff.`
              });
            }
          }
          matched = true;
          break;
        } else if (isOverpayment && Math.abs(matchResult.percentDiff) > 2) {
          console.log(`âœ… OVERPAYMENT detected for Ethereum order ${orderId}`);
          console.log(`   Expected: ${matchResult.expectedETH.toFixed(8)} ETH`);
          console.log(`   Received: ${matchResult.receivedETH.toFixed(8)} ETH`);
          console.log(`   Excess: ${(matchResult.receivedETH - matchResult.expectedETH).toFixed(8)} ETH`);
          console.log(`   âœ… Order will be processed (user paid more than required)\n`);
          console.log(`   Etherscan: ${config.blockExplorer}/tx/${tx.hash}`);
          
          const gasFee = receipt.gasUsed * (tx.gasPrice || 0n);
          const gasFeeETH = parseFloat(ethers.formatEther(gasFee));
          
          order.transactionHash = tx.hash;
          order.transactionDetails = {
            detectedAt: new Date(),
            actualAmountReceived: tx.value.toString(),
            actualAmountReceivedCrypto: matchResult.receivedETH,
            expectedAmount: matchResult.expectedETH,
            amountDifference: matchResult.difference,
            percentageDifference: matchResult.percentDiff,
            networkFee: gasFeeETH,
            blockHeight: receipt.blockNumber,
            fromAddress: tx.from,
            isOverpayment: true,
            paymentNotes: `OVERPAYMENT: Received ${matchResult.receivedETH.toFixed(8)} ETH, expected ${matchResult.expectedETH.toFixed(8)} ETH. Excess: ${(matchResult.receivedETH - matchResult.expectedETH).toFixed(8)} ETH. Etherscan: ${config.blockExplorer}/tx/${tx.hash}`
          };
          
          // Emit overpayment detected event
          if (io) {
            io.emit(`pass_order_update:${orderId}`, {
              orderId,
              status: 'detected',
              transactionHash: tx.hash,
              amount: matchResult.receivedETH,
              isOverpayment: true,
              confirmations,
              required: config.confirmationsRequired,
              etherscanLink: `${config.blockExplorer}/tx/${tx.hash}`
            });
          }
          
          if (confirmations >= config.confirmationsRequired) {
            order.confirmations = confirmations;
            await order.save();
            const success = await completePassOrder(orderId, tx.hash, io);
            if (success) {
              console.log(`ðŸŽ‰ Ethereum pass order ${orderId} completed with overpayment!\n`);
            }
          } else {
            order.confirmations = confirmations;
            order.status = 'confirmed';
            await order.save();
            try {
              await upsertPassTransactionHistory(order, 'pending');
            } catch (historyError) {
              console.error('Error updating pass transaction history:', historyError);
            }
          }
          matched = true;
          break;
        }
      }
    }
    if (!matched && duplicateMatch && order.status === 'pending') {
      order.status = 'awaiting-staff';
      order.timeoutDetails = {
        ...(order.timeoutDetails || {}),
        staffContactRequested: true,
        manualVerification: true,
        staffNotes: `Duplicate transaction hash ${duplicateMatch.txHash} already linked to order ${duplicateMatch.orderId}.`
      };
      order.transactionDetails = {
        ...(order.transactionDetails || {}),
        detectedAt: order.transactionDetails?.detectedAt || new Date(),
        paymentNotes: `Duplicate transaction hash ${duplicateMatch.txHash} already linked to order ${duplicateMatch.orderId}. Manual review required.`
      };
      await order.save();

      if (io) {
        io.emit(`pass_order_update:${orderId}`, {
          orderId,
          status: 'awaiting-staff',
          transactionHash: duplicateMatch.txHash,
          message: `Payment requires manual review. A matching transaction is already linked to another order (${duplicateMatch.orderId}).`
        });
      }
    }

  } catch (error) {
    console.error(`âŒ Error monitoring Ethereum pass order ${orderId}:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
};

// Start monitoring all awaiting tickets
export const startTransactionMonitoring = (io) => {
  console.log('Starting transaction monitoring service...');
  console.log('   Bitcoin: TESTNET (BlockCypher API)');
  console.log('   Litecoin: TESTNET (BlockCypher API)');
  console.log(`   Ethereum: ${ETH_NETWORK_MODE.toUpperCase()} (${ETH_RPC_CONFIG[ETH_NETWORK_MODE].name})`);
  console.log('   Monitoring interval: Every 3 seconds\n');
  
  // Run every 3 seconds for faster confirmation updates
  cron.schedule('*/3 * * * * *', async () => {
    try {
      // Find all tickets awaiting transactions
      const awaitingTickets = await TradeTicket.find({
        awaitingTransaction: true,
        transactionConfirmed: false,
        botWalletAddress: { $ne: null }
      }).select('ticketId botWalletAddress expectedAmount transactionHash confirmationCount');

      const now = new Date();

      // Find all pending Litecoin pass orders (exclude completed/failed)
      const pendingLTCOrders = await PassOrder.find({
        cryptocurrency: 'litecoin',
        $or: [
          { status: 'confirmed' },
          { status: { $in: ['pending', 'awaiting-staff'] }, expiresAt: { $gt: now } }
        ]
      }).select('orderId paymentAddress cryptoAmount priceUSD status timeoutDetails');

      // Find all pending Bitcoin pass orders (exclude completed/failed)
      const pendingBTCOrders = await PassOrder.find({
        cryptocurrency: 'bitcoin',
        $or: [
          { status: 'confirmed' },
          { status: { $in: ['pending', 'awaiting-staff'] }, expiresAt: { $gt: now } }
        ]
      }).select('orderId paymentAddress cryptoAmount priceUSD status timeoutDetails');

      // Find all pending Ethereum pass orders (exclude completed/failed)
      const pendingETHOrders = await PassOrder.find({
        cryptocurrency: 'ethereum',
        $or: [
          { status: 'confirmed' },
          { status: { $in: ['pending', 'awaiting-staff'] }, expiresAt: { $gt: now } }
        ]
      }).select('orderId paymentAddress cryptoAmount priceUSD status timeoutDetails');

      const totalMonitoring = awaitingTickets.length + pendingLTCOrders.length + pendingBTCOrders.length + pendingETHOrders.length;

      if (totalMonitoring > 0) {
        console.log(`Checking ${awaitingTickets.length} ticket(s), ${pendingLTCOrders.length} LTC order(s), ${pendingBTCOrders.length} BTC order(s), ${pendingETHOrders.length} ETH order(s)...`);
        
        for (const ticket of awaitingTickets) {
          await monitorTicketTransaction(ticket.ticketId);
        }

        for (const order of pendingLTCOrders) {
          await monitorPassOrder(order.orderId, io);
        }

        for (const order of pendingBTCOrders) {
          await monitorBitcoinPassOrder(order.orderId, io);
        }

        for (const order of pendingETHOrders) {
          await monitorEthPassOrder(order.orderId, io);
        }
      }
    } catch (error) {
      console.error('Error in monitoring cron job:', error);
    }
  });
};
