import express from 'express';
import {
  createTicket,
  getTicket,
  addUserToTicket,
  sendMessage,
  getUserTickets,
  respondToInvitation,
  triggerUserPrompt,
  closeTicket,
  selectRole,
  confirmRoles,
  triggerRoleSelection,
  detectAmount,
  confirmAmount,
  selectFeeOption,
  confirmPassUse,
  confirmFees,
  copyTransactionDetails,
  releaseFunds,
  submitPayoutAddress,
  confirmPayoutAddress,
  rescanTransaction,
  cancelTransaction,
  selectPrivacy
} from '../controllers/ticketController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Create new ticket
router.post('/', createTicket);

// Get user's tickets (created, invitations, active)
router.get('/my-tickets', getUserTickets);

// Get specific ticket
router.get('/:ticketId', getTicket);

// Trigger user prompt (after 10 seconds)
router.post('/:ticketId/trigger-prompt', triggerUserPrompt);

// Trigger role selection (after user accepted)
router.post('/:ticketId/trigger-role-selection', triggerRoleSelection);

// Add user to ticket
router.post('/:ticketId/add-user', addUserToTicket);

// Send message in ticket
router.post('/:ticketId/messages', sendMessage);

// Respond to invitation (accept/decline)
router.post('/:ticketId/respond', respondToInvitation);

// Select role (sender/receiver)
router.post('/:ticketId/select-role', selectRole);

// Confirm or reject roles
router.post('/:ticketId/confirm-roles', confirmRoles);

// Detect amount from message
router.post('/:ticketId/detect-amount', detectAmount);

// Confirm or reject amount
router.post('/:ticketId/confirm-amount', confirmAmount);

// Select fee option (with-fees or use-pass)
router.post('/:ticketId/select-fee', selectFeeOption);

// Confirm using a pass
router.post('/:ticketId/confirm-pass', confirmPassUse);

// Confirm or reject fee decision
router.post('/:ticketId/confirm-fees', confirmFees);

// Copy transaction details (limited to 3 times)
router.post('/:ticketId/copy-details', copyTransactionDetails);

// Release funds (sender only)
router.post('/:ticketId/release-funds', releaseFunds);

// Submit receiver payout address
router.post('/:ticketId/submit-payout-address', submitPayoutAddress);

// Confirm payout address
router.post('/:ticketId/confirm-payout-address', confirmPayoutAddress);

// Rescan for transaction
router.post('/:ticketId/rescan-transaction', rescanTransaction);

// Cancel transaction
router.post('/:ticketId/cancel-transaction', cancelTransaction);

// Select broadcast privacy
router.post('/:ticketId/select-privacy', selectPrivacy);

// Close ticket
router.post('/:ticketId/close', closeTicket);

export default router;
