# Plan Compliance Fix List

## Scope
This checklist tracks required alignment against `feeder-verification-copilot-prompt.md` and the current implementation status.

## Priority 1 - Routing and Guard
- [x] Add dedicated `/verification` route.
- [x] Add dedicated `/splicing` route.
- [x] Add splicing guard redirect to `/verification` when verification not complete.
- [x] Replace session-centric entry points with full verification/splicing route-first workflow in nav.

## Priority 2 - Flow Wiring
- [x] Wire scanner hook to active scan input path.
- [x] Ensure mismatch notifications show at exact feeder/MPN decision points.
- [x] Ensure duplicate feeder emits buzzer/error notification at decision point.
- [x] Ensure MPN match emits success notification at decision point.
- [ ] Fully wire runtime flow to `useVerificationStore` and `useSplicingStore` in production session page.

## Priority 3 - Completion Overlay and Reset
- [x] Add all-verified transition in dedicated verification page (auto-route to splicing).
- [x] Add session-level full-screen completion overlay in active production session flow.
- [x] Add global `Reset Session` modal that clears verification/splicing/log stores and writes reset log.

## Priority 4 - UI/UX Plan Details
- [x] Notification stack custom UI integrated.
- [x] Log panel integrated.
- [x] Add expandable details in notification card.
- [ ] Add required micro-polish animations from phase 11.

## Priority 5 - Baseline Build Health
- [x] Resolve TS6305 by ensuring `@workspace/api-client-react` type outputs are built/consumed correctly before feeder-scanner typecheck.
