# Authentication frontend boundary

The screens and guards in this folder implement frontend states and navigation only. Supabase Auth owns browser session persistence, password credentials, refresh, and Google OAuth through the single client in `src/lib/supabase.ts`. Each Supabase session is resolved once through the centralized API client's authenticated `GET /me`; its role and firm are never inferred from browser-visible Supabase metadata. Create organization provisions one new firm and its first Admin through authenticated `POST /provisioning/firm` once Supabase returns a session (immediately or after email confirmation). Ordinary members join an existing firm only through a server-issued invitation whose authoritative role defaults to Viewer in the Admin UI. The remaining auth-shaped MSW handlers cover application provisioning and invitations only; they do not emulate Supabase authentication or authorization.

Backend dependencies still required:

- Supabase project provider, redirect-URL, email-template, and session-policy configuration;
- firm-tenant and role authorization on every protected API request;
- single-use, expiring application invitation tokens;
- transactional seat-limit enforcement during invitation acceptance;
- duplicate-account protection without leaking account existence;
- Supabase password policy plus application rate limiting and security audit events; and
- authoritative onboarding status derived from stored searches and portfolio records.

The Zustand state is an in-memory rendering projection of the Supabase session. Supabase persists the actual browser session, and every protected backend request remains responsible for resolving the authoritative local firm and role.
