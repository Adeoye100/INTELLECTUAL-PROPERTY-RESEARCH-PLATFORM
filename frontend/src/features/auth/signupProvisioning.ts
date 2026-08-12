import type { Session } from '@supabase/supabase-js';
import { getApiConfig } from '../../lib/api/config';

const pendingRequests = new Map<string, Promise<void>>();
const completedUsers = new Set<string>();

interface ErrorPayload {
  code?: string;
  message?: string;
}

const signupFirmName = (session: Session) => {
  const value = session.user.user_metadata.forge_signup_firm_name;
  return typeof value === 'string' && value.trim().length >= 2 ? value.trim() : null;
};

async function requestProvisioning(session: Session, firmName: string): Promise<void> {
  const response = await fetch(`${getApiConfig().baseUrl}/provisioning/firm`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ firmName }),
    credentials: 'same-origin',
  });
  if (response.ok) return;

  let payload: ErrorPayload = {};
  try {
    if (response.headers.get('content-type')?.includes('json')) {
      payload = await response.json() as ErrorPayload;
    }
  } catch {
    // The status-based fallback below remains safe for malformed error bodies.
  }
  const error = new Error(payload.message || 'The service could not provision your firm.');
  Object.assign(error, { code: payload.code, status: response.status });
  throw error;
}

/**
 * Provisions self-serve signups once Supabase has issued a verified session.
 * Email-confirmation projects return no session from signUp, so the metadata
 * marker lets the confirmation callback perform the same call after exchange.
 */
export async function provisionFirmForSignupSession(session: Session): Promise<void> {
  const firmName = signupFirmName(session);
  if (!firmName || completedUsers.has(session.user.id)) return;

  const key = `${session.user.id}:${session.access_token}`;
  let request = pendingRequests.get(key);
  if (!request) {
    request = requestProvisioning(session, firmName)
      .then(() => { completedUsers.add(session.user.id); })
      .finally(() => { pendingRequests.delete(key); });
    pendingRequests.set(key, request);
  }
  await request;
}
