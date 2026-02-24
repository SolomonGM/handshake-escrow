import express from 'express';
import {
  disconnectDiscordHandler,
  discordOAuthCallbackHandler,
  getDiscordConnectUrlHandler,
  getDiscordConnectionStatusHandler,
  getDiscordProfileHandler,
  syncDiscordRoleHandler
} from '../controllers/discordController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/profile', getDiscordProfileHandler);
router.get('/callback', discordOAuthCallbackHandler);
router.get('/connect-url', protect, getDiscordConnectUrlHandler);
router.get('/status', protect, getDiscordConnectionStatusHandler);
router.post('/sync-role', protect, syncDiscordRoleHandler);
router.post('/disconnect', protect, disconnectDiscordHandler);

export default router;
