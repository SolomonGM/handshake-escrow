import express from 'express';
import { getAllTransactions, getRecentTransactions } from '../controllers/transactionController.js';

const router = express.Router();

// Public recent transactions feed
router.get('/recent', getRecentTransactions);
router.get('/all', getAllTransactions);

export default router;
