import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ClaudeLogo from './ClaudeLogo';
import { Mail, ArrowLeft } from 'lucide-react';

const SetupForm = () => {
  const [step, setStep] = useState('email'); // 'email' or 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const { sendCode, verifyCode, smtpConfigured } = useAuth();

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

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
      setStep('code');
      setCountdown(60);
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

  const handleBackToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
  };

  // If SMTP is not configured, show an error message
  if (!smtpConfigured) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg shadow-lg border border-border p-8 space-y-6">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <ClaudeLogo size={64} />
              </div>
              <h1 className="text-2xl font-bold text-foreground">欢迎使用 AgentHub</h1>
              <p className="text-muted-foreground mt-2">
                系统初始化
              </p>
            </div>

            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-800 rounded-md">
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                SMTP 邮件服务未配置。请联系管理员配置以下环境变量后重启服务：
              </p>
              <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-400 list-disc list-inside">
                <li>SMTP_SERVER</li>
                <li>SMTP_PORT</li>
                <li>SMTP_USERNAME</li>
                <li>SMTP_PASSWORD</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg border border-border p-8 space-y-6">
          {/* Logo and Title */}
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <ClaudeLogo size={64} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {step === 'email' ? '欢迎使用 AgentHub' : '创建管理员账户'}
            </h1>
            <p className="text-muted-foreground mt-2">
              {step === 'email'
                ? '输入邮箱创建管理员账户'
                : `验证码已发送至 ${email}`}
            </p>
          </div>

          {/* Email Input Step */}
          {step === 'email' && (
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

          {/* Verification Code Step */}
          {step === 'code' && (
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
                {isLoading ? '创建中...' : '创建管理员账户'}
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

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              首个注册的用户将成为管理员
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupForm;
