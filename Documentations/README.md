# Delivery index

- [Backend schema](05-backend-schema.md)
- [API contracts](07-frontend-api-contracts.md) and [OpenAPI](../backend/openapi.json)
- [Phase 2 exit and staging gates](08-phase2-backend-exit-check.md)
- [Internal security review](09-internal-security-review.md)
- [Independent-audit handoff](10-independent-security-audit-handoff.md)
- [Load-test plan/results](11-load-test-plan-and-results.md)
- [Deployment and operations runbook](12-deployment-and-operations-runbook.md)
- [Admin training guide](13-admin-training-guide.md)
- [Hosting-provider ADR](14-hosting-provider-decision.md) and [IaC interface](../infra/README.md)
- [Visualization Track audit and delivery index](14-visual-system-and-component-audit.md) and [status](15-visualization-track-status.md)
- [Initial deployment readiness](15-initial-deployment-readiness.md)
- [Supabase deployment checklist](16-supabase-deployment-checklist.md)
- [Render deployment checklist](17-render-deployment-checklist.md)
- [Vercel deployment checklist](18-vercel-deployment-checklist.md)
- [Initial deployment runbook](19-initial-deployment-runbook.md)
- [Post-deployment smoke checklist](20-post-deployment-smoke-checklist.md)
- [Production billing, registry, auth, and security handoff](22-production-billing-registry-auth-security.md)

BE-14 Paystack billing is implemented behind a disabled production feature gate.
Live credentials, migration application, provider webhook verification, registry
feed access, staging, independent-audit, P95, and Multi-AZ failover evidence are
operational gates rather than repository implementation claims.
