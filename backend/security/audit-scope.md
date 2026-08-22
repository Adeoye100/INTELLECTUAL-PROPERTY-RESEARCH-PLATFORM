# Independent reviewer scope

Review the committed BE-22 candidate and its dependency lockfile, not an
untracked workstation or a production system. Exercise only injected/local tests
until written staging authorization identifies an isolated target and test
accounts.

Priorities: strict Bearer/JWT verification; membership/RBAC/firm isolation;
last-Admin concurrency; rate-limit forwarded-address and malformed-identity
handling; request/parser/queue bounds; registry/Elasticsearch URL and response
handling; audit append-only/redaction; private export integrity and authorization;
OpenAPI route parity; dependency/secret process; and operational topology.

Out of scope unless separately authorized: BE-14, frontend implementation,
production traffic, social engineering, destructive tests, credential rotation,
cloud provisioning, and load/penetration tests. Report evidence by file/test and
safe error code only; never include tokens, cookies, raw credentials, or exploit
payloads.
