# Safe backend load-test harness (VZ-03)

These k6-compatible scripts are intentionally not executed by CI. They require
an explicitly approved staging URL and dedicated test data. `smoke.js` is the
only default-sized profile; larger profiles require `LOAD_TEST_PROFILE=staged`
and `ALLOW_PRODUCTION_LOAD_TEST=true` for production-looking hosts.

Required environment: `LOAD_TEST_BASE_URL` (API base, ending in `/api/v1`).
Optional: `LOAD_TEST_TOKEN` (dedicated token; never print it), `LOAD_TEST_PROFILE`.
The scripts send `X-IPRP-Load-Test: vz-03` and never call registries directly.

Example (approved staging only): `LOAD_TEST_BASE_URL=https://staging.example/api/v1 LOAD_TEST_TOKEN=… k6 run backend/load/smoke.js`.
