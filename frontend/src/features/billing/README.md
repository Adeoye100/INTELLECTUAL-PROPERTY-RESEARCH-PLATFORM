# Administration integration boundary

FE-16 currently provides persisted client session state, Admin-only navigation and route guarding, and interactive seat/subscription UI. These controls are usability safeguards, not a security boundary.

The backend remains required to:

- authenticate access and refresh tokens;
- enforce Admin role and firm tenancy on every administration endpoint;
- enforce licensed seat, search, and watch limits transactionally;
- implement invitation, role-assignment, seat-removal, billing, and subscription endpoints;
- prevent the last Admin from being removed or demoted; and
- write immutable audit records for all access, billing, and export actions.

Do not remove the API-side authorization requirement when the real endpoints replace local frontend state.
