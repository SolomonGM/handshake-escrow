import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getMessages,
  sendMessage,
  deleteMessage,
  getChatStats,
  getTicketWorkflowStatus
} from '../controllers/chatController.js';

const router = express.Router();

// Public route - anyone can view messages
router.get('/messages', getMessages);
router.get('/ticket-workflow-status', getTicketWorkflowStatus);

// Protected routes - require authentication
router.post('/messages', protect, sendMessage);
router.delete('/messages/:messageId', protect, deleteMessage);

// Admin only
router.get('/stats', protect, getChatStats);

export default router;
