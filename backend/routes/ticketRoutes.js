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
import { requireTicketWorkflowActive } from '../middleware/ticketWorkflowMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Creates new ticket
router.post('/', requireTicketWorkflowActive, createTicket);

// Retrieves user's tickets (created, invitations, active)
router.get('/my-tickets', getUserTickets);

// Retrieves specific ticket
router.get('/:ticketId', getTicket);

// Triggers user prompt (after 10 seconds)
router.post('/:ticketId/trigger-prompt', requireTicketWorkflowActive, triggerUserPrompt);

// Triggers role selection (after user accepted)
router.post('/:ticketId/trigger-role-selection', requireTicketWorkflowActive, triggerRoleSelection);

// Adds user to ticket
router.post('/:ticketId/add-user', requireTicketWorkflowActive, addUserToTicket);

// Sends message in ticket
router.post('/:ticketId/messages', sendMessage);

// Responds to invitation (accept/decline)
router.post('/:ticketId/respond', requireTicketWorkflowActive, respondToInvitation);

// Selects role (sender/receiver)
router.post('/:ticketId/select-role', requireTicketWorkflowActive, selectRole);

// Confirms or rejects roles
router.post('/:ticketId/confirm-roles', requireTicketWorkflowActive, confirmRoles);

// Detects amount from message
router.post('/:ticketId/detect-amount', requireTicketWorkflowActive, detectAmount);

// Confirms or rejects amount
router.post('/:ticketId/confirm-amount', requireTicketWorkflowActive, confirmAmount);

// Selects fee option (with-fees or use-pass)
router.post('/:ticketId/select-fee', requireTicketWorkflowActive, selectFeeOption);

// Confirms using a pass
router.post('/:ticketId/confirm-pass', requireTicketWorkflowActive, confirmPassUse);

// Confirms or rejects fee decision
router.post('/:ticketId/confirm-fees', requireTicketWorkflowActive, confirmFees);

// Copies transaction details (limited to 3 times)
router.post('/:ticketId/copy-details', requireTicketWorkflowActive, copyTransactionDetails);

// Releases funds (sender only)
router.post('/:ticketId/release-funds', requireTicketWorkflowActive, releaseFunds);

// Submits receiver payout address
router.post('/:ticketId/submit-payout-address', requireTicketWorkflowActive, submitPayoutAddress);

// Confirms payout address
router.post('/:ticketId/confirm-payout-address', requireTicketWorkflowActive, confirmPayoutAddress);

// Rescans for transaction
router.post('/:ticketId/rescan-transaction', requireTicketWorkflowActive, rescanTransaction);

// Cancels transaction
router.post('/:ticketId/cancel-transaction', requireTicketWorkflowActive, cancelTransaction);

// Selects broadcast privacy
router.post('/:ticketId/select-privacy', requireTicketWorkflowActive, selectPrivacy);

// Closes ticket
router.post('/:ticketId/close', requireTicketWorkflowActive, closeTicket);

export default router;



