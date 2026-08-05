# Frontend Quality Gate Evidence

## Audit scope and limitation

Audited on 2026-08-05 against the product, technical, flow, UI, schema, implementation-plan, API-contract, project-agreement, and current frontend/backend repository sources. This is an evidence register, not a staging sign-off.

The repository backend still contains only `backend/package.json`; it has no application, routes, tests, or OpenAPI specification. Consequently FE-21, real PDF generation, the Backend definition of done, and the Phase 3 Frontend exit gate remain blocked. MSW responses are fixtures and are never counted as live integration evidence.

Automated keyboard checks use Testing Library/User Event in jsdom. Responsive evidence covers agreed desktop/tablet breakpoints and overflow behavior in code plus component tests; a physical-device, browser-matrix, and assistive-technology session remains a release verification activity and is not fabricated here.

## Quality checklist

| Gate | Verified evidence | Status |
|---|---|---|
| Route failures and navigation loading | `app/RouteFeedback.tsx` is installed as the public, auth, and authenticated branch `errorElement`; it focuses the error heading and exposes retry/home actions. Route modules use React Router lazy loading and an announced Suspense fallback. `RouteFeedback.test.tsx` covers focus and recovery controls. | Verified in frontend |
| Loading, empty, error, retry | Dashboard, search, portfolio/detail, watches/alerts, Office Actions, API/PDF, and route feedback expose explicit states. Screen integration tests cover those state branches; Office Action search no longer runs on each keystroke and has an explicit retry. | Verified in frontend |
| Denied | `RequireAuthentication`, `RequireRole`, and `RequireAdmin` render/navigate to the focused permission-denied state; `RouteGuards.test.tsx` covers role routing. Server authorization is still required. | Frontend verified; backend enforcement blocked |
| Offline and recovery | `NetworkStatusBanner.tsx` listens for browser offline/online events and announces both loss and restoration; `NetworkStatusBanner.test.tsx` proves the state transition. Normalized API network failures retain per-request retry controls. | Verified in frontend |
| Partial sources | Search source statuses announce incomplete/unavailable registries; dashboard partial aggregates and portfolio attachment failures preserve usable data with targeted retry. Search/dashboard/portfolio tests cover partial behavior. | Verified in frontend; live source semantics blocked |
| Keyboard journeys | Automated keyboard-only checks cover sign-in, authenticated shell/skip link, search/select/review, risk/matter/modal escape, portfolio filtering/detail, watch creation, Office Action search/link, Admin invitation/roles, invitation recovery, PDF export, and landing shield facets. | Automated frontend verification complete; manual AT/browser pass remains |
| Labels, landmarks, focus, announcements | Auth and application shells expose `main`, labelled navigation, header/footer, a skip link, focused errors, labelled form controls, scoped table headers, modal focus management, and status/alert live regions. Search avoids nested `main` landmarks. Axe coverage exists for search and risk flows. | Verified in code/tests |
| Contrast | Risk badge tokens were darkened for white text. `accessibilityTokens.test.ts` calculates WCAG contrast ratios for risk, secondary working-surface text, and dark-surface secondary text and enforces at least 4.5:1. | WCAG 2.1 AA token checks pass |
| Focus visibility and reduced motion | Global `:focus-visible`, component focus rings, a reduced-motion CSS override, capability selection, static landing experience, motion-reduced spinners, and keyboard-accessible SVG facets are present. | Verified in code/tests |
| Desktop and tablet | The application shell uses a tablet icon rail (`w-20`) and desktop sidebar (`xl:w-64`), responsive padding, wrapping metric grids, and explicit horizontal table affordances. `MainLayout.test.tsx` asserts the shell breakpoints and landmarks. | Structurally verified; physical-device matrix remains |
| Lazy loading and bundle | All feature routes are lazy route modules; landing full/lite/static tiers and the Three.js scene are separately lazy. Production output isolates the optional Three.js scene and keeps the critical app entry at about 356 kB minified. MSW is absent from production output. | Verified by production build |
| React stability | PDF object URLs use a stable ref with unmount cleanup; Office Action requests are submit-driven; shield completion effects use stable memoized progress and functional updates; Three callbacks use a handler ref. Lint hook rules pass. | Verified in code/lint |
| Risk evidence | Individual risk ratings in search results show similarity/class evidence; risk detail shows the full evidence panel and methodology; watch alerts show supporting evidence; dashboard alert ratings include the candidate evidence reference. Aggregate distribution text directs users to individual evidence. | Verified in frontend; scoring authority blocked |
| PDF client behavior | Typed report requests, authenticated blob handling, server `Content-Disposition` filenames, PDF media-type/non-empty validation, progress/failure/retry, and object URL cleanup are tested. | Frontend verified; generation/storage/auth/retention/audit blocked |
| Mock/live isolation | Config tests prove live is the default, mock is explicit development-only, and non-development mock mode is rejected. The production guard makes the MSW module tree-shake out of the build. | Verified in frontend |
| CI | `.github/workflows/frontend-quality.yml` uses locked pnpm dependencies and runs lint, tests, TypeScript/production build in order, with cancellation and a failure summary. | Configured; first GitHub-hosted run pending |

## Release commands

Run from `frontend/` unless noted:

```text
pnpm lint
pnpm test
pnpm build
git diff --check    # repository root
```

Record the exact command outcomes in the handoff. A local pass is not a staging integration result.

Latest local verification on 2026-08-05:

- `pnpm lint`: passed with no ESLint findings.
- `pnpm test`: 25 test files passed; 94 tests passed.
- `pnpm build`: TypeScript and Vite production build passed; critical entry 355.80 kB minified (113.14 kB gzip), optional lazy Three.js scene 555.31 kB (141.57 kB gzip), and no production MSW chunk or chunk-size warning.
- `git diff --check`: passed with no whitespace errors.

## Ticket audit

| Ticket | Previous status | Verified status | Evidence | Remaining blocker |
|---|---|---|---|---|
| FE-13 Office Action Research | Feature implemented against mock candidates | Frontend hardened | Submitted-only query, labelled filters, keyboard link controls, loading/empty/error/retry/link announcements, integration test | Backend search/link routes, licensed source, provenance, RBAC/audit contract |
| FE-17 PDF export | Frontend described as complete; mock-only candidate route | Frontend client complete; live export blocked | `PdfExport`, `reportsApi`, blob/error tests, API contract register | Backend generation, authoritative reconstruction, authorization, storage, retention, audit logging |
| FE-18 Accessibility | Prior commit marked accessibility pass | Automated/code audit verified with manual release check remaining | Keyboard journey tests, axe tests, contrast tests, landmarks/focus/live regions/reduced motion | Physical browser + screen-reader matrix |
| FE-19 Responsive | Prior commit marked responsive pass | Desktop/tablet structure verified with manual release check remaining | Responsive shell test, tablet rail, responsive grids/padding, horizontal legal-table affordances | Agreed real-tablet/browser visual session |
| FE-21 API integration | Live API readiness foundation | Blocked; zero verified live integrations | `backend/` contains only `package.json`; contract register labels every candidate mock-only | Backend app, OpenAPI, authorization tests, seeded staging, recorded integration run |
| Phase 3 Frontend exit gate | “Substantially complete” target in implementation plan | Blocked | Definition of done requires every screen wired to live endpoints | Same FE-21/backend and staging blockers; live PDF also absent |
