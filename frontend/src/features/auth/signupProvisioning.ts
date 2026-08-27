import type { Session } from '@supabase/supabase-js';
import { getApiClient } from '../../lib/api/client';

const pendingRequests = new Map<string, Promise<void>>();
const completedUsers = new Set<string>();

const signupFirmName = (session: Session) => {
  const value = session.user.user_metadata.forge_signup_firm_name;
  return typeof value === 'string' && value.trim().length >= 2 ? value.trim() : null;
};

async function requestProvisioning(session: Session, firmName: string): Promise<void> {
  await getApiClient().requestJson<void>('/provisioning/firm', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: { firmName },
  });
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
