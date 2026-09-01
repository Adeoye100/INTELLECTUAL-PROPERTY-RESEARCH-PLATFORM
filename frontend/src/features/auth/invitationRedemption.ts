import type { Session } from '@supabase/supabase-js';
import { getApiClient } from '../../lib/api/client';

export async function redeemInvitationForSession(session: Session, token: string) {
  return getApiClient().requestJson(`/auth/invitations/${encodeURIComponent(token)}/redeem`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
  });
}
