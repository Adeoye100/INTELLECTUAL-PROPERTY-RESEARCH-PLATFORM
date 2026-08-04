# FE-06 onboarding integration boundary

The `forge-client-onboarding-v1` local-storage record is intentionally separate from authentication and backend domain data. Every record is tagged `source: client-device`; it means only that this browser observed a successful frontend search submission or portfolio-create response.

The backend still needs to provide authoritative per-user onboarding status derived from stored searches and portfolio marks. Once available, the dashboard should prefer that server response, reconcile or discard client hints, and never create legal/audit records from local onboarding state.
