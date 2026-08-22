# ADR-001: hosting provider selection remains blocked

**Status:** Open — decision required before provider-specific provisioning.

The TRD and implementation plan name AWS or Google Cloud but do not select one.
BE-24 therefore adds provider-neutral architecture and variable interfaces in
`../infra/` rather than fabricating Terraform, account IDs, networks, or a
deployment workflow for either cloud.

The authorized decision must select the provider, region, approved remote-state
and locking service, container registry, managed PostgreSQL/Redis/search
services, private object storage, observability platform, backup retention,
budget, and staging/production accounts/projects. The resulting IaC must retain
the BE-25 multi-AZ requirements and use secret references only.
