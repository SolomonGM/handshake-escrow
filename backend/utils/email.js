import axios from 'axios';
import nodemailer from 'nodemailer';

const EMAIL_FROM_DEFAULT = 'Handshake <no-reply@handshake.local>';

let smtpTransporterCache = null;
let smtpTransporterCacheKey = null;

const getEmailProvider = () => {
  const configuredProvider = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (configuredProvider) {
    return configuredProvider;
  }

  if (process.env.RESEND_API_KEY) {
    return 'resend';
  }

  return 'smtp';
};
const getFromAddress = () => process.env.EMAIL_FROM || process.env.SMTP_FROM || EMAIL_FROM_DEFAULT;

const getSmtpCacheKey = () => (
  [
    process.env.SMTP_HOST || '',
    process.env.SMTP_PORT || '',
    process.env.SMTP_SECURE || '',
    process.env.SMTP_USER || '',
    process.env.SMTP_PASS ? 'configured' : 'missing'
  ].join('|')
);

const buildSmtpTransporter = () => {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true';
  const authUser = process.env.SMTP_USER;
  const authPass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: authUser ? { user: authUser, pass: authPass } : undefined
  });
};

const getSmtpTransporter = () => {
  const cacheKey = getSmtpCacheKey();
  if (smtpTransporterCache && smtpTransporterCacheKey === cacheKey) {
    return smtpTransporterCache;
  }

  smtpTransporterCache = buildSmtpTransporter();
  smtpTransporterCacheKey = cacheKey;
  return smtpTransporterCache;
};

const sendWithResend = async ({ to, subject, text, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: 'resend_not_configured' };
  }

  try {
    const payload = {
      from: getFromAddress(),
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html
    };

    const response = await axios.post('https://api.resend.com/emails', payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return {
      sent: true,
      provider: 'resend',
      messageId: response.data?.id || null
    };
  } catch (error) {
    return {
      sent: false,
      reason: 'resend_send_failed',
      error
    };
  }
};

const sendWithSmtp = async ({ to, subject, text, html }) => {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to,
      subject,
      text,
      html
    });

    return {
      sent: true,
      provider: 'smtp',
      messageId: info.messageId || null
    };
  } catch (error) {
    return {
      sent: false,
      reason: 'smtp_send_failed',
      error
    };
  }
};

export const sendEmail = async ({ to, subject, text, html }) => {
  const provider = getEmailProvider();

  if (provider === 'resend') {
    return sendWithResend({ to, subject, text, html });
  }

  if (provider === 'smtp' || !provider) {
    return sendWithSmtp({ to, subject, text, html });
  }

  return { sent: false, reason: `unsupported_provider_${provider}` };
};

const buildCodeEmailHtml = ({ heading, intro, code, footer }) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
    <h2 style="margin: 0 0 12px;">${heading}</h2>
    <p style="margin: 0 0 12px;">${intro}</p>
    <div style="font-size: 24px; font-weight: bold; letter-spacing: 6px; background: #f4f4f4; padding: 12px 16px; display: inline-block; border-radius: 8px;">
      ${code}
    </div>
    <p style="margin: 16px 0 0;">${footer}</p>
  </div>
`;

export const sendPasswordResetCode = async ({ to, code }) => {
  const subject = 'Your Handshake password reset code';
  const text = `Your Handshake password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = buildCodeEmailHtml({
    heading: 'Reset your Handshake password',
    intro: 'Use the code below to reset your password. This code expires in 10 minutes.',
    code,
    footer: 'If you did not request this, you can safely ignore this email.'
  });

  return sendEmail({ to, subject, text, html });
};

export const sendTwoFactorCode = async ({ to, code }) => {
  const subject = 'Your Handshake 2FA verification code';
  const text = `Your Handshake 2FA code is ${code}. It expires in 10 minutes. If this was not you, secure your account immediately.`;
  const html = buildCodeEmailHtml({
    heading: 'Two-factor verification code',
    intro: 'Use this code to verify your action in Handshake. This code expires in 10 minutes.',
    code,
    footer: 'If this was not you, change your password and contact support immediately.'
  });

  return sendEmail({ to, subject, text, html });
};

export const sendEmailChangeCode = async ({ to, code, stage = 'current' }) => {
  const isCurrentStage = stage === 'current';
  const subject = isCurrentStage
    ? 'Verify your current Handshake email'
    : 'Verify your new Handshake email';
  const text = isCurrentStage
    ? `Your Handshake verification code is ${code}. This confirms access to your current email before changing it. The code expires in 10 minutes.`
    : `Your Handshake verification code is ${code}. This confirms your new email address for your account. The code expires in 10 minutes.`;
  const html = buildCodeEmailHtml({
    heading: isCurrentStage ? 'Verify your current email' : 'Verify your new email',
    intro: isCurrentStage
      ? 'Use this code to confirm you still control your current account email before changing it.'
      : 'Use this code to confirm your new email address and complete the email change.',
    code,
    footer: 'If you did not request this change, secure your account immediately.'
  });

  return sendEmail({ to, subject, text, html });
};
