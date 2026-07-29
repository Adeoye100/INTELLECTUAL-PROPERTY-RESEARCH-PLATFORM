# UI Design Brief
## Intellectual Property Research Platform

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | July 30, 2026 |

> Dieter Rams' first principle of good design is that it is innovative — but his tenth is that it is as little design as possible. A legal-research tool lives or dies on the second half of that pair: attorneys need density and precision, not decoration. Every screen here is judged by whether it helps someone trust a risk score in under ten seconds.

---

## 1. Design Principles

1. **Evidence over assertion** — a risk badge is never shown without the matched marks and reasoning one click (or one glance) away.
2. **Density with hierarchy** — this is a working tool for professionals reviewing many results per session; whitespace should organize, not pad.
3. **Calm authority** — a restrained, confident visual language (think legal/fintech, not consumer app) — the tone should read as precise, not playful.
4. **Consistency across roles** — Admin, Attorney, and Viewer see the same visual system with different capability, not a different product.

## 2. Visual System

| Element | Direction |
|---|---|
| **Typography** | A clean, highly legible sans-serif for UI text (e.g., Inter or IBM Plex Sans); a monospace or slab accent reserved for mark names/registration numbers to visually distinguish "data" from "chrome" |
| **Color** | Neutral base (near-white / near-black text) with a single accent color for primary actions; risk levels use a consistent traffic-light convention (Low = green, Medium = amber, High = red) used *only* for risk — not repurposed elsewhere, so it stays meaningful |
| **Spacing** | 8px base grid; generous row height in dense tables so scanning many results doesn't feel cramped |
| **Elevation** | Minimal — flat surfaces with subtle borders over heavy shadows; this is a tool, not a showcase |

## 3. Key Screens

### 3.1 Dashboard
- At-a-glance: active watches, recent alerts, portfolio health, recent searches
- No screen should require scrolling to see "is anything on fire" (i.e., unresolved High-risk alerts)

### 3.2 Search & Results
- Search bar with structured filters (jurisdiction, class, date range) always visible, not hidden behind a toggle
- Results as a scannable table/list with risk badge, mark name, owner, class, jurisdiction, filing date
- Federated-source status indicator (which sources have responded, which are pending/unavailable) — supports the graceful-degradation behavior defined in the TRD

### 3.3 Confusion Risk Detail
- Side-by-side comparison of the proposed mark and the matched mark(s)
- Explicit breakdown: phonetic similarity, visual similarity, class overlap — shown as components, not collapsed into one opaque score
- Clear call-to-action: save to matter, research Office Actions, discard

### 3.4 Portfolio
- Table view with renewal deadlines visually flagged as they approach
- One-click conversion from a portfolio entry into a Watch

### 3.5 Watches & Alerts
- Alert feed, most recent first, unread state clearly distinguished
- Each alert links directly into Confusion Risk Detail for the conflicting filing

### 3.6 Billing / Admin
- Seat table with role badges; usage summary (searches, watches) framed for a renewal decision, not just raw numbers

## 4. Component Approach

- Component-driven build in React + TypeScript; a small internal design system (buttons, badges, tables, modals) rather than ad hoc styling per screen
- Data-visualization components (D3.js/Recharts) reserved for the Dashboard and Portfolio analytics — result tables themselves stay tabular, not chart-ified, since attorneys need to scan exact values

## 5. Accessibility

- WCAG 2.1 AA as the working target: color is never the only signal for risk level (pair with icon/label, since red/green cannot be color-only for colorblind users)
- Full keyboard navigation for search and results review — this is professional daily-use software, not a marketing site

## 6. Responsive Behavior

- Primary usage is assumed desktop/laptop (legal research workflow); tablet support for portfolio/alert review is a secondary target
- Mobile is out of scope for this phase unless raised as a change order
