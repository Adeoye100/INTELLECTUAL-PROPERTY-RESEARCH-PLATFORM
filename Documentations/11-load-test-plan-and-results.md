# BE-23 load-test plan and results

## Suite

Standard k6-compatible assets are in `backend/load/`. They require
`LOAD_TEST_BASE_URL` and a dedicated test token, default to one virtual user for
15 seconds, add a safe `X-Load-Test` header, perform only GETs, redact tokens,
and refuse loopback, production-looking, or larger profiles without explicit
opt-in. They never target registries directly and abort on excessive errors.

| Scenario | Script | Threshold | Measured result |
|---|---|---:|---|
| Single-jurisdiction search | `single-jurisdiction-search.js` | P95 < 2 s | Pending authorized staging run |
| Federated search | `federated-search.js` | P95 < 5 s | Pending authorized staging run |
| Dashboard aggregate | `dashboard.js` | P95 < 1.5 s | Blocked: no documented/mounted backend aggregate endpoint |
| Harness smoke | `smoke.js` | tiny health request | Structure validated locally; no target run |

k6 records P50/P90/P95/P99, throughput, HTTP status distribution, timeout and
error rate; search scripts also record partial-source and per-source status.
No latency values are fabricated.

## Approved staging procedure

```sh
LOAD_TEST_BASE_URL=https://api.staging.example.test \
LOAD_TEST_ACCESS_TOKEN=dedicated-test-token \
k6 run backend/load/smoke.js

LOAD_TEST_BASE_URL=https://api.staging.example.test \
LOAD_TEST_ACCESS_TOKEN=dedicated-test-token \
LOAD_TEST_PROFILE=staged ALLOW_LARGER_LOAD_TEST=true \
k6 run backend/load/single-jurisdiction-search.js
```

Record environment, test-data identity, commit, profile, command, metrics, error
and partial-source rate, source status, and a link to non-sensitive output. Run
federated only after source licenses and a dedicated staging target are approved.

**Status:** **Load-testing suite code-complete; staging P95 verification pending.**
# VZ-03 additions

Safe k6-compatible scripts live under `backend/load/` and require an explicitly
approved `LOAD_TEST_BASE_URL`. The scripts emit `X-IPRP-Load-Test: vz-03`, use
dedicated credentials, and never target registries. No approved staging run was
performed in this pass, so no latency numbers are fabricated.

Targets: single-jurisdiction P95 <2s; federated P95 <5s; dashboard aggregate
P95 <1.5s. Status: **suite code-complete; P95 verification pending**.
