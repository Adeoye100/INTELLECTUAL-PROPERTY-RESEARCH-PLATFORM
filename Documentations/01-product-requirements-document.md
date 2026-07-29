# Product Requirements Document (PRD)
## Intellectual Property Research Platform

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | July 30, 2026 |
| **Source Agreement** | Codementor Hub Development Team — Project Agreement, June 27, 2026 |
| **Status** | Draft for internal review |

> A product is defined less by what it contains than by what it lets a person decide faster and with more confidence. That is the test every feature below has to pass.

---

## 1. Executive Summary

The platform gives IP attorneys, brand owners, and firm administrators a single workspace to search, clear, watch, and manage trademarks across multiple jurisdictions — replacing the current pattern of juggling several disconnected government and third-party registry portals per search.

Five capabilities anchor the product, all traceable to the signed agreement:
1. **Instant Search** across multi-source trademark data
2. **Confusion Risk Analysis** (similarity scoring)
3. **Office Action Research**
4. **Portfolio Management & Watch/Alerts**
5. **Analytics & Reporting** (dashboards, PDF export)

## 2. Problem Statement

Clearing or defending a mark today means manually querying registries like USPTO TESS, EUIPO TMview, and WIPO's Global Brand Database one at a time, then eyeballing similarity by hand. This is slow, inconsistent across reviewers, and doesn't scale once a firm or brand holds more than a handful of marks across borders. There is no single system of record that combines search, risk scoring, monitoring, and portfolio tracking in one place.

## 3. Target Users / Personas

| Persona | Description | Primary Jobs-to-be-Done |
|---|---|---|
| **IP Attorney / Paralegal** | Power user; runs clearance searches, drafts and researches Office Action responses, manages multiple client portfolios | Search fast, trust the risk score, cite sources defensibly |
| **Brand Owner / Business Manager** | Non-specialist; owns 1–20 marks | Get alerted to conflicts, understand risk in plain language |
| **Firm Administrator** | Manages seats, billing, and access for a firm | Control cost, onboard/offboard users, oversee usage |

## 4. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Faster clearance | Median time from query to actionable result | < 15 minutes (from hours today) |
| Reliable monitoring | Time from registry update to watch alert | < 24 hours |
| Platform trust | Uptime (contractual SLA, post-launch year) | 99.5% |
| Adoption | Weekly active seats / licensed seats | > 60% by month 3 post-launch |
| Data confidence | False-negative rate on confusion risk (validated sample) | Tracked and reported monthly; no silent failures |

## 5. Core Features

### 5.1 Instant Search
- Free-text and structured search (mark name, owner, class, jurisdiction, status, filing date range)
- Multi-source federation: results merged from all connected registries into one ranked list
- Phonetic and fuzzy matching, not just exact string match (protects against near-miss marks)

### 5.2 Confusion Risk Analysis
- Automated similarity score per candidate result (visual, phonetic, and conceptual similarity)
- Class-of-goods overlap detection (Nice Classification)
- Human-readable risk rating (Low / Medium / High) backed by the underlying score and matched marks, so a reviewer can defend the conclusion — never a black-box number alone

### 5.3 Office Action Research
- Search historical Office Actions and examiner reasoning for comparable marks/classes
- Link found precedent directly into a case file for reuse in a response

### 5.4 Portfolio Management
- Central register of the firm's or brand's own marks, by client/matter
- Renewal deadline tracking, status history, document attachments

### 5.5 Watch & Notification
- Continuous monitoring of new filings against a saved watch list
- Configurable alert channels (email, in-app; SMS as a stretch goal)
- Digest and real-time alert modes

### 5.6 Multi-Jurisdiction Coverage
- Launch scope to be confirmed in Discovery (Phase 1), driven by which data-source licenses the client secures — see Section 8

### 5.7 Authentication & Billing
- Firm-level accounts with seat-based user management and role permissions (Admin / Attorney / Viewer)
- Subscription billing and usage tracking

### 5.8 Reporting & Export
- PDF export of search results, risk reports, and portfolio summaries — suitable to attach to client correspondence or an Office Action response
- Dashboard visualizations of portfolio health and watch activity

## 6. Feature Prioritization by Phase

| Phase | Weeks | Features Shipped |
|---|---|---|
| 1 — Discovery & Architecture | 1–2 | Data-source mapping, system design (no user-facing feature yet) |
| 2 — Backend | 3–8 | Search, confusion risk engine, watch/notification, auth & billing (API-complete) |
| 3 — Frontend & UI | 4–9 | Search UI, dashboards, portfolio UI, PDF export (overlaps backend to de-risk integration) |
| 4 — Testing & Deployment | 9–12 | Hardening, security audit, cloud deployment, documentation |

## 7. Out of Scope

Explicitly excluded per the signed agreement:
- Marketing, sales, and customer acquisition activity
- Data licensing fees from trademark registries — **billed directly to the client**, not bundled into build cost
- Legal advice or opinion generation — the platform surfaces research and risk signals; it does not replace attorney judgment or file anything on a user's behalf

## 8. Assumptions & Dependencies

- Client secures data-source licensing/API access for at least one authoritative registry before end of Phase 1, or the Discovery timeline slips
- Jurisdictional coverage at launch is bounded by which licenses are actually in place — this should be nailed down as a hard list in Discovery, not left implicit
- 30-day post-launch bug-fix warranty and 99.5% uptime SLA apply only during the paid yearly renewal period

## 9. Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Registry API rate limits or licensing gaps | Delays search completeness | Confirm licenses in Phase 1; design search to degrade gracefully per source |
| Similarity algorithm false negatives | Legal/reputational exposure for users who rely on it | Publish a stated confidence methodology; never present a bare score without matched evidence |
| Scope creep beyond signed deliverables | Budget/timeline overrun | Any addition routes through a change order, not silent absorption into existing phases |
