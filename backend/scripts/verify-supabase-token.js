import { loadSupabaseConfig } from '../src/config.js';
import { SupabaseVerifier } from '../src/auth/supabase-verifier.js';

const config = loadSupabaseConfig(process.env);
const token = process.env.SUPABASE_TEST_ACCESS_TOKEN?.trim();
if (!token) {
  throw new Error('Missing required environment variable: SUPABASE_TEST_ACCESS_TOKEN');
}

const verifier = new SupabaseVerifier({
  supabaseUrl: config.supabaseUrl,
  publishableKey: config.supabasePublishableKey,
  verificationMode: config.supabaseJwtVerificationMode,
  algorithms: config.supabaseJwtAlgorithms,
});

const identity = await verifier.verifyAccessToken(token);
console.log('Live Supabase access-token verification succeeded.', {
  verificationMode: config.supabaseJwtVerificationMode,
  supabaseRole: identity.supabaseRole ?? null,
});
