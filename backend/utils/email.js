import nodemailer from 'nodemailer';

const buildTransporter = () => {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

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

export const sendPasswordResetCode = async ({ to, code }) => {
  const transporter = buildTransporter();
  if (!transporter) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const from = process.env.SMTP_FROM || 'Handshake <no-reply@handshake.local>';
  const subject = 'Your Handshake password reset code';
  const text = `Your Handshake password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2 style="margin: 0 0 12px;">Reset your Handshake password</h2>
      <p style="margin: 0 0 12px;">Use the code below to reset your password. This code expires in 10 minutes.</p>
      <div style="font-size: 24px; font-weight: bold; letter-spacing: 6px; background: #f4f4f4; padding: 12px 16px; display: inline-block; border-radius: 8px;">
        ${code}
      </div>
      <p style="margin: 16px 0 0;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  });

  return { sent: true };
};
