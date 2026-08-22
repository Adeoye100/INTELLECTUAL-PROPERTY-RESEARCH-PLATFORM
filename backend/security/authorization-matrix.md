# Mounted-route authorization matrix

`phase2-route-inventory.test.js` is the executable companion. `401` means no
Bearer/membership; `404` means concealed missing/cross-firm resource; `FG-404`
means the documented feature-gate 404. Firm/actor values always derive from the
verified membership, never request data.

| Route / methods | Unauthenticated | Admin | Attorney | Viewer | Cross-firm / feature-disabled |
|---|---|---|---|---|---|
| `/healthz`, `/readyz` GET | Public | Public | Public | Public | No tenant data |
| `/auth/invitations/{token}` GET; `/accept` POST | Public + IP limit | Public | Public | Public | Signed invitation selects firm |
| `/provisioning/firm` POST | 401 | Verified identity | Verified identity | Verified identity | No body firm selector |
| `/me` GET | 401 | 200 | 200 | 200 | Membership only |
| `/admin/invitations` POST | 401 | 201 | 403 | 403 | Membership firm only |
| `/admin/ping` GET | 401 | 200 | 403 | 403 | N/A |
| `/attorney/ping` GET | 401 | 200 | 200 | 403 | N/A |
| `/viewer/ping` GET | 401 | 200 | 200 | 200 | N/A |
| `/firms/{firmId}/ping` GET | 401 | 200 | 200 | 200 | other firm 403 |
| `/search` GET | 401 | 200 | 200 | 200 | FG-404 when disabled |
| `/search-results` GET; `/{id}` GET | 401 | 200 | own history | own history | foreign 404 |
| `/office-actions/search` GET | 401 | 200 | 200 | 200 | FG-404 when disabled |
| `/portfolio-marks` GET / POST | 401 | 200 / 201 | 200 / 201 | 200 / 403 | body firm rejected |
| `/portfolio-marks/{id}` GET / PATCH / DELETE | 401 | 200 / 200 / 204 | 200 / 200 / 204 | 200 / 403 / 403 | foreign 404 |
| `/watches` GET / POST | 401 | 200 / 201 | 200 / 201 | 200 / 403 | body firm rejected |
| `/watches/{id}` GET / PATCH / DELETE | 401 | 200 / 200 / 204 | 200 / 200 / 204 | 200 / 403 / 403 | foreign 404 |
| `/alerts` GET | 401 | 200 | 200 | 200 | firm scoped |
| `/alerts/{id}` GET / PATCH | 401 | 200 / 200 | 200 / 200 | 200 / 403 | foreign 404 |
| `/audit-logs` GET | 401 | 200 | 403 | 403 | firm scoped |
| `/users/{id}/role` PATCH | 401 | 200 | 403 | 403 | foreign 404; last Admin guarded |
| nested Office Action refs GET / POST | 401 | 200 / 201 | 200 / 201 | 200 / 403 | parent/child foreign 404; body firm rejected |
| nested Office Action ref `{id}` GET / PATCH / DELETE | 401 | 200 / 200 / 204 | 200 / 200 / 204 | 200 / 403 / 403 | parent/child foreign 404 |
| `/exports` GET / POST | 401 | 200 / 202 | own list / 202 | 403 | FG-404 when disabled; body firm rejected |
| `/exports/{id}` GET; `/download` GET | 401 | 200 | 200 | 403 | foreign 404; private integrity checked |

The matrix must be changed with a route and its `openapi.json` entry. The
OpenAPI parity suite fails on added/removed documented path/methods, while
focused service tests supply nested ownership, tenancy and last-Admin evidence.
