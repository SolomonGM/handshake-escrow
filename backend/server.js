import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import stickerRoutes from './routes/stickers.js';
import ticketRoutes from './routes/ticketRoutes.js';
import tradeRequestRoutes from './routes/tradeRequestRoutes.js';
import passRoutes from './routes/passRoutes.js';
import discordRoutes from './routes/discordRoutes.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import setupChatSocket from './socket/chatSocket.js';
import { startTransactionMonitoring } from './services/transactionMonitor.js';
import { scheduleDiscordProfileRefresh, warmDiscordProfileCache } from './services/discordProfileService.js';
import { scheduleLeaderboardRefresh, warmLeaderboardCache } from './services/leaderboardService.js';
import { setIo } from './utils/socketRegistry.js';
import { backfillCompletedTickets, startTicketClosureMonitor } from './services/ticketClosureService.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const httpServer = createServer(app);

const defaultDevOrigins = ['http://localhost:5173', 'http://localhost:5174'];
const envOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (envOrigins.length ? envOrigins : defaultDevOrigins)
  : Array.from(new Set([...(envOrigins.length ? envOrigins : defaultDevOrigins), ...defaultDevOrigins]));

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
};

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});
setIo(io);

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet()); // Security headers
app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '20mb' })); // Parse URL-encoded bodies

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/stickers', stickerRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/trade-requests', tradeRequestRoutes);
app.use('/api/passes', passRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/transactions', transactionRoutes);

// Setup Socket.io for chat
setupChatSocket(io);

// Export io for use in other modules (transaction monitoring, etc.)
export { io };

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💬 WebSocket server ready`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);  
  // Start transaction monitoring service
  startTransactionMonitoring(io);
  scheduleDiscordProfileRefresh();
  warmDiscordProfileCache();
  scheduleLeaderboardRefresh();
  warmLeaderboardCache();
  startTicketClosureMonitor();
  backfillCompletedTickets().catch((error) => {
    console.error('❌ Error backfilling completed tickets:', error);
  });
});
