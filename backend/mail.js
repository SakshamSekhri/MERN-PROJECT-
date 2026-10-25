import nodemailer from 'nodemailer';
import { config } from './config.js';

export function mailConfigured() {
  return Boolean(config.mailFrom && (config.smtpUrl || (config.smtpHost && config.smtpUser && config.smtpPass)));
}

function createMailTransport() {
  return nodemailer.createTransport(config.smtpUrl || {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    requireTLS: config.smtpPort !== 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
}

export async function verifyMailTransport() {
  if (!mailConfigured()) throw Object.assign(new Error('Email delivery is not configured'), { status: 503 });
  const transport = createMailTransport();
  try { await transport.verify(); }
  finally { transport.close(); }
}

export async function sendAccountMail(to, purpose, token) {
  if (!mailConfigured()) throw Object.assign(new Error('Email delivery is not configured'), { status: 503 });
  const action = purpose === 'verify' ? 'verify' : 'reset';
  const link = `${config.appOrigin.replace(/\/$/, '')}#${action}=${encodeURIComponent(token)}`;
  const subject = purpose === 'verify' ? 'Verify your PixelVerse email' : 'Reset your PixelVerse password';
  const text = purpose === 'verify'
    ? `Open this link to verify your PixelVerse email. It expires in one day:\n${link}`
    : `Open this link to reset your PixelVerse password. It expires in 30 minutes:\n${link}\nIf you did not request this, ignore this message.`;
  const transport = createMailTransport();
  try { await transport.sendMail({ from: config.mailFrom, to, subject, text }); }
  finally { transport.close(); }
}

export async function sendContactMail({ name, email, category, message }) {
  if (!mailConfigured() || !config.contactTo)
    throw Object.assign(new Error('Contact email is unavailable right now'), { status: 503 });
  const transport = createMailTransport();
  try {
    await transport.sendMail({
      from: config.mailFrom,
      to: config.contactTo,
      replyTo: { name, address: email },
      subject: `PixelVerse contact: ${category}`,
      text: `Category: ${category}\nFrom: ${name} <${email}>\n\n${message}`,
    });
  } finally { transport.close(); }
}
