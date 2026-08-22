# Reviewer checklist

- [ ] Confirm commit and manifest integrity; no credential value is in evidence.
- [ ] Run local route/RBAC, JWT, rate-limit, parser, queue, audit, export,
  response-bound, health, and OpenAPI suites.
- [ ] Inspect all route modules versus `openapi.json` and route-parity test.
- [ ] Confirm firm ID is membership-derived and cross-firm resources conceal existence.
- [ ] Confirm source adapters reject unsafe destinations, redirects, oversized
  declared/streamed/decoded payloads, and malformed JSON without partial output.
- [ ] Review dependency advisory availability; record source/timestamp/result.
- [ ] Review secret-scan scope and false-positive handling without viewing values.
- [ ] On authorized staging only, verify migrations, TLS, proxy/CORS, Redis ACLs,
  worker heartbeat, storage permissions, backup/restore, and non-destructive smoke checks.
- [ ] Record independent identity, date, scope, methodology, findings, and sign-off decision.
