# Post-deployment smoke checklist

Run only after the controlled runbook reaches that stage, using non-sensitive
dedicated test accounts and non-destructive checks. Record time, deployment
commit/release IDs, actor, result, and ticket/reference—not secrets or client
data.

- [ ] HTTPS is enforced; no browser mixed-content warning; frontend and API
  origins match their approved environment values.
- [ ] Render `/healthz` is healthy and `/readyz` reports only its safe readiness
  status; responses and logs expose no stack/configuration detail.
- [ ] Supabase Auth login, logout, signup policy, recovery, and each exact
  callback redirect work; callback URL data is removed after exchange.
- [ ] Admin, Attorney, and Viewer have expected server-side capabilities; a
  direct unauthorized route/API attempt is concealed or forbidden as designed.
- [ ] A cross-firm attempt returns the documented concealed/not-authorized
  behavior and no metadata from the other firm.
- [ ] CORS succeeds only for the approved origin; an unapproved browser Origin
  is rejected/no permissive ACAO header. No wildcard credential policy exists.
- [ ] CSP, HSTS, no-sniff, referrer, permissions, and frame protections are
  present; the Supabase flow and required charts still render.
- [ ] API rate limiting and safe error serialization work; logs contain no
  tokens, passwords, Authorization headers, connection URLs, or keys.
- [ ] PostgreSQL read/write on non-sensitive test records and audit event
  creation work; RLS/grant metadata verification is recorded.
- [ ] Search, Office Action search, watches, alerts, and exports are either
  normal documented 404/unavailable states or have separately recorded staging
  evidence before being enabled.
- [ ] No upload route accepts multipart. If uploads are introduced later, stop
  release until server-side type/signature/size/quarantine/scanning/private
  storage/firm authorization controls are verified.
- [ ] If PDF exports are later enabled, validate firm-scoped authorization,
  attachment disposition, no-sniff, valid PDF signature, exact checksum/size,
  and absence of private storage keys from API responses.
- [ ] The production frontend bundle contains no backend-secret names or values
  and no localhost endpoint; browser console has no unexpected errors.
- [ ] Backup/PITR, restore owner, rollback release ID, alert/monitor owners,
  and Redis/DB capacity signals are documented and tested for the environment.
