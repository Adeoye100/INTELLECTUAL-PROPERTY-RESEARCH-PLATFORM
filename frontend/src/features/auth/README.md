# Authentication frontend boundary

The screens and guards in this folder implement frontend states and navigation only. Supabase Auth owns browser session persistence and refresh through the single client in `src/lib/supabase.ts`. The remaining auth-shaped MSW handlers cover application provisioning and invitations only; they do not emulate Supabase authentication or authorization.

Backend dependencies still required:

- Supabase project provider, redirect-URL, email-template, and session-policy configuration;
- firm-tenant and role authorization on every protected API request;
- single-use, expiring application invitation tokens;
- transactional seat-limit enforcement during invitation acceptance;
- duplicate-account protection without leaking account existence;
- password policy, rate limiting, brute-force protection, and security audit events; and
- authoritative onboarding status derived from stored searches and portfolio records.

The Zustand state is an in-memory rendering projection of the Supabase session. Supabase persists the actual browser session, and every protected backend request remains responsible for resolving the authoritative local firm and role.
