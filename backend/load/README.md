# Safe backend load suite

These are standard k6-compatible scripts. k6 is not a locked repository
dependency, so the suite is intentionally not executed here or downloaded.

All scripts require a dedicated test token and `LOAD_TEST_BASE_URL`. The default
profile is a 15-second, one-VU smoke profile. Loopback requires
`ALLOW_LOCAL_MOCK_LOAD_TEST=true`; a production-looking hostname additionally
requires `ALLOW_PRODUCTION_LOAD_TEST=true`; the staged profile requires
`ALLOW_LARGER_LOAD_TEST=true`. Scripts issue only GET requests, send
`X-Load-Test: iprp-safe-*`, never log the token, never contact registries
directly, and abort when the error threshold is exceeded.

```sh
LOAD_TEST_BASE_URL=https://api.staging.example.test \
LOAD_TEST_ACCESS_TOKEN=dedicated-test-token \
k6 run backend/load/smoke.js

LOAD_TEST_BASE_URL=https://api.staging.example.test \
LOAD_TEST_ACCESS_TOKEN=dedicated-test-token \
LOAD_TEST_PROFILE=staged ALLOW_LARGER_LOAD_TEST=true \
k6 run backend/load/single-jurisdiction-search.js
```

The search scenarios record standard k6 latency percentiles/throughput/statuses
plus timeout, partial-source, and source-status metrics. The targets are P95
under 2 seconds for single-jurisdiction and 5 seconds for federated search.

There is no mounted/documented backend dashboard aggregate endpoint. Therefore
`dashboard.js` deliberately fails before sending traffic; it must not be
pointed at the frontend planning-only `/dashboard/summary` path. A future
documented aggregate endpoint can add a scenario with the 1.5-second P95 target.
