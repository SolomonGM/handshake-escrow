import express from 'express';
import { fetchLeaderboard } from '../controllers/leaderboardController.js';

const router = express.Router();

router.get('/', fetchLeaderboard);

export default router;
