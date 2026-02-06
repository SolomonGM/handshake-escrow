import express from 'express';
import { getRecentTransactions } from '../controllers/transactionController.js';

const router = express.Router();

// Public recent transactions feed
router.get('/recent', getRecentTransactions);

export default router;
