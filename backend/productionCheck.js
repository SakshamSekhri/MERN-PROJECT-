export function productionIssues(settings) {
  const issues = [];
  if (!settings.mongoUri) issues.push('MONGO_URI is required');
  if (!settings.jwtSecret || settings.jwtSecret.length < 32 || settings.jwtSecret.startsWith('REPLACE_'))
    issues.push('JWT_SECRET needs a private value of at least 32 characters');
  if (!settings.googleClientId?.endsWith('.apps.googleusercontent.com'))
    issues.push('GOOGLE_CLIENT_ID is required for Google sign-in');
  if (!settings.mailFrom || !(settings.smtpUrl || (settings.smtpHost && settings.smtpUser && settings.smtpPass)))
    issues.push('SMTP and MAIL_FROM are required for verification and reset email');
  let appUrl;
  try { appUrl = new URL(settings.appOrigin); }
  catch { issues.push('APP_ORIGIN must be a valid HTTPS URL'); }
  if (appUrl && (appUrl.protocol !== 'https:' || !settings.clientOrigins.includes(appUrl.origin)))
    issues.push('APP_ORIGIN must be HTTPS and included in CLIENT_ORIGINS');
  if (!settings.clientOrigins.length || settings.clientOrigins.some(origin => {
    try { return new URL(origin).origin !== origin || !origin.startsWith('https://'); }
    catch { return true; }
  })) issues.push('CLIENT_ORIGINS must contain only exact HTTPS origins');
  return issues;
}
