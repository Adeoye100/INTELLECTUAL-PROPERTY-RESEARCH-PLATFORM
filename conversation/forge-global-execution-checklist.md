---
project: Intellectual Property Research Platform (Forge Global)
client-executive: Taiwo Timothy Oluwagbenga (Codementor Hub)
agreement-date: 2026-06-27
tags: [forge-global, iprp, checklist]
---

# Forge Global — Execution Checklist
### Frontend · Backend · Visualization — tracked against the signed agreement (Jun 27, 2026)

> Section references point back to the doc set: PRD, TRD, App/Website Flow, UI Design Brief, Backend Schema, Implementation Plan. Check `[x]` in Obsidian and Dataview will pick these up directly by tag.

---

## ⛔ Critical Path — read before touching Backend

- [ ] **BLOCKER** — At least one trademark data source license confirmed and accessible. Nothing in Backend Phase 2 has a right to start before this. (PRD §8, Impl. Plan §5)
- [x] Hosting decision locked: AWS 
- [x] Billing provider locked: FlutterWave

Everything else below assumes these three are closed out in Week 1–2, exactly as the agreement's own timeline demands.

---

## 🖥️ FRONTEND TRACK — React + TypeScript

### Phase 1 — Foundations (Wk 1–2) `#phase1 #frontend`
- [x] FE-01 Stand up React + TS scaffold (TRD §1)
- [x] FE-02 Lock design tokens: Inter/IBM Plex Sans for UI, mono/slab accent reserved for mark names & reg numbers, 8px spacing grid, risk traffic-light palette kept fully separate from brand accent (UI Brief §2)
- [x] FE-03 Build internal design-system primitives: Button, Badge, Table, Modal (UI Brief §4)
- [x] FE-04 Wireframe the six primary screens against the nav map (Flow §1)

### Phase 2–3 — Screen build-out, wired live as endpoints land (Wk 4–9) `#phase2-3 #frontend`
- [x] FE-05 Auth: login/sign-up, firm-invite and self-serve paths (Flow §2)
- [x] FE-06 Onboarding: get the user to **one completed action** (a search or a portfolio entry) before ever showing an empty dashboard — this is a stated trust requirement, not polish (Flow §2)
- [x] FE-07 Dashboard: watches, recent alerts, portfolio health, recent searches — zero-scroll rule for unresolved High-risk alerts (UI Brief §3.1)
- [x] FE-08 Search screen: structured filters (jurisdiction, class, date range) always visible, never behind a toggle (UI Brief §3.2)
- [x] FE-09 Results table: risk badge, mark, owner, class, jurisdiction, filing date-
- [x] FE-10 Federated-source status indicator — responded / pending / unavailable, mirroring backend's graceful degradation (TRD §5)
- [x] FE-11 Confusion Risk Detail: side-by-side proposed vs. matched mark(s); phonetic/visual/class-overlap shown as three separate components, never one opaque number (UI Brief §3.3, PRD §5.2)
- [x] FE-12 Risk Detail CTAs: save to matter / research Office Actions / discard (Flow §3)
- [x] FE-13 Office Action Research panel — link precedent into a case file
- [x] FE-14 Portfolio table: renewal deadlines visually flagged on approach; one-click convert entry → Watch (UI Brief §3.4)
- [x] FE-15 Watches & Alerts feed: newest-first, unread state distinguished, each alert deep-links into Risk Detail (UI Brief §3.5, Flow §4)
- [ ] FE-16 Billing/Admin (Admin role only): seat table + role badges, usage summary framed for a renewal decision (UI Brief §3.6)
- [ ] FE-17 PDF export trigger UI — search results, risk reports, portfolio summaries
- [x] FE-18 Accessibility pass: WCAG 2.1 AA — risk level never color-only, paired with icon/label; full keyboard nav on search and results (UI Brief §5)
- [x] FE-19 Responsive pass: desktop primary; tablet secondary for portfolio/alerts only; mobile explicitly out of scope unless raised as a change order (UI Brief §6)

### Phase 4 — Hardening (Wk 9–12) `#phase4 #frontend`
- [ ] FE-20 Cross-browser / regression pass ahead of the 30-day warranty window
- [ ] FE-21 Confirm every screen in the UI Brief is wired to a **live**, not mocked, endpoint — this is the literal Definition of Done for Frontend (Impl. Plan §4)
- [ ] FE-22 Supply screenshots/flows for the admin training material deliverable (TRD §9)
- [ ] Verification and testing.

---

## ⚙️ BACKEND TRACK — Node.js + Express + PostgreSQL + Redis + Elasticsearch

### Phase 1 — Architecture (Wk 1–2) `#phase1 #backend`
- [ ] BE-01 API integration mapping per registry, finalized
- [ ] BE-02 System architecture doc signed off by both parties (Definition of Done, Impl. Plan §4)

### Phase 2 — Core build (Wk 3–8) `#phase2 #backend`
- [ ] BE-03 Auth service: JWT + refresh tokens, sessions backed by Redis
- [ ] BE-04 RBAC — Admin/Attorney/Viewer enforced at the **API layer**, not just hidden in the UI (TRD §3.3)
- [ ] BE-05 Firm/user Postgres schema live (Schema §2: `firms`, `users`)
- [ ] BE-06 Elasticsearch cluster up; composite index with dual analyzer — standard + phonetic — on `mark_text` (Schema §4)
- [ ] BE-07 Registry adapter pattern: one module per source behind a common interface, so a new jurisdiction is additive, not a rewrite (TRD §5)
- [ ] BE-08 Ingestion pipeline: Postgres first as the licensed, attributed source of truth → sync job projects into Elasticsearch — never the reverse (Schema §5)
- [ ] BE-09 Federated search service: fan-out across sources, graceful degradation returns partial results + a "source unavailable" flag rather than failing the whole query (TRD §5)
- [ ] BE-10 Confusion Risk engine: phonetic (Soundex/Metaphone), visual (Levenshtein), Nice-class overlap as a first-class filter — composite score → Low/Medium/High with `matched_mark_refs` evidence attached, unit-tested against known conflict pairs (TRD §4)
- [ ] BE-11 Portfolio CRUD (`portfolio_marks`)
- [ ] BE-12 Watch service + scheduled polling job on the Redis queue (`queue:watch_ingest`)
- [ ] BE-13 Alert generation tied to `risk_score_id` (`alerts`)
- [ ] BE-14 Subscription/billing integration (`subscriptions`, provider locked in Phase 1)
- [ ] BE-15 Rate limiting / brute-force protection on auth endpoints, Redis-backed (TRD §3.3)
- [ ] BE-16 Audit log service for sensitive actions — portfolio changes, exports, role changes (`audit_logs`)
- [ ] BE-17 **Exit check:** every endpoint in TRD §1 functionally complete against staging data by end of Wk 8

### Phase 3 overlap (Wk 9) `#phase3 #backend`
- [ ] BE-18 Office Action search/link feature — `office_action_refs`, examiner-reasoning summary linked to portfolio marks
- [ ] BE-19 `search_results` snapshot table wired for audit/export reuse

### Phase 4 — Security, load, deployment (Wk 9–12) `#phase4 #backend`
- [ ] BE-20 PDF export pipeline: search results, risk reports, portfolio summaries
- [ ] BE-21 Run a lightweight internal security pass **at the end of Phase 2**, not just in Wk 10–11 (Impl. Plan §5 risk register — this is where most late-stage audits go sideways)
- [ ] BE-22 Independent security audit: OWASP Top 10, dependency scanning, auth/session penetration checks, access-control verification — findings triaged and closed before sign-off (TRD §7)
- [ ] BE-23 Load testing against P95 targets: <2s single-jurisdiction search, <5s federated, <1.5s dashboard load (TRD §3.1)
- [ ] BE-24 Docker containerization; CI/CD (lint → test → build → deploy) with a staging gate; infrastructure-as-code for the renewal-period environment (TRD §8)
- [ ] BE-25 Multi-AZ deployment, health-checked auto-restart on API/worker processes (TRD §3.2)
- [ ] BE-26 API reference + deployment/runbook + admin training materials delivered (TRD §9, Agreement "Documentation & Training")

---

## 📊 VISUALIZATION TRACK — D3.js / Recharts / Brand System

- [ ] VZ-01 Confusion Risk breakdown visual — phonetic / visual / class-overlap as three distinct, labeled components, never collapsed into a bare number (UI Brief §3.3, PRD §5.2)
- [ ] VZ-02 Risk badge system — Low/Med/High traffic-light convention, color always paired with icon/label for colorblind accessibility, and used **only** for risk, never repurposed elsewhere (UI Brief §2, §5)
- [ ] VZ-03 Dashboard analytics — portfolio health + watch activity via D3.js/Recharts, built on cached aggregates, not a live recompute per view (TRD §3.1, UI Brief §3.1)
- [ ] VZ-04 Portfolio renewal-deadline visual flags — approaching deadlines surfaced with no click-through required (UI Brief §3.4)
- [ ] VZ-05 Federated-source status indicator — visual state per registry: responded / pending / unavailable
- [ ] VZ-06 PDF export visual templates — risk reports and portfolio summaries carry the same evidence-first hierarchy on paper that they have on screen (PRD §5.8)
- [ ] VZ-07 Brand system applied with discipline — navy `#0A1428` → teal `#146575` gradient and silver/chrome tokens live only in header, sidebar, login/signup, and status glyphs; kept fully off search tables and result lists, per your own earlier call on this exact question
- [ ] VZ-08 Backend schema ERD — finalize and file the visual asset already scoped
- [ ] VZ-09 Component-library visual audit — Admin, Attorney, and Viewer see the same visual system with different capability, not a different product (UI Brief §1.4)

---

## Ticket Count

| Track | Tickets | Hard blocker |
|---|---|---|
| Frontend | 22 | None — scaffold/token work can start immediately |
| Backend | 26 | Data-source license (Wk 1–2) |
| Visualization | 9 | Depends on Backend risk-score shape + Frontend screen shells |

**58 tickets. Twelve weeks. Three tracks running as one build, not three separate ones** — the same overlap the agreement itself specifies (Frontend Wk 4–9 starts inside Backend Wk 3–8 on purpose, so you're integrating against real contracts from Week 4, not guessing until Week 9).
