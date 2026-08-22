# Provider-neutral infrastructure interface

The project documents **AWS or Google Cloud** but has not selected one. This
directory is deliberately not Terraform for either provider: provisioning an
invented cloud would create a false deployment claim.

`architecture.json` is the executable-neutral topology contract and
`variables.schema.json` is the input interface for the selected provider’s IaC.
Production requires two availability zones, two API replicas, isolated API and
worker workloads, private data services, encrypted managed state, health/readiness
checks, autoscaling bounds, backups, deletion protection, and the alerts listed
in the architecture file. Staging is intentionally cost-sensitive and makes no
multi-AZ claim.

After ADR-001 selects AWS or GCP, create provider-specific modules under
`infra/aws/` or `infra/gcp/`; use encrypted remote state with locking, distinct
staging/production state namespaces, validated variables, secret-manager
references rather than values, and outputs limited to non-sensitive endpoints.
Run the provider formatter/validator and a non-mutating plan only after the
account/project, remote-state location, and approval path are authorized. Never
apply from this repository without that authorization.
