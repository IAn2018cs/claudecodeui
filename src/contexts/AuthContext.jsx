import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext({
  user: null,
  token: null,
  login: () => {},
  sendCode: () => {},
  verifyCode: () => {},
  logout: () => {},
  isLoading: true,
  needsSetup: false,
  smtpConfigured: false,
  error: null,
  isAdmin: false,
  // Spending limit status
  limitStatus: { allowed: true },
  checkLimitStatus: () => {},
  setLimitStatus: () => {}
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('auth-token'));
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [error, setError] = useState(null);
  const [limitStatus, setLimitStatus] = useState({ allowed: true });

  useEffect(() => {
    if (import.meta.env.VITE_IS_PLATFORM === 'true') {
      setUser({ username: 'platform-user' });
      setNeedsSetup(false);
      setIsLoading(false);
      return;
    }

    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if system needs setup
      const statusResponse = await api.auth.status();
      const statusData = await statusResponse.json();

      setSmtpConfigured(statusData.smtpConfigured || false);

      if (statusData.needsSetup) {
        setNeedsSetup(true);
        setIsLoading(false);
        return;
      }

      // If we have a token, verify it
      if (token) {
        try {
          const userResponse = await api.auth.user();

          if (userResponse.ok) {
            const userData = await userResponse.json();
            setUser(userData.user);
            setNeedsSetup(false);
          } else {
            // Token is invalid
            localStorage.removeItem('auth-token');
            setToken(null);
            setUser(null);
          }
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('auth-token');
          setToken(null);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('[AuthContext] Auth status check failed:', error);
      setError('Failed to check authentication status');
    } finally {
      setIsLoading(false);
    }
  };

  // Send verification code to email
  const sendCode = async (email) => {
    try {
      setError(null);
      const response = await api.auth.sendCode(email);
      const data = await response.json();

      if (response.ok) {
        return { success: true, type: data.type };
      } else {
        return {
          success: false,
          error: data.error || '发送验证码失败',
          waitSeconds: data.waitSeconds
        };
      }
    } catch (error) {
      console.error('Send code error:', error);
      return { success: false, error: '网络错误，请稍后再试' };
    }
  };

  // Verify code and login/register
  const verifyCode = async (email, code) => {
    try {
      setError(null);
      const response = await api.auth.verifyCode(email, code);
      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        setNeedsSetup(false);
        localStorage.setItem('auth-token', data.token);
        return { success: true };
      } else {
        setError(data.error || '验证失败');
        return { success: false, error: data.error || '验证失败' };
      }
    } catch (error) {
      console.error('Verify code error:', error);
      return { success: false, error: '网络错误，请稍后再试' };
    }
  };

  // Login with username/password (for admin-created accounts)
  const login = async (username, password) => {
    try {
      setError(null);
      const response = await api.auth.login(username, password);

      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('auth-token', data.token);
        return { success: true };
      } else {
        setError(data.error || '登录失败');
        return { success: false, error: data.error || '登录失败' };
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = '网络错误，请稍后再试';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setLimitStatus({ allowed: true });
    localStorage.removeItem('auth-token');

    // Optional: Call logout endpoint for logging
    if (token) {
      api.auth.logout().catch(error => {
        console.error('Logout endpoint error:', error);
      });
    }
  };

  // Check spending limit status
  const checkLimitStatus = async () => {
    // Skip if in platform mode or no user
    if (import.meta.env.VITE_IS_PLATFORM === 'true' || !user) {
      return { allowed: true };
    }

    try {
      const response = await api.auth.limitStatus();
      if (response.ok) {
        const status = await response.json();
        setLimitStatus(status);
        return status;
      }
    } catch (error) {
      console.error('Error checking limit status:', error);
    }
    return { allowed: true };
  };

  // Check limit status when user logs in
  useEffect(() => {
    if (user && !isLoading) {
      checkLimitStatus();
    }
  }, [user, isLoading]);

  const value = {
    user,
    token,
    login,
    sendCode,
    verifyCode,
    logout,
    isLoading,
    needsSetup,
    smtpConfigured,
    error,
    isAdmin: user?.role === 'admin',
    // Spending limit status
    limitStatus,
    checkLimitStatus,
    setLimitStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
