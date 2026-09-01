function boolean(env, name, fallback) {
  const value = env[name] === undefined ? String(fallback) : env[name].trim();
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be either true or false.`);
  return value === 'true';
}

function applicationUrl(env, environment) {
  const value = env.PUBLIC_APP_URL?.trim();
  if (!value) {
    if (environment === 'production') throw new Error('Missing required environment variable: PUBLIC_APP_URL');
    return 'http://localhost:5173';
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('PUBLIC_APP_URL must be a valid absolute application URL.'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || (url.pathname !== '/' && url.pathname !== '')) throw new Error('PUBLIC_APP_URL must be an origin-only HTTP(S) URL.');
  if (environment === 'production' && (url.protocol !== 'https:' || local)) throw new Error('PUBLIC_APP_URL must be HTTPS and non-local in production.');
  return url.origin;
}

export function loadInvitationConfig(env, environment) {
  const invitationMailerProvider = env.INVITATION_MAILER_PROVIDER?.trim() || (environment === 'production' ? 'disabled' : 'fake');
  if (!['disabled', 'fake', 'resend'].includes(invitationMailerProvider)) throw new Error('INVITATION_MAILER_PROVIDER must be disabled, fake, or resend.');
  if (environment === 'production' && invitationMailerProvider === 'fake') throw new Error('INVITATION_MAILER_PROVIDER=fake is not allowed in production.');
  const invitationMailerApiKey = env.INVITATION_MAILER_API_KEY?.trim();
  const invitationMailerFrom = env.INVITATION_MAILER_FROM?.trim();
  if (invitationMailerProvider === 'resend' && (!invitationMailerApiKey || !invitationMailerFrom)) {
    throw new Error('INVITATION_MAILER_API_KEY and INVITATION_MAILER_FROM are required for Resend invitation delivery.');
  }
  const organizationIntentTtlSeconds = Number(env.ORGANIZATION_INTENT_TTL_SECONDS ?? 3600);
  if (!Number.isSafeInteger(organizationIntentTtlSeconds) || organizationIntentTtlSeconds < 60 || organizationIntentTtlSeconds > 86_400) {
    throw new Error('ORGANIZATION_INTENT_TTL_SECONDS must be an integer between 60 and 86400.');
  }
  return {
    publicFirmSignupEnabled: boolean(env, 'PUBLIC_FIRM_SIGNUP_ENABLED', false),
    organizationIntentTtlSeconds,
    publicApplicationUrl: applicationUrl(env, environment),
    invitationMailerProvider,
    invitationMailerApiKey,
    invitationMailerFrom,
  };
}
