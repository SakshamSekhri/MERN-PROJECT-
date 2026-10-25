import dotenv from 'dotenv';

dotenv.config();

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
const smtpPort = Number(process.env.SMTP_PORT ?? 465);
if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT must be a valid TCP port');

const clientOrigins = (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173')
  .split(',').map(origin => origin.trim()).filter(Boolean);
Object.freeze(clientOrigins);

const mongoPassword = process.env.MONGO_PASSWORD;
const mongoUri = process.env.MONGO_URI?.trim() || (mongoPassword
  ? `mongodb+srv://${encodeURIComponent(process.env.MONGO_USER || '')}:${encodeURIComponent(mongoPassword)}@${process.env.MONGO_HOST || ''}/${encodeURIComponent(process.env.MONGO_DB || 'pixelverse')}?retryWrites=true&w=majority`
  : '');
if (mongoPassword && (!process.env.MONGO_USER?.trim() || !process.env.MONGO_HOST?.trim())) {
  throw new Error('MONGO_USER and MONGO_HOST are required with MONGO_PASSWORD');
}

export const config = Object.freeze({
  port,
  mongoUri,
  clientOrigins,
  jwtSecret: process.env.JWT_SECRET?.trim() ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
  smtpUrl: process.env.SMTP_URL?.trim() ?? '',
  smtpHost: process.env.SMTP_HOST?.trim() ?? '',
  smtpPort,
  smtpUser: process.env.SMTP_USER?.trim() ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  mailFrom: process.env.MAIL_FROM?.trim() ?? '',
  contactTo: process.env.CONTACT_TO?.trim() || process.env.SMTP_USER?.trim() || '',
  appOrigin: process.env.APP_ORIGIN?.trim() || 'http://127.0.0.1:5173',
  secureCookies: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
});
