# Independent security audit handoff — BE-22

**Reviewed engineering baseline:** `6f9a751917741330caae0ddd0502414cf3d0497e` (BE-21)

**Status:** **Engineering remediation and independent-audit package complete;
independent reviewer execution/sign-off pending.** The implementer is not an
independent auditor. No penetration test, external target, production account,
or separate reviewer sign-off occurred.

## Engineering remediation

- BE-21’s open registry size-control finding is remediated by
  `registries/bounded-response.js`. It rejects declared oversized transport
  responses, bounds streamed bytes when length is absent/dishonest, aborts on a
  limit breach, bounds JSON, and retains safe `REGISTRY_RESPONSE_TOO_LARGE`
  source-unavailable behavior.
- USPTO bulk listing/archive and TSDR JSON use the helper. Bulk archive parsing
  bounds compressed input and decompressed XML and does not yield partial records
  if an archive subsequently fails a bound.
- Health/readiness, heartbeat, route/OpenAPI parity, and the existing BE-21
  auth/RBAC/tenant, queue, export, audit, header, parser, CORS, and error suites
  are included in the evidence manifest.

## Findings for independent review

| ID | Status | Decision |
|---|---|---|
| ISR-011 — registry response/decompression bounds | Fixed locally | Independent reviewer should inspect source-specific limits and run only approved staging fixtures. |
| Session revocation latency | Accepted architecture | Supabase owns refresh/session state; JWT/cache behavior is documented. Decide whether a stronger revocation SLA is required. |
| Filesystem/object storage deployment controls | Operational gate | Validate private root/bucket ACLs, encryption, lifecycle, symlink/TOCTOU policy, and corrupted-object behavior in staging. |
| Dependency advisory currency | Operational gate | The BE-21 offline audit received no advisory data; do not claim dependency safety without approved current data. |
| Hosting/provider controls | Operational gate | AWS/GCP is unselected; validate network, edge, secrets, and managed services only after ADR-001. |

## Review boundaries and commands

Run only against an authorized disposable environment:

```sh
pnpm --dir backend check
pnpm --dir backend test:unit
pnpm --dir backend migration:check
pnpm --dir backend security:secrets
pnpm --dir backend openapi:check
```

The evidence package is `backend/security/`; it contains no tokens, raw scan
output, credentials, or exploit payloads. See `09-internal-security-review.md`
for BE-21 scope and `12-deployment-and-operations-runbook.md` for gates.
