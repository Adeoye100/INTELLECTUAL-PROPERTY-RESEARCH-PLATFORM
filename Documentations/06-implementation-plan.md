# Implementation Plan
## Intellectual Property Research Platform

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | July 30, 2026 |
| **Source Agreement** | Codementor Hub Development Team — Project Agreement, June 27, 2026 |

This plan follows the phases and weeks already committed in the signed agreement — it does not introduce a new timeline, it operationalizes the existing one.

---

## 1. Phase Overview

| Phase | Weeks | Focus | Contract Cost Line |
|---|---|---|---|
| 1. Discovery & Architecture | 1–2 | API mapping, data model, technical spec | (folded into overall scope) |
| 2. Backend Development | 3–8 | Multi-source DB integration, search engine, risk engine, watch/notifications, auth/billing | ₦100,000 |
| 3. Frontend & UI | 4–9 | Search UI, dashboards, portfolio UI, PDF export | ₦80,000 |
| — Database Design & Ingestion | (parallel, wks 3–8) | Schema, ingestion pipelines | ₦50,000 |
| 4. Testing & Deployment | 9–12 | QA, security audit, cloud deployment, docs/training | ₦40,000 |
| — Documentation & Training | (within Phase 4) | | ₦30,000 |

Note the overlap by design: Frontend (weeks 4–9) starts one week into Backend (weeks 3–8) rather than waiting for it to finish — this is intentional so UI work de-risks against real API contracts early instead of integrating everything in week 9.

## 2. Week-by-Week Breakdown

### Weeks 1–2 — Discovery & Architecture
- Finalize which trademark data sources are licensed and available (client-secured, per agreement) — **hard blocker for Phase 2 start**
- Lock hosting decision: AWS vs. GCP
- Lock billing provider decision
- Produce/finalize: this documentation set (PRD, TRD, flows, UI brief, schema)
- **Exit criteria:** technical spec signed off; at least one data source confirmed accessible

### Weeks 3–4 — Backend Foundations
- Auth service (JWT, RBAC), firm/user data model live
- Elasticsearch cluster stood up; first data source ingestion pipeline running
- Frontend: project scaffold, design system components begin (per UI brief)

### Weeks 5–6 — Core Search & Risk Engine
- Federated search across connected sources
- Confusion Risk scoring (phonetic, visual, class overlap) — unit-tested against known conflict pairs
- Frontend: Search + Results screens wired to early API

### Weeks 7–8 — Portfolio, Watch, Billing
- Portfolio CRUD, Watch configuration, Alert generation
- Subscription/billing integration
- Frontend: Portfolio, Watch/Alerts, Billing/Admin screens
- **Exit criteria (end of Backend phase):** all API endpoints in TRD §1 functionally complete against staging data

### Week 9 — Office Action Research & PDF Export
- Office Action search/link feature
- PDF export pipeline (search results, risk reports, portfolio summaries)
- Frontend UI phase substantially complete

### Weeks 10–11 — Testing & Security Audit
- Full regression + load testing against P95 targets (TRD §3.1)
- Independent security audit (OWASP-aligned); findings triaged and fixed, not just logged
- Bug-fix pass ahead of the 30-day post-launch warranty window

### Week 12 — Deployment & Handover
- Production deployment to chosen cloud provider
- API reference, runbook, and admin training materials delivered (per agreement's Documentation & Training line)
- Client sign-off → triggers final ₦100,000 milestone payment

## 3. Payment Milestones (per agreement)

| Milestone | Amount | Trigger |
|---|---|---|
| Contract signing | ₦200,000 | Upfront |
| Completion & successful deployment | ₦100,000 | Week 12 sign-off |
| Yearly renewal (hosting, maintenance, uptime SLA) | ₦200,000/yr | Ongoing, post-launch |

## 4. Definition of Done (per phase)

- **Discovery:** spec + architecture doc signed off by both parties
- **Backend:** all endpoints pass integration tests against seeded data; no critical security findings open
- **Frontend:** every screen in the UI brief implemented and wired to live (not mocked) endpoints
- **Testing/Deployment:** security audit closed, load targets met, production deployment verified, documentation delivered

## 5. Risk Register

| Risk | Likelihood | Impact | Owner Action |
|---|---|---|---|
| Data licensing delayed past Week 2 | Medium | High — cascades entire timeline | Escalate to client immediately; do not silently absorb the slip into Phase 2 |
| Security audit surfaces late-stage findings (Week 10–11) | Medium | High — threatens Week 12 deployment | Run a lightweight security pass at end of Phase 2, not only at the end |
| Scope requests outside the 6 listed deliverables | Medium | Medium — budget/timeline | Route through a documented change order against the signed agreement |

## 6. Post-Launch (Yearly Renewal Scope)

Per the agreement, the ₦200,000/year renewal covers hosting, maintenance, and the 99.5% uptime SLA — it does not cover new feature development. Any feature request after handover is a new, separately scoped engagement.

## 7. Current execution evidence (2026-08-05)

The frontend quality-gate audit and executable evidence are recorded in `08-frontend-quality-gate.md`; frontend/backend candidate contracts and unresolved role rules are recorded in `07-frontend-api-contracts.md`.

The Phase 3 exit criterion is **not complete**. The frontend has a verified live-ready transport foundation and development fixtures, but `backend/` contains no application implementation or verifiable route. FE-21, live PDF generation, backend authorization/audit ownership, and staging integration remain blocked until the verification gates in the API contract register pass.
