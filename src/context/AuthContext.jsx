import { createContext, useState, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const persistAuthSession = (token, nextUser) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const updateStoredUser = (updater) => {
    setUser((prevUser) => {
      if (!prevUser) {
        return prevUser;
      }

      const nextUser = typeof updater === 'function' ? updater(prevUser) : updater;
      localStorage.setItem('user', JSON.stringify(nextUser));
      return nextUser;
    });
  };

  // Check if user is logged in on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (token && storedUser) {
        try {
          // Verify token is still valid
          const response = await authAPI.getMe();
          localStorage.setItem('user', JSON.stringify(response.user));
          setUser(response.user);
        } catch (error) {
          console.error('Token validation failed:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const register = async (userData) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.register(userData);
      persistAuthSession(response.token, response.user);
      
      return { success: true, user: response.user };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.login(credentials);

      if (response.requiresTwoFactor) {
        return {
          success: true,
          requiresTwoFactor: true,
          email: response.email,
          loginSessionToken: response.loginSessionToken,
          cooldownSeconds: response.cooldownSeconds,
          expiresInSeconds: response.expiresInSeconds,
          message: response.message
        };
      }

      persistAuthSession(response.token, response.user);
      
      return { success: true, user: response.user };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const verifyLoginTwoFactorCode = async ({ email, code, loginSessionToken }) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.verifyLoginTwoFactorCode({ email, code, loginSessionToken });
      persistAuthSession(response.token, response.user);

      return { success: true, user: response.user };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Two-factor verification failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setError(null);
  };

  const updateProfile = async (userData) => {
    try {
      setError(null);
      const response = await authAPI.updateProfile(userData);
      updateStoredUser(response.user);
      
      return { success: true, user: response.user };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Profile update failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const refreshCurrentUser = async () => {
    try {
      setError(null);
      const response = await authAPI.getMe();
      updateStoredUser(response.user);
      return { success: true, user: response.user };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to refresh session user';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const requestTwoFactorCode = async () => {
    try {
      setError(null);
      const response = await authAPI.requestTwoFactorCode();
      return { success: true, ...response };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to send verification code';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
        cooldownSeconds: error.response?.data?.cooldownSeconds
      };
    }
  };

  const verifyTwoFactorCode = async (code) => {
    try {
      setError(null);
      const response = await authAPI.verifyTwoFactorCode(code);
      if (response.twoFactorEnabled) {
        updateStoredUser((currentUser) => ({
          ...currentUser,
          twoFactorEnabled: true
        }));
      }
      return { success: true, ...response };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Two-factor verification failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const disableTwoFactor = async (password) => {
    try {
      setError(null);
      const response = await authAPI.disableTwoFactor(password);
      if (response.twoFactorEnabled === false) {
        updateStoredUser((currentUser) => ({
          ...currentUser,
          twoFactorEnabled: false
        }));
      }
      return { success: true, ...response };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to disable two-factor authentication';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const requestEmailChangeCurrentCode = async (newEmail) => {
    try {
      setError(null);
      const response = await authAPI.requestEmailChangeCurrentCode(newEmail);
      return { success: true, ...response };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to send verification code';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
        cooldownSeconds: error.response?.data?.cooldownSeconds
      };
    }
  };

  const resendEmailChangeCurrentCode = async (verificationSessionToken) => {
    try {
      setError(null);
      const response = await authAPI.resendEmailChangeCurrentCode(verificationSessionToken);
      return { success: true, ...response };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to resend verification code';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
        cooldownSeconds: error.response?.data?.cooldownSeconds
      };
    }
  };

  const verifyEmailChangeCurrentCode = async ({ verificationSessionToken, code }) => {
    try {
      setError(null);
      const response = await authAPI.verifyEmailChangeCurrentCode({ verificationSessionToken, code });
      return { success: true, ...response };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to verify current email code';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const resendEmailChangeNewCode = async (verificationSessionToken) => {
    try {
      setError(null);
      const response = await authAPI.resendEmailChangeNewCode(verificationSessionToken);
      return { success: true, ...response };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to resend verification code';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
        cooldownSeconds: error.response?.data?.cooldownSeconds
      };
    }
  };

  const verifyEmailChangeNewCode = async ({ verificationSessionToken, code }) => {
    try {
      setError(null);
      const response = await authAPI.verifyEmailChangeNewCode({ verificationSessionToken, code });
      if (response.user) {
        updateStoredUser(response.user);
      }
      return { success: true, ...response };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to verify new email code';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const value = {
    user,
    token: localStorage.getItem('token'),
    loading,
    error,
    register,
    login,
    verifyLoginTwoFactorCode,
    logout,
    updateProfile,
    requestTwoFactorCode,
    verifyTwoFactorCode,
    disableTwoFactor,
    requestEmailChangeCurrentCode,
    resendEmailChangeCurrentCode,
    verifyEmailChangeCurrentCode,
    resendEmailChangeNewCode,
    verifyEmailChangeNewCode,
    refreshCurrentUser,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
