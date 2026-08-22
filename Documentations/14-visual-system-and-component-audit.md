# Visualization Track component and visual audit

## Scope and status

VZ-01–VZ-09 uses Recharts 3.10.1 already present in `frontend/package.json`.
The same shell, typography, spacing and state components are used for Admin,
Attorney and Viewer; role changes affect actions and API permissions only.

## Component inventory

`ChartCard`, `ChartSkeleton`, `ChartEmptyState`, `ChartErrorState`,
`AccessibleDataTable`, `RiskBadge`, `SourceStatusIndicator`,
`RenewalDeadlineFlag`, and `ConfusionRiskBreakdown` are shared primitives.
Dashboard analytics consumes the firm-scoped `/dashboard/analytics?range=30d`
aggregate. Search evidence remains tabular; charts do not replace exact values.

## Token-use matrix

| Token family | Allowed | Prohibited |
|---|---|---|
| Navy/teal gradient | Header, navigation, auth, approved glyphs | Search tables, result cards, data cells |
| Chrome/silver | Header, navigation, auth, small glyphs | Dense evidence backgrounds |
| Risk low/medium/high | RiskBadge and risk evidence only | Renewal, registry availability, success, buttons |
| Non-risk status | Source and renewal indicators | Risk conclusions |

## Role/capability matrix

| Surface | Admin | Attorney | Viewer |
|---|---|---|---|
| Dashboard/search/evidence/portfolio/watches/alerts | View | View | View |
| Office Action research and search history | View/use | View/use | View |
| Exports | Request/download where feature enabled | Request/download where feature enabled | API-controlled unavailable state |
| Audit logs | View | Forbidden | Forbidden |
| User-role management | Manage | Forbidden | Forbidden |
| Portfolio/watch/alert mutations | Allowed | Allowed | Absent/forbidden |

## Accessibility and responsive findings

Charts have visible titles, fixed scales, text-table equivalents and no
animation. Reduced-motion CSS disables transitions/animation. Status and risk
meaning includes text and an icon/shape; color is supplemental. Explicit chart
heights and narrow-width table fallbacks avoid page-level overflow. Manual
keyboard, screen-reader, 200% zoom and high-contrast visual QA remain staging
gates; automated checks do not establish full WCAG conformance.

## Before/after summary and remaining gates

The previous dashboard risk list and radar-only risk view now have explicit
component scores, accessible table equivalents, cached aggregate freshness,
neutral renewal/source states, and shared role-neutral primitives. Remaining
gates are approved staging visual review, real P95 measurements, independent
security audit, and deployed failover verification.
