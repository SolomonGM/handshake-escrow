const truncateHash = (hash) => String(hash || '').slice(0, 16);

const findTicketRoleUsers = (ticket) => {
  const senderParticipant = ticket.participants?.find((participant) => participant.role === 'sender');
  const receiverParticipant = ticket.participants?.find((participant) => participant.role === 'receiver');
  const acceptedParticipant = ticket.participants?.find((participant) => participant.status === 'accepted');

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

  return { senderUser, receiverUser };
};

export const addTicketTransactionDetectedMessage = (
  ticket,
  txHash,
  confirmations,
  requiredConfirmations
) => {
  const existing = ticket.messages?.find(
    (message) => message.embedData?.actionType === 'transaction-confirming'
  );

  if (existing) {
    existing.embedData.metadata = existing.embedData.metadata || {};
    existing.embedData.metadata.txHash = txHash;
    existing.embedData.metadata.confirmations = confirmations;
    existing.embedData.metadata.requiredConfirmations = requiredConfirmations;
    existing.embedData.description = `We've detected your transaction!\n\nTransaction Hash: ${truncateHash(txHash)}...\n\nConfirmations: ${Math.min(confirmations, requiredConfirmations)}/${requiredConfirmations}`;
    ticket.markModified?.('messages');
    return;
  }

  ticket.messages.push({
    isBot: true,
    content: 'Transaction Detected',
    type: 'embed',
    embedData: {
      title: 'Transaction Detected',
      description: `We've detected your transaction!\n\nTransaction Hash: ${truncateHash(txHash)}...\n\nWaiting for confirmations...`,
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

export const updateTicketTransactionConfirmations = async (
  ticket,
  txHash,
  confirmations,
  requiredConfirmations = 2
) => {
  ticket.transactionDetected = true;
  ticket.senderTransactionHash = txHash;
  ticket.confirmationCount = confirmations;
  ticket.transactionTimedOut = false;
  ticket.messages = (ticket.messages || []).filter(
    (message) => message.embedData?.actionType !== 'transaction-send'
  );

  const confirmingMsg = ticket.messages.find(
    (message) => message.embedData?.actionType === 'transaction-confirming'
  );

  if (confirmingMsg) {
    confirmingMsg.embedData.metadata = confirmingMsg.embedData.metadata || {};
    confirmingMsg.embedData.metadata.txHash = txHash;
    confirmingMsg.embedData.metadata.confirmations = confirmations;
    confirmingMsg.embedData.metadata.requiredConfirmations = requiredConfirmations;
    confirmingMsg.embedData.description = `We've detected your transaction!\n\nTransaction Hash: ${truncateHash(txHash)}...\n\nConfirmations: ${Math.min(confirmations, requiredConfirmations)}/${requiredConfirmations}`;
    ticket.markModified('messages');
  } else {
    addTicketTransactionDetectedMessage(ticket, txHash, confirmations, requiredConfirmations);
  }

  if (confirmations >= requiredConfirmations && !ticket.transactionConfirmed) {
    ticket.transactionConfirmed = true;
    ticket.awaitingTransaction = false;
    ticket.messages = ticket.messages.filter(
      (message) => message.embedData?.actionType !== 'transaction-confirming'
    );

    await ticket.populate('creator', 'username userId avatar');
    await ticket.populate('participants.user', 'username userId avatar');

    const { senderUser, receiverUser } = findTicketRoleUsers(ticket);
    const expectedAmount = Number(ticket.expectedAmount || 0);

    ticket.messages.push({
      isBot: true,
      content: 'Funds Received',
      type: 'embed',
      embedData: {
        title: 'Sender Has Sent Funds',
        description: `@${senderUser?.username || 'Sender'} has successfully sent the funds to Handshake.\n\n<strong>Transaction Confirmed!</strong> (${requiredConfirmations}/${requiredConfirmations} confirmations)\n\nThe bot is now holding <strong>$${expectedAmount.toFixed(2)} USD</strong> in escrow.\n\n@${receiverUser?.username || 'Receiver'} has been notified.\n\n@${senderUser?.username || 'Sender'}, once the receiver confirms delivery, click the <strong>Release Funds</strong> button below to complete the transaction.`,
        color: 'green',
        requiresAction: true,
        actionType: 'release-funds'
      },
      timestamp: new Date()
    });
  }

  await ticket.save();
};
