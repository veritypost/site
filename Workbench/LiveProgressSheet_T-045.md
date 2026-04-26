# LiveProgressSheet — T-045 — Classify hasPermission call sites with gateType
Started: 2026-04-26

## User Intent

Classify all 115 `hasPermission(` call sites across `web/src/app/`, `web/src/components/`, and `web/src/lib/` by gate type:
- **HARD**: user cannot access the feature at all (redirect, throw, or complete page gate)
- **SOFT**: feature visible but locked with an upgrade path (inline CTA or paywall modal)
- **INVISIBLE**: feature simply does not render (conditional rendering, no upgrade hint)

Output: `Ongoing Projects/Current/hasPermission-classification.md` — a table with file:line, permission key, gateType, current behavior, and desired post-T-044 behavior.

This is a reading and documentation task — no code changes.

## Live Code State

- `hasPermission()` is defined in `web/src/lib/permissions.js:174` — returns boolean, fail-closed on null cache.
- Grep confirms exactly **115 call sites** across the three target dirs (excludes comment lines, function definition, and doc comments).
- Actual executable call sites number approximately 96 (after excluding comment-only lines).
- Source of truth for what the permission key means: `web/src/lib/permissionKeys.js` and the DB `permissions` table.
- `LockModal.tsx` is the existing hard-gate component (not yet found as a dependency in any of the 115 sites — the modal is used independently).
- T-044 (`LockedFeatureCTA`) is the new inline soft-nudge component; this classification determines which sites get wired to it vs. kept as-is.

## Contradictions

None found during intake pass.

## Agent Votes

- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## Implementation Progress

Classification document written to: `Ongoing Projects/Current/hasPermission-classification.md`
Row count verified: 96 executable call sites classified (115 total grep hits, 19 are comment/doc lines excluded from classification table).

## Completed

SHIPPED 2026-04-26 — classification doc written, reviewed, committed.
