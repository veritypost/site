# Phase 8 — Independent Post-Ship Verification (2026-04-24)

Independent verification of every item in `MASTER_FIX_LIST_2026-04-24.md` against the actual current code state. Five fresh agents, no shared context with the implementer. Each agent read current code (not commits, not SHIPPED blocks, not summary docs) and reported PASS / FAIL / UNCLEAR per item with file:line evidence.

## Aggregate result

| Bucket | PASS | FAIL | UNCLEAR | Total |
|---|---|---|---|---|
| C1–C14 (Critical, first half) | 14 | 0 | 0 | 14 |
| C15–C28 (Critical, second half) | 13 | 1 | 0 | 14 |
| H1–H14 (High, first half) | 12 | 2 | 0 | 14 |
| H15–H27 (High, second half) | 12 | 1 | 0 | 13 |
| M1–M17 (Medium) | 14 | 1 | 1 | 16 |
| **Total** | **65** | **5** | **1** | **71** |

## Failures triaged

### Genuine regressions — fixed in commit `07c9d29` (Batch 26)

**H8** — Settings cache invalidation only on ProfileCard. Five other mutation paths (Alerts, Feed, Accessibility, ExpertProfile, ExpertVacation, ExpertWatchlist) saved metadata that can flip permission gates without refreshing. Added `refreshAllPermissions()` after each `await onSaved()` across all 6 paths.

**H11** — `/api/kids/pair` only rate-limited per IP. An attacker rotating IPs but reusing a device fingerprint (or vice versa) bypassed the cap. Added a second rate-limit pass keyed on `device` field after body parse. The sibling `generate-pair-code` route was already correctly per-actor.

**H24** — `admin/permissions/page.tsx` had three client-side `record_admin_action` RPC calls (`removePermFromSet`, `toggleRoleSet`, `togglePlanSet`) firing alongside server-side `recordAdminAction` in the corresponding `/api/admin/permission-sets/*` endpoints. Every toggle wrote two audit rows. Removed all three client-side calls.

### Deferred / accepted state — no action

**C26** — 14 RLS-enabled tables still have zero policies. By-design-deferred per `Current Projects/Audit_2026-04-24/OWNER_TODO_2026-04-24.md:121` (owner-pending decision on per-table classification). Not a regression.

**M13** — `check-user-achievements` cron uses non-atomic in-process cursor. Master list itself flagged this as "low-probability race; worth fixing or documenting as intentional." Code matches the deferred note; not a regression.

**M16** — Verifier reported FAIL because the literal master-list cite (`StoreManager.swift` + `AuthViewModel.swift`) had no anti-replay docs. The actual server-side anti-replay coverage exists at `web/src/app/api/ios/appstore/notifications/route.js:91-101` (5min reclaim window) and `subscriptions/sync/route.js:128-135` (processed-replay short-circuit). Cite mismatch, not a regression — the protection is in place, just on the receiving end.

## Notable observations

- **Audit-ID provenance markers in code are exemplary.** Almost every fix carries an explicit `// C2`, `// H8`, `// M14` comment marker that made verification straightforward. Future audits should keep this discipline.
- **C5/C6/C8 share one root-cause fix** — `useMemo([])` to stabilize the supabase client across renders. One pattern, three closed items.
- **Lint state**: 158 → 0 warnings across the cleanup arc (Batches 17–25). Strict mode enabled (M1).
- **`as any` count**: 94 → ~10 (M2 dramatically over-delivered).

## Closing the audit

With Batch 26 shipped, every actionable item from the master fix list is closed except:
- C26 (RLS classification, owner decision pending)
- M13 (intentional / accepted)

Audit window: anchor SHA `ed4944e` → current `07c9d29`. 26 ship batches, 71 items audited, 68 closed, 3 deferred (2 acceptable, 1 owner-blocked).

Phase 8 verification: complete.
