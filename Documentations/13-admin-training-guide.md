# Administrator training guide

## Roles

| Role | May do | Must not do |
|---|---|---|
| Admin | Manage firm invitations/roles, read audit logs, manage portfolio/watches/alerts, request exports | Remove or demote the last active Admin; share tokens; treat research output as legal advice |
| Attorney | Manage portfolio/watches/alerts, use search/Office Actions, request own exports | Change roles, read audit logs, administer firm users |
| Viewer | Read search history, portfolio, watches, alerts, Office Actions | Create/change/delete records, exports, users, or roles |

## Procedures

1. **Invite or role change:** confirm the firm and person, use the Admin route,
   then verify the resulting role. Keep at least two active Admins where
   possible; the system blocks removal of the last active Admin.
2. **Portfolio/watch/alert:** record only attributed registry data, create a
   watch for a firm-owned mark, review alerts, and mark read/dismiss rather than
   deleting evidence.
3. **Search and Office Actions:** inspect each source status. `partial` or
   `unavailable` means the result is incomplete; retain genuine source
   attribution and do not invent examiner reasoning.
4. **Search snapshots:** use history to retrieve the exact historical search;
   snapshots are immutable and do not rerun search/risk analysis.
5. **PDF exports:** Admin/Attorney requests are queued. Retry the same request
   with its idempotency key after a timeout. Download only completed exports;
   report a stable failed status to support, never request storage paths/URLs.
6. **Audit review:** Admins filter the append-only audit log for sensitive
   activity. Escalate unexpected role, export, or access activity with request
   ID/time, not copied tokens or raw bodies.

## Security incident escalation

Stop sharing access, preserve the safe error code/time/resource ID, notify the
authorized security contact, and follow the operations runbook. Do not edit
audit records, disable rate limits, bypass a feature gate, run unapproved scans,
download private storage directly, or expose credentials in screenshots/tickets.

The platform is research assistance only. Risk labels, source summaries, Office
Action references, and exports are not legal opinions, clearance decisions, or
legal advice; obtain qualified legal review.
