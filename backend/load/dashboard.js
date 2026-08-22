import { assertDashboardAggregateAvailable } from './config.js';

// The current API intentionally has no /dashboard aggregate route. This
// standard k6-compatible entry point fails before traffic rather than treating
// the frontend-only planning path as a backend performance endpoint.
assertDashboardAggregateAvailable();
