import nodemailer from 'nodemailer';

// SMTP configuration from environment variables
const getSmtpConfig = () => {
  const config = {
    host: process.env.SMTP_SERVER,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_USE_TLS === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  // Handle opportunistic TLS (STARTTLS)
  if (process.env.SMTP_OPPORTUNISTIC_TLS === 'true') {
    config.secure = false;
    config.tls = {
      rejectUnauthorized: false, // Allow self-signed certificates
    };
  }

  return config;
};

// Check if SMTP is configured
export const isSmtpConfigured = () => {
  return !!(process.env.SMTP_SERVER && process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD);
};

// Create transporter lazily (only when needed)
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    if (!isSmtpConfigured()) {
      throw new Error('SMTP is not configured. Please set SMTP_SERVER, SMTP_USERNAME, and SMTP_PASSWORD environment variables.');
    }
    transporter = nodemailer.createTransport(getSmtpConfig());
  }
  return transporter;
};

// Send verification code email
export const sendVerificationCode = async (email, code) => {
  const transport = getTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USERNAME;

  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: 'AgentHub 登录验证码',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">AgentHub</h1>
        </div>
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; text-align: center;">
          <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 20px 0;">您的验证码</h2>
          <div style="font-size: 36px; font-weight: bold; color: #2563eb; letter-spacing: 8px; margin: 20px 0; font-family: monospace;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px; margin: 20px 0 0 0;">
            验证码有效期为 <strong>5 分钟</strong>，请尽快使用。
          </p>
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            如果您没有请求此验证码，请忽略此邮件。
          </p>
        </div>
      </div>
    `,
    text: `您的 AgentHub 登录验证码是：${code}，有效期 5 分钟。如果您没有请求此验证码，请忽略此邮件。`,
  };

  return transport.sendMail(mailOptions);
};

// Verify SMTP connection
export const verifySmtpConnection = async () => {
  try {
    const transport = getTransporter();
    await transport.verify();
    return { success: true };
  } catch (error) {
    console.error('SMTP connection verification failed:', error);
    return { success: false, error: error.message };
  }
};
