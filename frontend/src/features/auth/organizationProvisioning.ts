import type { Session } from '@supabase/supabase-js';
import { getApiClient } from '../../lib/api/client';

interface OrganizationIntentResponse {
  intentToken: string;
  expiresAt: string;
}

export async function startOrganizationCreation(input: { email: string; firmName: string }) {
  return getApiClient().requestJson<OrganizationIntentResponse>('/provisioning/organization-intents', {
    method: 'POST', body: input,
  });
}

export async function provisionOrganizationForSession(session: Session, intentToken: string) {
  return getApiClient().requestJson('/provisioning/firm', {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: { intentToken },
  });
}
