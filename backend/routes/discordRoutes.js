import express from 'express';
import { getDiscordProfileHandler } from '../controllers/discordController.js';

const router = express.Router();

router.get('/profile', getDiscordProfileHandler);

export default router;
