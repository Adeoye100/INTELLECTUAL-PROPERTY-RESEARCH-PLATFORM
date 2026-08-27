# ADR-001: initial hosting topology selected

**Status:** Superseded for initial deployment by the approved Supabase / Render
/ Vercel topology. Retained for future provider-neutral multi-AZ/IaC work.

Initial deployment uses Supabase for PostgreSQL/Auth, Render for the API, and
Vercel for the frontend. It does not authorize multi-AZ or optional search,
queue, worker, and private-storage provisioning. See
[15](15-initial-deployment-readiness.md) through
[20](20-post-deployment-smoke-checklist.md).

## Historical context for later infrastructure work

The TRD and implementation plan name AWS or Google Cloud but do not select one.
BE-24 therefore adds provider-neutral architecture and variable interfaces in
`../infra/` rather than fabricating Terraform, account IDs, networks, or a
deployment workflow for either cloud.

The authorized decision must select the provider, region, approved remote-state
and locking service, container registry, managed PostgreSQL/Redis/search
services, private object storage, observability platform, backup retention,
budget, and staging/production accounts/projects. The resulting IaC must retain
the BE-25 multi-AZ requirements and use secret references only.
