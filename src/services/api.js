import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if it exists
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect on 401 if it's not a login/register attempt (those should handle their own errors)
    const isAuthEndpoint = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/register');
    
    if (error.response?.status === 401 && !isAuthEndpoint) {
      // Token expired or invalid - only redirect for authenticated endpoints
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Don't redirect to /login, just let the auth context handle it
      console.log('Unauthorized - token expired');
    }
    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  getSecurityConfig: async () => {
    const response = await api.get('/auth/security-config');
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  verifyLoginTwoFactorCode: async ({ email, code, loginSessionToken }) => {
    const response = await api.post('/auth/login/2fa/verify', { email, code, loginSessionToken });
    return response.data;
  },

  resendLoginTwoFactorCode: async ({ email, loginSessionToken }) => {
    const response = await api.post('/auth/login/2fa/resend', { email, loginSessionToken });
    return response.data;
  },

  requestPasswordReset: async (email) => {
    const response = await api.post('/auth/forgot-password/request', { email });
    return response.data;
  },

  verifyPasswordResetCode: async ({ email, code }) => {
    const response = await api.post('/auth/forgot-password/verify', { email, code });
    return response.data;
  },

  resetPassword: async ({ email, resetToken, password }) => {
    const response = await api.post('/auth/forgot-password/reset', { email, resetToken, password });
    return response.data;
  },

  requestTwoFactorCode: async () => {
    const response = await api.post('/auth/2fa/request');
    return response.data;
  },

  verifyTwoFactorCode: async (code) => {
    const response = await api.post('/auth/2fa/verify', { code });
    return response.data;
  },

  disableTwoFactor: async (password) => {
    const response = await api.post('/auth/2fa/disable', { password });
    return response.data;
  },

  requestEmailChangeCurrentCode: async (newEmail) => {
    const response = await api.post('/auth/email-change/request-current', { newEmail });
    return response.data;
  },

  resendEmailChangeCurrentCode: async (verificationSessionToken) => {
    const response = await api.post('/auth/email-change/resend-current', { verificationSessionToken });
    return response.data;
  },

  verifyEmailChangeCurrentCode: async ({ verificationSessionToken, code }) => {
    const response = await api.post('/auth/email-change/verify-current', { verificationSessionToken, code });
    return response.data;
  },

  resendEmailChangeNewCode: async (verificationSessionToken) => {
    const response = await api.post('/auth/email-change/resend-new', { verificationSessionToken });
    return response.data;
  },

  verifyEmailChangeNewCode: async ({ verificationSessionToken, code }) => {
    const response = await api.post('/auth/email-change/verify-new', { verificationSessionToken, code });
    return response.data;
  },

  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  updateProfile: async (userData) => {
    const response = await api.put('/auth/profile', userData);
    return response.data;
  },
};

// Admin API calls
export const adminAPI = {
  getAllUsers: async () => {
    const response = await api.get('/admin/users');
    return response.data;
  },

  getSiteStats: async () => {
    const response = await api.get('/admin/stats');
    return response.data;
  },

  updateUserRank: async (userId, rank) => {
    const response = await api.put('/admin/users/rank', { userId, rank });
    return response.data;
  },

  updateUserRole: async (userId, role) => {
    const response = await api.put('/admin/users/role', { userId, role });
    return response.data;
  },

  updateUserXP: async (userId, xp) => {
    const response = await api.put('/admin/users/xp', { userId, xp });
    return response.data;
  },

  updateUserPasses: async (userId, passes) => {
    const response = await api.put('/admin/users/passes', { userId, passes });
    return response.data;
  },

  updateUserTotalUSDValue: async (userId, totalUSDValue) => {
    const response = await api.put('/admin/users/total-usd', { userId, totalUSDValue });
    return response.data;
  },

  updateUserTotalDeals: async (userId, totalDeals) => {
    const response = await api.put('/admin/users/total-deals', { userId, totalDeals });
    return response.data;
  },

  deleteUser: async (userId) => {
    const response = await api.delete(`/admin/users/${userId}`);
    return response.data;
  },

  getTradeRequests: async (search = '', page = 1, pageSize = 25) => {
    const params = { page, pageSize };
    if (search) params.search = search;
    const response = await api.get('/admin/trade-requests', { params });
    return response.data;
  },

  updateTradeRequest: async (requestId, updates) => {
    const response = await api.put(`/admin/trade-requests/${requestId}`, updates);
    return response.data;
  },

  deleteTradeRequest: async (requestId) => {
    const response = await api.delete(`/admin/trade-requests/${requestId}`);
    return response.data;
  },

  getTradeTickets: async (search = '', page = 1, pageSize = 25) => {
    const params = { page, pageSize };
    if (search) params.search = search;
    const response = await api.get('/admin/tickets', { params });
    return response.data;
  },
};

// Passes API calls
export const passAPI = {
  getTransactionHistory: async () => {
    const response = await api.get('/passes/transactions');
    return response.data;
  }
};

// Chat API calls
export const chatAPI = {
  getMessages: async (limit = 50, before = null) => {
    const params = { limit };
    if (before) params.before = before;
    const response = await api.get('/chat/messages', { params });
    return response.data;
  },

  sendMessage: async (messageData) => {
    const response = await api.post('/chat/messages', messageData);
    return response.data;
  },

  deleteMessage: async (messageId) => {
    const response = await api.delete(`/chat/messages/${messageId}`);
    return response.data;
  },

  getChatStats: async () => {
    const response = await api.get('/chat/stats');
    return response.data;
  },
};

// Discord profile API calls
export const discordAPI = {
  getProfile: async (forceRefresh = false) => {
    const response = await api.get('/discord/profile', {
      params: forceRefresh ? { refresh: true } : undefined
    });
    return response.data;
  }
};

// Leaderboard API calls
export const leaderboardAPI = {
  getLeaderboard: async () => {
    const response = await api.get('/leaderboard');
    return response.data;
  }
};

export default api;
