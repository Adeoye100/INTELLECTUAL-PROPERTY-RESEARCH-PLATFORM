# Authentication frontend boundary

The screens and guards in this folder implement frontend states and navigation only. All handlers under `src/lib/mocks/handlers.ts` are development/test mocks and are labeled `MOCK`; they do not provide authentication or authorization.

Backend dependencies still required:

- secure access/refresh-token issuance, rotation, revocation, and server-side session expiry;
- firm-tenant and role authorization on every protected API request;
- single-use, expiring invitation, password-reset, and email-verification tokens;
- transactional seat-limit enforcement during invitation acceptance;
- duplicate-account protection without leaking account existence;
- password policy, rate limiting, brute-force protection, and security audit events; and
- authoritative onboarding status derived from stored searches and portfolio records.

Persisted browser state is a convenience layer. A modified role, expiry, verification flag, or onboarding record must never grant backend access.
