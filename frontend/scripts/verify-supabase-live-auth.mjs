import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../../backend/src/config.js';
import { createSystem } from '../../backend/src/system.js';

const config = loadConfig(process.env);
const runId = randomUUID();
const email = `iprp-live-auth-${runId}@example.test`;
const password = `Iprp-${randomUUID()}-Aa1!`;
const storageKey = `iprp-live-auth-${runId}`;
const storage = new Map();
const firmName = `IPRP Live Auth ${runId}`;
let system;
let server;
let serverUrl;
let supabaseUserId;
let firmId;

function createBrowserClient() {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storageKey,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
    },
  });
}

async function supabaseAdmin(path, options = {}) {
  return fetch(`${config.supabaseUrl}/auth/v1/admin${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      apikey: config.supabaseSecretKey,
      authorization: `Bearer ${config.supabaseSecretKey}`,
      ...options.headers,
    },
  });
}

async function api(path, { accessToken, method = 'GET', body, headers = {} } = {}) {
  return fetch(`${serverUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function startServer(app) {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string', 'The API test server did not expose a TCP address.');
  serverUrl = `http://127.0.0.1:${address.port}`;
}

async function closeServer() {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  server = undefined;
}

async function cleanup() {
  await closeServer();
  if (system && firmId) {
    await system.pool.query('DELETE FROM firm_invitations WHERE firm_id = $1', [firmId]);
    await system.pool.query('DELETE FROM users WHERE firm_id = $1', [firmId]);
    await system.pool.query('DELETE FROM firms WHERE id = $1', [firmId]);
  }
  if (system) await system.close();
  if (supabaseUserId) {
    await supabaseAdmin(`/users/${encodeURIComponent(supabaseUserId)}`, { method: 'DELETE' });
  }
}

try {
  const settingsResponse = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: config.supabasePublishableKey },
  });
  const settings = await settingsResponse.json();
  assert.equal(settingsResponse.status, 200, 'Supabase Auth settings were unavailable.');
  assert.equal(settings.disable_signup, false, 'Email/password signup is disabled.');
  assert.equal(settings.external?.email, true, 'Email/password authentication is disabled.');
  assert.equal(settings.external?.google, true, 'Google OAuth is disabled.');

  const createUser = await supabaseAdmin('/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'IPRP Live Auth Verification' },
    }),
  });
  assert.equal(createUser.status, 200, 'Supabase could not create the disposable live verification user.');
  const createdUser = await createUser.json();
  assert.equal(typeof createdUser.id, 'string', 'Supabase returned an invalid verification user.');
  supabaseUserId = createdUser.id;

  const firstClient = createBrowserClient();
  const login = await firstClient.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, 'Email/password login failed.');
  assert(login.data.session, 'Email/password login did not create a session.');
  assert.equal(login.data.session.user.id, supabaseUserId, 'Login returned a different Supabase identity.');

  const restoredClient = createBrowserClient();
  const restored = await restoredClient.auth.getSession();
  assert.equal(restored.error, null, 'Supabase could not restore the persisted browser session.');
  assert(restored.data.session, 'Supabase did not restore the persisted browser session.');
  assert.equal(restored.data.session.user.id, supabaseUserId, 'Restored session belongs to a different user.');

  const refreshed = await restoredClient.auth.refreshSession(restored.data.session);
  assert.equal(refreshed.error, null, 'Supabase did not refresh the access token.');
  assert(refreshed.data.session, 'Supabase did not return a refreshed session.');
  assert.equal(refreshed.data.session.user.id, supabaseUserId, 'Refreshed session belongs to a different user.');

  system = await createSystem(config);
  await startServer(system.app);
  const accessToken = refreshed.data.session.access_token;

  const preflight = await api('/api/v1/me', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization, content-type',
    },
  });
  assert.equal(preflight.status, 204, 'The local Vite CORS preflight failed.');
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /Authorization/);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /Content-Type/);

  const provision = await api('/api/v1/provisioning/firm', {
    accessToken,
    method: 'POST',
    body: { firmName },
  });
  assert.equal(provision.status, 201, 'Firm provisioning failed for the real Supabase user.');
  const provisioned = await provision.json();
  firmId = provisioned.user?.firmId;
  assert.equal(typeof firmId, 'string', 'Provisioning did not return a firm ID.');
  assert.equal(provisioned.user?.role, 'admin', 'Provisioning did not create an Admin membership.');

  const currentUser = await api('/api/v1/me', { accessToken });
  assert.equal(currentUser.status, 200, 'GET /api/v1/me failed for the real Supabase session.');
  assert.deepEqual(await currentUser.json(), {
    userId: supabaseUserId,
    email,
    role: 'admin',
    firmId,
  });

  const ownFirm = await api(`/api/v1/firms/${firmId}/ping`, { accessToken });
  assert.equal(ownFirm.status, 200, 'The user could not access the current firm.');
  const otherFirm = await api(`/api/v1/firms/${randomUUID()}/ping`, { accessToken });
  assert.equal(otherFirm.status, 403, 'Cross-firm access was not denied.');

  const unusableToken = await api('/api/v1/me', { accessToken: `${accessToken}.invalid` });
  assert.equal(unusableToken.status, 401, 'An unusable access token was not rejected with 401.');

  await system.pool.query("UPDATE users SET role = 'viewer' WHERE supabase_user_id = $1", [supabaseUserId]);
  await system.roleFirmResolver.invalidate(supabaseUserId);
  const deniedRole = await api('/api/v1/admin/ping', { accessToken });
  assert.equal(deniedRole.status, 403, 'Viewer membership was not denied Admin access.');

  const logout = await restoredClient.auth.signOut();
  assert.equal(logout.error, null, 'Supabase logout failed.');
  const afterLogout = await restoredClient.auth.getSession();
  assert.equal(afterLogout.data.session, null, 'Supabase logout did not clear the browser session.');

  console.log(JSON.stringify({
    emailPasswordLogin: 'passed',
    sessionRestoration: 'passed',
    tokenRefresh: 'passed',
    logout: 'passed',
    unusableToken401: 'passed',
    provisioning: 'passed',
    roleDenial403: 'passed',
    crossFirmDenial403: 'passed',
    corsPreflight: 'passed',
    googleOAuthEnabled: 'passed',
  }));
} finally {
  await cleanup();
}
