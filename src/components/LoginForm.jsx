import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Mail, ArrowLeft, User, Lock } from 'lucide-react';

const LoginForm = () => {
  // Login mode: 'email' (verification code) or 'password' (username/password)
  const [loginMode, setLoginMode] = useState('email');
  // Email verification step: 'email' or 'code'
  const [emailStep, setEmailStep] = useState('email');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isNewUser, setIsNewUser] = useState(false);

  const { login, sendCode, verifyCode, smtpConfigured } = useAuth();

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // If SMTP is not configured, default to password mode
  useEffect(() => {
    if (!smtpConfigured) {
      setLoginMode('password');
    }
  }, [smtpConfigured]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setIsLoading(true);

    const result = await sendCode(email);

    if (result.success) {
      setEmailStep('code');
      setCountdown(60);
      setIsNewUser(result.type === 'register');
    } else {
      setError(result.error);
      if (result.waitSeconds) {
        setCountdown(result.waitSeconds);
      }
    }

    setIsLoading(false);
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');

    if (!code || code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setIsLoading(true);

    const result = await verifyCode(email, code);

    if (!result.success) {
      setError(result.error);
    }

    setIsLoading(false);
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;

    setError('');
    setIsLoading(true);

    const result = await sendCode(email);

    if (result.success) {
      setCountdown(60);
    } else {
      setError(result.error);
    }

    setIsLoading(false);
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setIsLoading(true);

    const result = await login(username, password);

    if (!result.success) {
      setError(result.error);
    }

    setIsLoading(false);
  };

  const handleBackToEmail = () => {
    setEmailStep('email');
    setCode('');
    setError('');
  };

  const switchToEmailMode = () => {
    setLoginMode('email');
    setEmailStep('email');
    setError('');
  };

  const switchToPasswordMode = () => {
    setLoginMode('password');
    setError('');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg border border-border p-8 space-y-6">
          {/* Logo and Title */}
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center shadow-sm">
                <MessageSquare className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {loginMode === 'email'
                ? (emailStep === 'email'
                    ? '欢迎使用 AgentHub'
                    : (isNewUser ? '创建您的账户' : '验证您的身份'))
                : '欢迎回来'}
            </h1>
            <p className="text-muted-foreground mt-2">
              {loginMode === 'email'
                ? (emailStep === 'email'
                    ? '输入邮箱以接收验证码'
                    : `验证码已发送至 ${email}`)
                : '使用账号密码登录'}
            </p>
          </div>

          {/* Email Verification Login */}
          {loginMode === 'email' && emailStep === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                  邮箱地址
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入邮箱地址"
                    required
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || countdown > 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
              >
                {isLoading ? '发送中...' :
                 countdown > 0 ? `${countdown}秒后可重新发送` : '获取验证码'}
              </button>
            </form>
          )}

          {/* Email Verification Code Input */}
          {loginMode === 'email' && emailStep === 'code' && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <button
                type="button"
                onClick={handleBackToEmail}
                className="flex items-center text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                返回修改邮箱
              </button>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-foreground mb-1">
                  验证码
                </label>
                <input
                  type="text"
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="000000"
                  required
                  disabled={isLoading}
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
              >
                {isLoading ? '验证中...' : (isNewUser ? '创建账户并登录' : '登录')}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={countdown > 0 || isLoading}
                  className="text-sm text-blue-500 hover:text-blue-600 disabled:text-muted-foreground"
                >
                  {countdown > 0 ? `${countdown}秒后可重新发送` : '重新发送验证码'}
                </button>
              </div>
            </form>
          )}

          {/* Password Login */}
          {loginMode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">
                  用户名
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入用户名"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入密码"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
              >
                {isLoading ? '登录中...' : '登录'}
              </button>
            </form>
          )}

          {/* Mode Switch */}
          <div className="text-center pt-4 border-t border-border">
            {loginMode === 'email' && smtpConfigured ? (
              <button
                type="button"
                onClick={switchToPasswordMode}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                使用账号密码登录
              </button>
            ) : loginMode === 'password' && smtpConfigured ? (
              <button
                type="button"
                onClick={switchToEmailMode}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                使用邮箱验证码登录
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
