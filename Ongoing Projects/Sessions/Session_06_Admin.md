# Session 6 — Admin + Pipeline + Newsroom + Operator Tools

**Created:** 2026-04-27. Self-contained. Source docs (`*_READ_ONLY_HISTORICAL.md` in `Ongoing Projects/`) are frozen historical reference. This session file is canonical — every fact you need is in this file.

S6 is the largest session by item count. It owns the admin shell, the entire admin API surface, the AI pipeline lib, the newsroom orchestrator, the support/settings/health/error/csp routes, and the operator-trust surface. Many admin pages have known fake-state, missing validation, or destructive-action ordering bugs. Cluster the fixes; ship destructive-confirm pattern + slug-validation + persist-or-delete decisions in batches.

---

## Owned paths (strict)

- `web/src/app/admin/**`
- `web/src/app/api/admin/**`
- `web/src/app/api/expert/**`
- `web/src/app/api/ai/**`
- `web/src/app/api/newsroom/**`
- `web/src/app/api/ads/**`
- `web/src/app/api/events/**`
- `web/src/app/api/support/**`
- `web/src/app/api/settings/**`
- `web/src/app/api/health/**`
- `web/src/app/api/csp-report/**`
- `web/src/app/api/errors/**`
- `web/src/lib/adminMutation.ts`
- `web/src/lib/adminPalette.js`
- `web/src/lib/pipeline/**`
- `web/src/types/database.ts` (regenerate post-S1; never hand-edit)

**Out of scope (do not edit):** public web pages (S7), profile/redesign (S8), iOS apps (S9, S10), social-surface API routes (S5), auth/account/login pages (S3), billing routes (S4), DB migrations (S1), cron handlers (S2). When a fix needs an off-domain edit, defer the slice and flag it for the owning session.

---

## Hermetic guarantee

S6 never edits files outside the owned-paths list. The most common temptations and the right move:

- Public story page provenance pill → S7 owns. Flag it.
- Profile redesign components → S8 owns. Flag it.
- Comment/Notification components → S5 owns the components dir. Flag it.
- Migrations or RPC bodies → S1 owns SQL. S6 regenerates `database.ts` AFTER S1 ships. No exceptions.
- Cron schedules in `vercel.json` → S2 owns. S6 may identify drift but does not edit.
- Permissions seed (DB rows) → S1 owns SQL. S6 owns the admin UI surface that displays/edits perms.

Run `grep -rn "<keyword>" /Users/veritypost/Desktop/verity-post/web/src/app/profile /Users/veritypost/Desktop/verity-post/web/src/app/api/auth /Users/veritypost/Desktop/verity-post/web/src/app/api/comments /Users/veritypost/Desktop/verity-post/VerityPost /Users/veritypost/Desktop/verity-post/VerityPostKids` before final commit to verify no out-of-domain edits.

---

## Multi-agent shipping process (4 pre-impl + 2 post-impl per item)

**Memory rules in force:** `feedback_4pre_2post_ship_pattern`, `feedback_genuine_fixes_not_patches`, `feedback_divergence_resolution_4_independent_agents`, `feedback_batch_mode_4_parallel_implementers`, `feedback_verify_audit_findings_before_acting`, `feedback_mcp_verify_actual_schema_not_migration_log`, `feedback_no_keyboard_shortcuts`, `feedback_understand_before_acting`.

**Per item:**

1. **4 pre-impl agents (in parallel):**
   - **Investigator** — read the file:line cited; quote current code; confirm the bug exists today (not stale).
   - **Planner** — design the change; list exact edits; identify cross-file ripple.
   - **Big-picture reviewer** — cross-file impact; does this break callers? RLS? types? import contracts?
   - **Independent adversary** — look for ways the plan is wrong, scope-reduces a real bug, or regresses a sibling surface.
2. **N implementers (in parallel)** with isolated file ownership per `feedback_batch_mode_4_parallel_implementers`. For batch-mode runs (multiple items in flight), 1 planner + 4 implementers + reviewer.
3. **2 post-impl reviewers:**
   - **Independent code reviewer** — diff vs plan; types still coherent; no parallel paths created.
   - **Security/correctness reviewer** — required for elevated-care items (RBAC, audit-log, broadcasts, consent, kid-pipeline, billing-adjacent). For low-risk admin polish (toast, palette swap, slug-validation), a single reviewer pass is sufficient.
4. **Divergence resolution:** when the 4-agent flow doesn't reach 4/4 unanimous, dispatch 4 brand-new agents on the disputed point with no shared context per `feedback_divergence_resolution_4_independent_agents`. Their verdict decides. Second round diagnoses why originals diverged. Don't escalate technical disputes to owner.
5. **Verification authority** per `feedback_verify_audit_findings_before_acting`: every claim in this file was verified against current code on 2026-04-27, but verify again before acting — Wave 19/20/21 may have moved code. Quote current file:line in the investigator pass before editing. Use Supabase MCP for any schema/RPC claim — never trust the migration log per `feedback_mcp_verify_actual_schema_not_migration_log`.

---

## GENUINE FIXES, not patches

Per memory `feedback_genuine_fixes_not_patches`, every S6 ship satisfies:

- **Kill the thing being replaced.** No parallel paths. When `/api/ai/generate` is retired, the route file gets deleted AND callers migrate AND the import disappears AND the OpenAI direct path goes with it. Same commit.
- **No `// TODO: revisit` / `// HACK` / force-unwrap as crutch.** If the right answer requires migration, the migration is in S1's queue and this session waits.
- **Types, callers, and data flow stay coherent.** When a column is dropped, the type regen lands in the same PR set; when an RPC shape changes, callers and types update together.
- **Surface tradeoffs when a patch is the only option.** Inline a `**Tradeoff:**` block explaining what's deferred and why. The owner shouldn't have to ask.

Default for ambiguous "fix or remove" calls: **remove**. UI that lies to the operator (fake state, decorative toggles, disabled-block behind `if(false)`) gets deleted. Operator-trust collapse is the worst-case S6 failure mode; deletion is reversible by re-implementing properly later.

---

## Verification authority

Every claim verified on 2026-04-27 against current `web/src` and live Supabase MCP. Re-verify before acting:

- File:line claims → re-grep with `grep -n` on current branch.
- RPC existence → `SELECT proname FROM pg_proc WHERE proname = '<name>';` via MCP. Never trust `supabase_migrations` log per `feedback_mcp_verify_actual_schema_not_migration_log`.
- Schema column claims → `information_schema.columns` query via MCP, not the schema dump.
- Constraints → `pg_constraint` via MCP.
- Permissions/RLS → `pg_policies` via MCP.
- "Already shipped" claims (status flags) → check git log for matching commits.

If a finding is stale (already fixed), mark the item RESOLVED with the discovery agent's name + commit SHA inline; do not silently skip.

---

## No keyboard shortcuts in admin UI

Per memory `feedback_no_keyboard_shortcuts`. Never propose, build, or accept a hotkey / chord / command palette in any admin surface. Click-driven only. Reject any reviewer suggestion that introduces one.

---

## Best-practice locks summary (owner pre-authorized 2026-04-27)

Every owner-pending decision in S6 scope is locked below with the senior-dev / UI-UX-mastermind default. Apply directly. Do not mark items "owner-pending."

| ID | Decision | Locked default |
|---|---|---|
| Q4.1 | T347 user-state enum | Apply: single `user_state` enum replacing 8 booleans |
| Q4.7 | T308 admin downgrade `frozen_at` | Clear `frozen_at` on admin-driven downgrade |
| Q4.17 | Bible drift refresh | Doc-only refresh as S6 final-pass deliverable |
| Q1b | `requires_verified` perms gate | Drop the column; banner-only unverified |
| A30 | /admin/breaking Alert limits | Wire through `/api/admin/settings/upsert` |
| A31 | /admin/cohorts Custom builder | Remove the entire Custom builder tab |
| A32 | /admin/support live-chat | Delete the component entirely |
| A33 | /admin/analytics Resources tab | Drop the tab + drop period selector until wired |
| A60 | /admin/streaks prefixed keys | Write bare keys; audit each toggle for a runtime read |
| A61 | /admin/reader onboarding copy | Persist edits to `settings.onboarding_steps` JSON |
| A62 | /admin/users Linked-devices | Delete the entire `if(false &&)` block + props + endpoint refs |
| A63 | /admin/users mark-* forms | Replace TextInput with searchable Select-from-DB |
| A64 | /admin/permissions slug | Apply `KEY_SLUG_RE` validation pre-submit |
| A65 | /admin/promo discount value | NumberInput with min/max + on-blur validation |
| A66 | /admin/notifications log User | Render `@username` or `(deleted)`, never raw uuid |
| A113 | /admin/access TYPE_OPTIONS | Remove the type field; default `'referral'` server-side |
| A29 | /admin/tweens-story-manager links | Repoint to `kids-story-manager?article=...` |
| §A1 | `/api/expert/vacation` route | BUILD the route handler |
| §D1 | `/api/ai/generate` legacy | DELETE + migrate callers into F7 pipeline orchestrator |
| §D2 | Legacy section-cache perms | RETIRE; switch PermissionsProvider to new path |
| §D3 | Tweens story-manager UI stub | DELETE the stub directory + stop pipeline tween generation |
| §H3 | Search free-tier paid filters | Return 403 with reason on paid-only filter use |
| AR1 | Pipeline AI-as-author rewrite | Inline the 11-task plan; treat as project, not session items |

---

## Items

### S6-A5 — `recordAdminAction` swallows audit failures silently

- **ID:** S6-A5
- **Title:** Make admin audit-write failures observable + persisted
- **Source:** TODO_READ_ONLY_HISTORICAL.md A5 (CRITICAL — security hole). Cleanup §B5.
- **Severity:** P0
- **Status:** 🟦 open
- **File:line current state:** `web/src/lib/adminMutation.ts:138-155` — wraps `record_admin_action` RPC in try/catch with `console.error` only. No Sentry, no fallback insert, no throw. Mutation has already landed when the audit row write fails.
- **Why it matters:** `audit_log` is the load-bearing accountability surface for every admin write. An unknown population of admin actions may be unaudited. At investigation time the table is empty — not because the action didn't happen, but because the audit write failed silently. Compounds with A57 (audit-before-mutation) to make `audit_log` a weakly-trusted table.
- **The fix:**
  1. On RPC error, route through a structured log line tagged `[AUDIT-FAILURE]` with `actorId`, `targetUserId`, `action`, `metadata`, `error.message`, `error.code`. Sentry capture is gated on a flag (`process.env.SENTRY_DSN`) — when off, the structured log is the surface.
  2. Service-role direct INSERT into `admin_audit_log` as a fallback so the row lands even if the RPC path is broken. Best-effort; if even the direct insert fails, surface a 500 with body `{ error: 'audit_failed' }` and DO NOT roll back the mutation (the mutation is the user-facing fact; rolling it back over an audit failure makes the system more brittle).
  3. Stop swallowing. Throw on terminal failure — caller decides whether to propagate or not. Default: propagate to caller.
- **Dependencies:** None — pure lib change.
- **Verification:**
  - Smoke: temporarily revoke RPC permission to `record_admin_action`; trigger any admin mutation; confirm `[AUDIT-FAILURE]` log line + a row in `admin_audit_log` via the fallback.
  - `grep -rn "recordAdminAction\|record_admin_action" web/src/` to confirm no caller silently swallows the new throw.
- **Multi-agent process:** 4 pre-impl + **2 post-impl required** (security/correctness reviewer mandatory — this is the audit surface).

---

### S6-A57 — Audit row written BEFORE the destructive mutation

- **ID:** S6-A57
- **Title:** Invert order: mutate first, audit on success; helper enforces it
- **Source:** TODO_READ_ONLY_HISTORICAL.md A57.
- **Severity:** P0
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/access/page.tsx:153-164` — calls `record_admin_action` RPC at lines 155-161 BEFORE the optimistic UI flip (line 168) and the DB update (lines 169-170). Phantom audit entries point at changes that never happened.
- **Why it matters:** Phantom audit rows make investigation worse — they look like real actions and have to be cross-checked against state to know if they landed. Same anti-pattern class as A5.
- **The fix:**
  1. Invert order in `web/src/app/admin/access/page.tsx`: mutate first, audit on success.
  2. Build `withDestructiveAction(actionFn, auditFn)` helper in `web/src/lib/adminMutation.ts`:
     ```ts
     export async function withDestructiveAction<T>(
       actionFn: () => Promise<T>,
       auditFn: (result: T) => Promise<void>,
     ): Promise<T> {
       const result = await actionFn();
       try {
         await auditFn(result);
       } catch (auditErr) {
         logAuditFailure(auditErr); // S6-A5 path
         await fallbackInsertAuditLog(...); // S6-A5 path
       }
       return result;
     }
     ```
  3. Refactor every destructive admin call site to use the helper. Find them via `grep -rn "record_admin_action\|recordAdminAction" web/src/app/admin/` — expect ~20-30 sites.
- **Dependencies:** Co-ships with S6-A5 (uses the same fallback path).
- **Verification:**
  - Smoke: trigger an admin mutation that fails (e.g., manually break the RPC by passing bad params); confirm no `audit_log` row was written for the failed mutation.
  - Negative test: succeed the mutation, fail the audit; confirm mutation persists, fallback insert lands.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required.

---

### S6-A26 — `requireAdminOutranks` short-circuits on self-edit

- **ID:** S6-A26
- **Title:** Remove self-edit early-return; trust `caller_can_assign_role`
- **Source:** TODO_READ_ONLY_HISTORICAL.md A26.
- **Severity:** P0
- **Status:** 🟨 deps on S1 (verify RPC body)
- **File:line current state:** `web/src/lib/adminMutation.ts:108-110` — returns null (no-op) when `targetUserId === actorId`. Self-edits skip the rank-guard RPC entirely.
- **Why it matters:** Subtle privilege-escalation primitive. Even if `caller_can_assign_role` is currently strict, the bypass shape is wrong — self-edits must pass the same hierarchy enforcement.
- **The fix:**
  1. **S1 verifies** `caller_can_assign_role` RPC enforces strict-greater hierarchy on the caller's role even when target=self. Quote the RPC body in the verification report. If the body doesn't enforce, S1 ships the migration to harden it.
  2. **S6 removes lines 108-110.** Self-edits flow through the same `caller_can_assign_role` guard.
- **Dependencies:** S1 ships RPC verification (and migration if needed) first. Block this S6 ship until S1 confirms.
- **Verification:**
  - As an admin (role X), attempt to set yourself to role X+1; confirm the RPC denies it.
  - As an admin, attempt to set yourself to role X-1; confirm allowed (or denied per locked policy — verify with RPC body).
  - Confirm no infinite loop or N+1 if RPC fires on self-edit.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required.

---

### S6-A23 — Admin notifications broadcast loads ALL user IDs in memory

- **ID:** S6-A23
- **Title:** Server-side fan-out via SECURITY DEFINER RPC + confirm-by-typing-count modal + audit-before-fire
- **Source:** TODO_READ_ONLY_HISTORICAL.md A23 (CRITICAL admin safety). Cleanup §B10.
- **Severity:** P0
- **Status:** 🟨 deps on S1 (RPC) + bundles with S6-A56
- **File:line current state:**
  - `web/src/app/api/admin/notifications/broadcast/route.ts:73-100` — `service.from('users').select('id')` with no LIMIT, builds full array in memory, single bulk PostgREST insert.
  - `web/src/app/admin/notifications/` page — confirmation is a basic dialog without count-typeback.
- **Why it matters:** At launch scale: memory spike, possible PostgREST payload-size overflow, single misclick fans out platform-wide with no recovery. No `audit_log` row before the write fires.
- **The fix:**
  1. **S1 ships SECURITY DEFINER RPC** `broadcast_notification(p_payload jsonb, p_audience text)` — runs `INSERT INTO notifications SELECT id, ... FROM users WHERE deleted_at IS NULL [+ audience filter]` server-side, capped at `LIMIT 100000`. Larger broadcasts route through cron-driven worker.
  2. **S6 route handler** at `/api/admin/notifications/broadcast/route.ts` — call the RPC, no in-memory user-id collection.
  3. **S6 confirmation modal** at `web/src/app/admin/notifications/page.tsx` — admin types the recipient count back (preview shows "12,438 users will receive this"; admin types "12438"). Submit disabled until typed string equals previewed count exactly.
  4. **Audit row before fan-out fires.** Use `withDestructiveAction` from S6-A57 — but here the audit is BEFORE because the fan-out itself is the audit-worthy event; the write is "broadcast initiated by admin X to N recipients." Mutation is the side-effect after the audit lands.
- **Dependencies:** S1 ships RPC. S6-A57 helper available.
- **Verification:**
  - Type-back modal: enter wrong count → submit disabled. Enter correct count → submit enabled.
  - Smoke a broadcast to a tiny audience (single test user); confirm RPC fires + audit row lands first + notification arrives.
  - Load test (10k+ users): confirm no memory spike on the route handler; RPC handles the volume.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required (admin blast-radius).

---

### S6-A55 — `/admin/access-requests` Approve bypasses DestructiveActionConfirm

- **ID:** S6-A55
- **Title:** Wrap approve in DestructiveActionConfirm with reason capture
- **Source:** TODO_READ_ONLY_HISTORICAL.md A55.
- **Severity:** P1
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/access-requests/page.tsx:88-108` — mints a 7-day signup link via `/api/admin/access-requests/${r.id}/approve` with no DestructiveActionConfirm wrapper, no reason capture.
- **Why it matters:** Approval mints credentials. The destructive-action-confirm pattern exists for exactly this; bypassing it leaves no operator-attested reason on the record.
- **The fix:**
  1. Wrap the approve action in `DestructiveActionConfirm` with `requireReason=true`.
  2. Thread the reason into `record_admin_action` via the `withDestructiveAction` helper from S6-A57.
- **Dependencies:** S6-A57 helper.
- **Verification:** Approve attempt without reason → blocked. Approve with reason → audit row contains the reason in `metadata`.
- **Multi-agent process:** 4 pre-impl + 2 post-impl.

---

### S6-A56 — `/admin/breaking` Send-alert uses lightweight ConfirmDialog

- **ID:** S6-A56
- **Title:** Swap to DestructiveActionConfirm with reason; bundle with A23
- **Source:** TODO_READ_ONLY_HISTORICAL.md A56.
- **Severity:** P1
- **Status:** 🟦 open (bundle with S6-A23)
- **File:line current state:** `web/src/app/admin/breaking/page.tsx` — uses lightweight `ConfirmDialog` for the platform-wide push fan-out. No reason field.
- **Why it matters:** Highest-blast-radius admin action in the product. Bad alert ships to thousands of devices with no operator-attested justification.
- **The fix:** Swap `ConfirmDialog` → `DestructiveActionConfirm` with `requireReason=true`. Thread reason through `withDestructiveAction`. Bundle in the same PR as S6-A23 (both touch `/admin/breaking` + broadcast surface).
- **Dependencies:** S6-A57 helper.
- **Verification:** Smoke send-alert without reason → blocked. With reason → audit row + recipient-count typeback (per A23).
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required.

---

### S6-A29 — `/admin/tweens-story-manager` rows 404 on click

- **ID:** S6-A29
- **Title:** Repoint links + drop inline palette + add EDITOR_ROLES gate
- **Source:** TODO_READ_ONLY_HISTORICAL.md A29.
- **Severity:** P1
- **Status:** 🟦 open. **Locked decision:** repoint to `kids-story-manager?article=...` (cheaper than building `/admin/articles/[id]`).
- **File:line current state:** `web/src/app/admin/tweens-story-manager/page.tsx:160` — renders rows with `href={\`/admin/articles/${a.id}\`}`. No `/admin/articles/` directory exists. Inline `ADMIN_C` light palette declared at lines 30-39; missing `EDITOR_ROLES` gate.
- **Why it matters:** Page in production whose rows all 404 is broken-as-shipped. Inline palette violates admin design system; missing role gate may let non-editors view.
- **The fix:**
  1. **Repoint links:** `href={\`/admin/kids-story-manager?article=${a.id}&band=tweens\`}`. Confirm `kids-story-manager` accepts the `article` + `band` query params; if not, S6 owns the small param-handler addition there.
  2. **Drop inline palette.** Replace with `import { ADMIN_C } from '@/lib/adminPalette'`. Remove the local `const ADMIN_C = { ... }` block at :30-39.
  3. **Add EDITOR_ROLES gate** mirroring `kids-story-manager`'s top-of-file pattern. Non-editors get redirected.
- **Tradeoff inline:** This is the cheaper fix. Long-term, `/admin/articles/[id]` is the right architecture — a single article-detail page that serves all bands. AR1 plan includes a writer-facing UI route that supersedes this; do not build a parallel `/admin/articles/[id]` ahead of AR1. **Coordinated with §D3 below** — the tweens UI stub gets DELETED entirely and the pipeline stops generating tween articles. So this fix is the interim cleanup until §D3 lands; once §D3 lands, the directory disappears.
- **Dependencies:** None.
- **Verification:** Click a row → navigates to `kids-story-manager` with the article loaded. Non-editor user → blocked at the gate. Palette swatch matches admin shell (dark).
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer (low-risk).

---

### S6-A30 — `/admin/breaking` Alert limits inputs never persist

- **ID:** S6-A30
- **Title:** Wire through `/api/admin/settings/upsert`; server-side enforcement reads from settings
- **Source:** TODO_READ_ONLY_HISTORICAL.md A30. **Locked (best-practice):** Option A — wire (operator-trust over deletion).
- **Severity:** P1
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/breaking/page.tsx:36-39` — `charLimit` (280), `throttleMin` (30), `maxDaily` (10) are `useState` only. UI presents as platform-wide settings; values reset on refresh; server-side broadcast route doesn't read them.
- **Why it matters:** Operator-trust gap. If the surface lies about persistence, the operator can't trust any other admin surface.
- **The fix:**
  1. Add settings keys: `breaking_alert_char_limit`, `breaking_alert_throttle_min`, `breaking_alert_max_daily` in `settings` table (S1 if a migration is needed; otherwise S6 inserts via `/api/admin/settings/upsert` on first save).
  2. Page hydrates from `settings` on mount; saves through `/api/admin/settings/upsert` on edit.
  3. **Server-side enforcement** in `/api/admin/broadcasts/alert` reads from `settings`; rejects requests exceeding limits with structured 4xx body.
- **Dependencies:** None (uses existing `/api/admin/settings/upsert`). Bundles with S6-A56.
- **Verification:** Edit `charLimit` to 500; refresh; value persists. Submit alert with 501 chars; server returns 400 with `{ error: 'char_limit_exceeded', limit: 500 }`.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A31 — `/admin/cohorts` Custom builder dead

- **ID:** S6-A31
- **Title:** REMOVE the entire Custom builder tab
- **Source:** TODO_READ_ONLY_HISTORICAL.md A31. **Locked (best-practice):** Remove. The `POST /api/admin/cohorts/preview` endpoint doesn't exist; building it is a mini-project. Removing the tab is one PR.
- **Severity:** P2
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/cohorts/page.tsx:344-403` — 6 collapsible filter categories with 30+ filters and no Run/Preview/Save button. Footer text claims "Build filters above, then run the query." No such control. (Q1 cleaned the dead-enum dropdowns in Wave 21; the Custom-builder tab itself is the remaining work.)
- **Why it matters:** Tab is unusable. Operators wasting time inside it.
- **The fix:**
  1. Delete the entire Custom-builder tab JSX block + its supporting state (`customFilters`, `selectedCategories`, etc.).
  2. Remove the tab from the tab-strip (the tab-strip render conditional drops the entry).
  3. Drop any imports made dead by the removal.
  4. If owner later wants segmentation, ship the proper endpoint + UI then. Inline this rationale as a code comment at the deletion site for future agents.
- **Tradeoff inline:** Owner segmentation work is a real future need but not launch-blocking. Removing the broken tab today is the cleaner path.
- **Dependencies:** None.
- **Verification:** Tab gone. No console errors. Other tabs still work. `grep -rn "customFilters\|cohorts/preview" web/src/` returns zero hits.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A32 — `/admin/support` live-chat-widget config is fake state

- **ID:** S6-A32
- **Title:** DELETE the chat-widget component + invented user-count widget
- **Source:** TODO_READ_ONLY_HISTORICAL.md A32. **Locked (best-practice):** Delete (no chat widget shipped to wire to).
- **Severity:** P1
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/support/page.tsx:64-181` — `ChatWidgetConfig` lives entirely in `useState`. Toggle fires "Chat widget enabled" toast; nothing persists. Estimated-user-count widget at `:120-130` shows invented numbers (`gracePeriod ? 120 : 0`, `paidPlans ? 3400 : 0`).
- **Why it matters:** Operator-trust collapse. If this surface lies, every other admin surface is suspect. Invented user counts are believable at a glance — worst kind of fake state.
- **The fix:**
  1. Delete the entire `ChatWidgetConfig` component (lines 64-181 region).
  2. Strip the invented user-count widget at `:120-130`.
  3. Replace with a single static panel: "Live chat is not enabled. To enable, ship a chat-widget integration first."
  4. Drop the toggle handlers + state hooks made dead by the removal.
- **Dependencies:** None.
- **Verification:** Page renders without the fake widgets. No console errors. `grep -rn "ChatWidgetConfig\|gracePeriod ? 120" web/src/` returns zero hits.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A33 — `/admin/analytics` Resources tab serves invented data

- **ID:** S6-A33
- **Title:** DROP the Resources tab + drop period selector
- **Source:** TODO_READ_ONLY_HISTORICAL.md A33. **Locked (best-practice):** Drop until live wiring exists.
- **Severity:** P1
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/analytics/page.tsx:30-37` — `RESOURCE_USAGE` hardcoded fake list of Supabase/Vercel limits. Period selector at `:188-191` renders only `7d` with TODO for 30d/90d.
- **Why it matters:** Same operator-trust class as A32. Capacity decisions made on bars that look credible at a glance but are imagined.
- **The fix:**
  1. Delete the Resources tab entirely from the tab-strip + content render.
  2. Drop the `RESOURCE_USAGE` constant and the `[Demo data]` banner.
  3. Drop the period selector (only `7d` is wired). Replace with a fixed `7d` label.
  4. Inline rationale comment: "Resources tab + period selector dropped pending Supabase/Vercel API integration. Reintroduce when live data is wired; do not ship demo bars."
- **Dependencies:** None.
- **Verification:** Tab gone. Period selector gone. Other tabs unchanged. No console errors.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A58 — ToastProvider double-mount on 26 admin pages

- **ID:** S6-A58
- **Title:** Delete inner ToastProvider on every admin page; layout's single provider is enough
- **Source:** TODO_READ_ONLY_HISTORICAL.md A58.
- **Severity:** P3
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/layout.tsx:38` mounts ToastProvider. Each individual admin page wraps content in another ToastProvider (e.g., `web/src/app/admin/notifications/page.tsx:431-435`). Works only because `useToast()` resolves the nearest provider — drift risk if a deep call resolves up the wrong tree.
- **Why it matters:** Maintenance footgun. Future toast-system change has to account for two providers; bug surfaces look like "toast didn't fire" when it fired on the wrong provider.
- **The fix:** Bulk grep + edit. `grep -rn "ToastProvider" web/src/app/admin/` to enumerate the ~26 sites. Remove the inner `<ToastProvider>...</ToastProvider>` wrappers. Keep `useToast()` calls as-is (they resolve to the layout-level provider).
- **Dependencies:** None.
- **Verification:** `grep -rn "ToastProvider" web/src/app/admin/` returns only `layout.tsx`. Toasts still fire on every admin page.
- **Multi-agent process:** 1 planner + N implementers (batch-mode for 26 files) + 1 reviewer.

---

### S6-A59 — `/admin/system` feed-health duplicates `/admin/feeds`

- **ID:** S6-A59
- **Title:** `/admin/system` is canonical; `/admin/feeds` reads from + writes to same settings keys
- **Source:** TODO_READ_ONLY_HISTORICAL.md A59.
- **Severity:** P1
- **Status:** 🟦 open
- **File:line current state:**
  - `web/src/app/admin/system/page.tsx:543-585` — saves `stale_feed_hours` and `broken_feed_failures` to `settings`.
  - `web/src/app/admin/feeds/page.tsx:59-61, 359-373` — keeps separate `staleHours` and `brokenFailCount` local state with no settings round-trip.
- **Why it matters:** Operator can edit one and have the other silently ignored. Runtime read picks whichever path has data — undefined which.
- **The fix:**
  1. `/admin/feeds` reads `stale_feed_hours` + `broken_feed_failures` from `settings` on mount (mirror what `/admin/system` reads).
  2. `/admin/feeds` writes through the same settings keys when changed.
  3. Drop the local-state-only path in `/admin/feeds`. Single source of truth: `settings.stale_feed_hours` + `settings.broken_feed_failures`.
- **Dependencies:** None.
- **Verification:** Edit `stale_feed_hours` on `/admin/system`, refresh `/admin/feeds`, value matches. Edit on `/admin/feeds`, refresh `/admin/system`, value matches.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A60 — `/admin/streaks` writes prefixed keys nothing reads

- **ID:** S6-A60
- **Title:** Write bare keys (drop prefix) so runtime reads them; audit each toggle for actual runtime read; remove orphans
- **Source:** TODO_READ_ONLY_HISTORICAL.md A60. **Locked (best-practice):** Write bare keys; audit each toggle.
- **Severity:** P1
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/streaks/page.tsx:96-107` — fetches and writes `streak_config_*` / `streak_num_*` prefix keys. Runtime gameplay reads bare keys (`wrapped_enabled`, `referral_max`, etc.).
- **Why it matters:** Operator-trust collapse — toggling does nothing. Settings table accumulates ghost rows.
- **The fix:**
  1. Drop the prefix. Settings keys become bare names matching what runtime reads.
  2. **Audit each toggle in the page for an actual runtime caller.** Grep `grep -rn "settings\.<bare_key>\|settings_get('<bare_key>')" web/src/` for each. Toggles whose key has zero runtime readers get DELETED from the UI (they're dead toggles).
  3. Migration support: if a settings row exists under the prefixed name, S1 ships a one-time migration to copy values into bare-name rows (or S6 does it as part of the page's data-load fallback). Coordinate with S1.
- **Dependencies:** S1 may ship a one-time data migration if prefixed rows exist in production.
- **Verification:** For each surviving toggle: edit on admin → confirm runtime reflects the change. For dead toggles: gone from UI.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A61 — `/admin/reader` onboarding-step copy edits don't persist

- **ID:** S6-A61
- **Title:** Persist edits to `settings.onboarding_steps` JSON
- **Source:** TODO_READ_ONLY_HISTORICAL.md A61. **Locked (best-practice):** Option A — persist (operator-trust over deletion). The edits are useful product knobs.
- **Severity:** P1
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/reader/page.tsx:65-73, 180-186` — `saveStepCopy` updates local React state and toasts "Step updated"; no API call, no DB mutation. Reload returns defaults.
- **Why it matters:** UI lies to operator. Same class as A32 (live-chat fake state).
- **The fix:**
  1. Settings key: `onboarding_steps` (jsonb). Schema: `{ steps: [{ id, title, body, cta, audience }, ...] }`.
  2. Page hydrates from `settings.onboarding_steps` on mount.
  3. `saveStepCopy` writes through `/api/admin/settings/upsert` with key `onboarding_steps`.
  4. **Welcome carousel reads from `settings.onboarding_steps`** to render the actual flow. Coordinate with S7 (welcome page is in S7's domain) — S6 ships the persistence; S7 wires the read in `/welcome`. Flag for S7.
- **Dependencies:** S7 wires the read on `/welcome` in a follow-up.
- **Verification:** Edit a step's body; refresh; persists. /welcome renders the edited copy.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A62 — `/admin/users` Linked-devices section behind `if(false &&)`

- **ID:** S6-A62
- **Title:** DELETE the entire block + props + endpoint reference + array
- **Source:** TODO_READ_ONLY_HISTORICAL.md A62. **Locked (best-practice):** Delete. Dead code.
- **Severity:** P3
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/users/page.tsx:775-812` — wraps Linked-devices section + prop wiring + endpoint reference + `devices` array in `{false && ( ... )}`.
- **Why it matters:** Worst kind of dead code: compiles, runs nowhere, looks live. Future agent assumes intentional and routes around it.
- **The fix:**
  1. Delete the JSX block (lines 775-812).
  2. Remove the `devices` array state hook + its loader.
  3. Remove the endpoint-reference prop (the `/api/admin/users/${u.id}/devices` URL constant or fetch).
  4. Remove any imports made dead by the removal.
- **Dependencies:** None.
- **Verification:** `grep -n "devices" web/src/app/admin/users/page.tsx` returns no hits in the deleted region. Page renders without the section. No console errors.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A63 — `/admin/users` mark-quiz/mark-article/award-achievement no validation

- **ID:** S6-A63
- **Title:** Replace TextInput with searchable Select-from-DB
- **Source:** TODO_READ_ONLY_HISTORICAL.md A63. **Locked (best-practice):** Searchable Select.
- **Severity:** P2
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/users/page.tsx:816-862` — three inline forms with TextInput for slug. Operator typo passes 200 OK on the upstream (which allows unknown slugs in some paths); toast claims success against a phantom row.
- **Why it matters:** Operator-trust gap. "Awarded achievement to user" toast is a lie if the slug doesn't match a real achievement.
- **The fix:**
  1. **Mark-quiz form:** Replace TextInput with `<Combobox>` (or equivalent searchable Select) sourced from `quizzes` table where `is_active=true`. Render `slug — title`.
  2. **Mark-article form:** Same pattern; source from `articles` table where `published_at IS NOT NULL`. Render `slug — title (published_at)`.
  3. **Award-achievement form:** Same; source from `achievements` table where `is_active=true`. Render `slug — display_name`.
  4. **Submit handler validates:** the chosen value must be in the fetched options list (defense-in-depth). On miss → inline field-level error; do not submit.
  5. **Async load:** lazy-fetch the options list when the form opens; cache for the session.
- **Dependencies:** Existing tables; no schema changes.
- **Verification:** Open mark-quiz form → search "geo" → matching quizzes appear → pick one → submit → toast confirms success against the actual slug. Type a fake slug into the input → no match dropdown → submit blocked.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A64 — `/admin/permissions` create-set/create-perm no slug validation

- **ID:** S6-A64
- **Title:** Apply `KEY_SLUG_RE` validation pre-submit
- **Source:** TODO_READ_ONLY_HISTORICAL.md A64. **Locked (best-practice):** Apply validation.
- **Severity:** P2
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/permissions/page.tsx:97-113` — operator can create a permission with an invalid key (spaces, capital letters, special chars). Downstream `requirePermission('...')` callers won't match.
- **Why it matters:** A bad permission slug ships and breaks every gate that references it. Pattern exists at `web/src/app/admin/feature-flags/page.tsx:34` (`KEY_SLUG_RE`) — just unused here.
- **The fix:**
  1. Import `KEY_SLUG_RE` from `feature-flags/page.tsx` OR (better) extract it into `web/src/lib/adminPalette.js` (or a new `web/src/lib/adminValidation.ts`) as a shared export. The latter is the genuine fix; the former is a patch.
  2. Validate slug on input change + on blur. Render inline field-level error: "Slug must match `[a-z0-9._-]+` (no spaces, no capitals)."
  3. Submit blocked when slug fails the regex.
- **Dependencies:** None.
- **Verification:** Type "Bad Slug" → error renders + submit blocked. Type "good.slug" → submit allowed.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A65 — `/admin/promo` discount-value uses TextInput

- **ID:** S6-A65
- **Title:** NumberInput with min=0 max=100 + on-blur validation
- **Source:** TODO_READ_ONLY_HISTORICAL.md A65. **Locked (best-practice):** NumberInput.
- **Severity:** P3
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/promo/page.tsx:155-161, 399-404` — discount value is a TextInput with no `type=number`, no min/max. Negative percent or >100 silently accepted in some browsers. Validation only post-submit.
- **Why it matters:** Easy to mis-enter; result is silent rejection that looks like success.
- **The fix:**
  1. `<NumberInput type="number" min={0} max={100} step="0.01" />` for percent discounts.
  2. Surface validation on blur, not after submit. Inline error: "Discount must be 0–100%."
  3. For fixed-amount discounts (if the form supports both), branch on the `discount_type` — fixed amount uses `min={0}` with no upper bound but capped at the plan's price.
- **Dependencies:** None.
- **Verification:** Enter -5 → error on blur. Enter 150 → error on blur. Enter 25 → submit allowed.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A66 — `/admin/notifications` log column "User" renders raw uuid

- **ID:** S6-A66
- **Title:** Render `@username` or `(deleted)`, never raw uuid
- **Source:** TODO_READ_ONLY_HISTORICAL.md A66. **Locked (best-practice):** Render `@username` / `(deleted)`.
- **Severity:** P3
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/notifications/page.tsx:313` — `n.users?.username || n.user_id`. When username is null/missing, raw uuid displays.
- **Why it matters:** PII-adjacent leak (uuid is technically PII when joined with audit data). Encourages copy-paste of uuids into other queries — bad operator habit.
- **The fix:** Replace the fallback chain. Render `@${username}` when present, `(deleted)` otherwise. Never raw uuid in a user-visible cell.
  ```tsx
  // Before:
  {n.users?.username || n.user_id}
  // After:
  {n.users?.username ? `@${n.users.username}` : '(deleted)'}
  ```
- **Dependencies:** None.
- **Verification:** Notification with valid user → `@bob`. Notification with deleted user → `(deleted)`. Never `b1234567-...`.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A12-admin — `score_tiers.color_hex` reads in admin

- **ID:** S6-A12-admin
- **Title:** Replace `score_tiers.color_hex` reads with neutral `ADMIN_C.muted` palette token
- **Source:** TODO_READ_ONLY_HISTORICAL.md A12 (admin slice). Memory rule `feedback_no_color_per_tier`.
- **Severity:** P2
- **Status:** 🟨 deps on S1 (column-drop migration)
- **File:line current state:** `web/src/app/admin/users/page.tsx:453, 713` — reads `score_tiers.color_hex`.
- **Why it matters:** Owner-locked: tiers don't get distinct hues. Tier is a label, not a visual identity. Per-tier color violates the rule.
- **The fix:**
  1. Replace the two `color_hex` reads with `ADMIN_C.muted` from `web/src/lib/adminPalette.js`.
  2. Remove the column from the admin select queries.
  3. Co-ships with S1's `score_tiers.color_hex` column-drop migration AND S9's iOS slice.
- **Dependencies:** S1 ships migration. S9 ships iOS slice in parallel (`VerityPost/VerityPost/ProfileView.swift`).
- **Verification:** Page renders with neutral muted color for tier labels. Console has no errors about missing column.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A113 — `/admin/access` TYPE_OPTIONS single-option dropdown

- **ID:** S6-A113
- **Title:** Remove the type field; default `'referral'` server-side
- **Source:** TODO_READ_ONLY_HISTORICAL.md A113. **Locked (best-practice):** Remove the field.
- **Severity:** P3
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/admin/access/page.tsx:43` — `TYPE_OPTIONS = ['referral']`. UI relic from a multi-type design that didn't ship.
- **Why it matters:** Single-option dropdowns confuse operators ("are there other types?"). UI should reflect what the system actually does.
- **The fix:**
  1. Remove the `type` field from the form JSX.
  2. Remove `TYPE_OPTIONS` constant.
  3. Server-side `/api/admin/access/...` defaults `type='referral'` if not provided. (Verify the route accepts a missing `type`; if it requires the field, route handler defaults to `'referral'` when the body omits it.)
- **Dependencies:** None.
- **Verification:** Form has no Type dropdown. Submitted record has `type='referral'`.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-A100 — `/contact` and `/profile/contact` post to different APIs (S6 slice)

- **ID:** S6-A100
- **Title:** Unify under `/api/support/public`; route attributes user when session present
- **Source:** TODO_READ_ONLY_HISTORICAL.md A100.
- **Severity:** P2
- **Status:** 🟨 coordinates with S7 + S8 (page edits live there)
- **File:line current state:**
  - `web/src/app/api/support/public/route.js` — already exists.
  - `web/src/app/api/support/route.js` — exists.
  - `web/src/app/contact/page.tsx:65` (S7 slice) — POSTs to `/api/support/public`.
  - `web/src/app/profile/contact/page.js:33` (S8 slice) — POSTs to `/api/support`.
- **Why it matters:** Tickets land in different tables/queues with no cross-visibility guarantee. Operator triaging support has to query both.
- **The fix (S6 slice):**
  1. **`/api/support/public/route.js`** — accept submissions from both anon and authed sessions. When session present, set `submitted_by_user_id = session.user.id` on the row; when absent, leave null. Same row shape regardless. Single queue, single operator surface.
  2. **Delete `/api/support/route.js`** entirely (no parallel paths). Migrate any existing rows from the old queue to the unified queue if needed (S1 ships data migration if rows exist).
  3. **Coordinate with S7** to update `/contact/page.tsx` (no change needed — already targets `/api/support/public`).
  4. **Coordinate with S8** to update `/profile/contact/page.js:33` to POST to `/api/support/public`. S8 ships this slice.
- **Dependencies:** S8 updates `/profile/contact/page.js`. S1 ships data migration if existing rows in old queue.
- **Verification:** Anon submits via `/contact` → row in unified queue with `submitted_by_user_id=null`. Authed submits via `/profile/contact` → row in unified queue with `submitted_by_user_id=<uuid>`. `/api/support` returns 404.
- **Multi-agent process:** 4 pre-impl + 2 post-impl reviewer (cross-session coordination).

---

### S6-Q1b-perms — Drop `requires_verified` checkbox/column from admin permissions UI

- **ID:** S6-Q1b-perms
- **Title:** Remove `requires_verified` UI surface; column dropped by S1
- **Source:** OWNER-ANSWERS_READ_ONLY_HISTORICAL.md Q1b. **Locked:** banner-only verification; permission gate goes away.
- **Severity:** P2
- **Status:** 🟨 deps on S1 migration (column drop)
- **File:line current state:**
  - `web/src/app/admin/permissions/page.tsx` — renders `requires_verified` checkbox per permission row.
  - `web/src/app/api/admin/perms/...` — accepts `requires_verified` in POST/PATCH bodies.
  - `web/src/components/PermissionsProvider.tsx` (S7 owns the components dir; verify) — reads `requires_verified` for gate decisions.
- **Why it matters:** Q1b dissolved `requires_verified` entirely. The 21 perms previously gated (comment, follow, vote, bookmark unlimited, see own activity, TTS, DM) now resolve identically for unverified and verified Free users. The column becomes dead.
- **The fix (S6 slice):**
  1. **Drop the checkbox** from `web/src/app/admin/permissions/page.tsx` permissions edit/create UI.
  2. **Drop the field** from `/api/admin/perms/...` POST/PATCH route handlers.
  3. **`requirePermission()` resolver** — drop the `requires_verified` branch entirely. (Verify ownership: if it's in `web/src/lib/auth.js` or similar, that's S3's domain. If it's in `web/src/lib/permissions.js`, S6 owns the lib slice. Check ownership before editing.)
  4. **Coordinate with S7** to remove the gate read from `web/src/components/PermissionsProvider.tsx`. (Components dir is shared — S7 typically owns; flag if so.)
- **Dependencies:** S1 ships migration setting all rows `requires_verified=false`, then drops the column.
- **Verification:** Permissions edit form has no checkbox. POST without the field succeeds. `requirePermission()` no longer reads `users.email_verified` for gate decisions. Owner-link beta cohort can comment/follow/vote without the bypass.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required (auth-adjacent).

---

### S6-T308 — Admin manual-sync downgrade ignores `frozen_at`

- **ID:** S6-T308
- **Title:** Clear `frozen_at` on admin-driven downgrade
- **Source:** TODO2 T308. **Q4.7 LOCKED:** Clear `frozen_at`. Frozen+free is logically incoherent; admin downgrade is a clean exit.
- **Severity:** P2
- **Status:** 🟦 open
- **File:line current state:** `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js:100-150` — downgrade branch clears `plan_grace_period_ends_at` only. `frozen_at` left untouched. Comment in file says "we leave verity_score / frozen_at alone."
- **Why it matters:** Frozen+free state is logically incoherent. Future agents can't reason about whether a frozen+free user is "still in disputed-payment recovery" or "wrongly stuck." Locked policy: clear it.
- **The fix:**
  1. Downgrade branch additionally sets `frozen_at = NULL`.
  2. Update the comment to reflect locked policy: `// Q4.7: admin manual-sync downgrade clears frozen_at — frozen+free is incoherent`.
  3. Audit log row captures the freeze-clear in `metadata.cleared_frozen_at = <prior_value>` for forensic visibility.
- **Dependencies:** S6-A57 helper (audit-after-mutate pattern).
- **Verification:** Manually downgrade a frozen user via admin → DB row has `frozen_at=NULL` + `plan_id=<free>` + audit row captures the prior `frozen_at`.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security/correctness reviewer required (billing-adjacent).

---

### S6-T347-admin — User-state enum admin sweep

- **ID:** S6-T347-admin
- **Title:** Admin UI sweep after S1 ships `user_state` enum
- **Source:** TODO2 T347. **Q4.1 LOCKED:** Apply. Enum: `('active','banned','locked','muted','frozen','deletion_scheduled','beta_locked','comped')`. Transition rules via DB CHECK constraints.
- **Severity:** P1
- **Status:** 🟨 deps on S1 (migration)
- **File:line current state:**
  - `web/src/app/admin/users/page.tsx` — reads/writes 8 boolean/timestamp columns: `is_banned`, `locked_until`, `is_muted`, `muted_until`, `deletion_scheduled_for`, `frozen_at`, `plan_grace_period_ends_at`, `verify_locked_at`, `comped_until`.
  - `web/src/app/admin/permissions/page.tsx` — may filter on these flags.
  - `web/src/app/api/admin/users/...` — mutation routes set these flags.
  - AccountStateBanner derives state from boolean cascade (S7 owns the component).
- **Why it matters:** 8 independent flags can't enforce sane combinations. A user can be banned AND frozen AND locked simultaneously with no DB-level constraint. Locked: collapse to one canonical enum.
- **The fix (S6 slice):**
  1. **After S1 ships `user_state` migration**, sweep:
     - Admin user grid → render `user_state` enum value as a badge; remove the 8 separate boolean columns.
     - Mutation routes → write `user_state` (e.g., banning a user sets `user_state='banned'`); never write the legacy booleans (S1 already drops them).
     - Permissions admin → filter on `user_state` not on individual flags.
     - Admin audit-log displays the enum value, not the boolean cascade.
  2. **Coordinate with S7** for AccountStateBanner — banner derives display from enum directly.
  3. **Coordinate with S5** for any social-surface admin tools that gate on user-state (none expected).
- **Dependencies:** S1 ships migration. S7 updates AccountStateBanner.
- **Verification:** Admin user grid shows `user_state='banned'` for a banned user. Mutation routes set `user_state` correctly. Old boolean columns gone from DB (S1 verifies).
- **Multi-agent process:** Batch-mode: 1 planner + 4 implementers (admin grid, mutation routes, perms admin, audit display) + reviewer. Security reviewer required.

---

### S6-database-types — Regenerate `web/src/types/database.ts`

- **ID:** S6-database-types
- **Title:** Run Supabase types codegen post-S1 ships; commit result
- **Source:** Coordinates with S1.
- **Severity:** P2
- **Status:** 🟨 deps on S1 (all schema changes shipped)
- **File:line current state:** `web/src/types/database.ts` — current as of last codegen; drifts every time S1 ships a migration.
- **Why it matters:** Type drift cascades into every TypeScript caller. Manual edits create lying types. Regenerated types are the only correct source.
- **The fix:**
  1. **Wait for S1 to confirm all in-scope migrations have been APPLIED to production** (not just drafted; not just in `Ongoing Projects/migrations/`).
  2. Run codegen: `npx supabase gen types typescript --project-id <id> > web/src/types/database.ts` (use the project's actual codegen invocation; verify in `package.json` scripts).
  3. Commit the regenerated file. **No hand edits.**
  4. Run `tsc --noEmit` to surface any type errors from the new generation; fix callers in their respective sessions (each session owns its own caller fixes).
- **Dependencies:** S1 confirms all migrations applied.
- **Verification:** `git diff web/src/types/database.ts` shows the regenerated content. `npx tsc --noEmit` passes (or surfaces typed errors that get filed against the appropriate session).
- **Multi-agent process:** 1 reviewer for the diff. No implementation agents needed (codegen output).

---

### S6-Cleanup-§A1 — `/api/expert/vacation` route missing

- **ID:** S6-Cleanup-§A1
- **Title:** BUILD the `/api/expert/vacation` route handler
- **Source:** Cleanup §A1 (CONFIRMED 2026-04-27). **Locked:** BUILD the route.
- **Severity:** P0
- **Status:** 🟨 coordinates with S8 (caller)
- **File:line current state:**
  - **Call site (S8 slice):** `web/src/app/redesign/profile/_sections/ExpertProfileSection.tsx:121` — `await fetch('/api/expert/vacation', { ... })`.
  - **Comment (same file, line 3):** "the existing /api/expert/apply + /api/expert/vacation endpoints" — refers to it as if it exists.
  - **Reality:** `web/src/app/api/expert/` contains `apply/`, `ask/`, `queue/`, `back-channel/`, `answers/` — NO `vacation/route.ts` or `route.js`. Verified 2026-04-27.
  - **Effect:** every vacation-toggle action from the redesign expert profile section returns 404.
- **Why it matters:** Production 404 on a redesign-profile feature. Users with the expert role and active applications can't toggle vacation status.
- **The fix:**
  1. **Build `web/src/app/api/expert/vacation/route.ts`** with POST handler (toggle/set) and GET handler (read current state).
  2. **Schema:** Sets/unsets `expert_vacation` boolean on the user row (or on `expert_applications` — verify which table holds expert state via MCP query before building). If the column doesn't exist on either table, S1 ships a migration to add it; S6 builds the route after.
  3. **Auth:** `requireAuth` + `requireRole('expert')` (verify the actual role check pattern in sibling routes like `/api/expert/apply/route.ts`).
  4. **API contract:**
     - `POST /api/expert/vacation` body: `{ on_vacation: boolean }` → updates the column → returns `{ ok: true, on_vacation: <new_value> }`.
     - `GET /api/expert/vacation` → returns `{ on_vacation: <current> }`.
  5. **Coordinate with S8** to confirm the caller's expected response shape; S8 wires the success/error UX.
  6. **Audit log:** any change to `expert_vacation` writes an `audit_log` row via `withDestructiveAction` (S6-A57 helper).
- **Dependencies:** S1 may need a migration if the column doesn't exist (verify via MCP first). S8 confirms caller shape.
- **Verification:**
  - As an expert user: POST `{on_vacation: true}` → 200 + DB column set. GET → returns true.
  - As a non-expert user: 403.
  - Caller in ExpertProfileSection.tsx: vacation toggle works end-to-end.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required.

---

### S6-Cleanup-§A2 — `update_metadata` RPC type drift

- **ID:** S6-Cleanup-§A2
- **Title:** S6 regenerates `database.ts` post-S1; flag caller for S3
- **Source:** Cleanup §A2 (CONFIRMED missing from types 2026-04-27).
- **Severity:** P1 (may be runtime-broken or just type drift)
- **Status:** 🟨 deps on S1 (verify RPC exists)
- **File:line current state:**
  - **Call sites (S3 slice):** `web/src/app/api/auth/email-change/route.js:166` and `:171`.
  - **Reality:** zero defs in `web/src/types/database.ts`. Either RPC exists in production DB (types stale) or was renamed/dropped (call site orphaned).
- **Why it matters:** If RPC is missing in DB, the email-change route silently breaks at runtime when those lines fire. If RPC exists but types are stale, callers may pass wrong shapes.
- **The fix (S6 slice):**
  1. **S1 verifies via MCP:** `SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'update_metadata';`
  2. **If exists:** S6 regenerates `database.ts` post-S1 (already covered by S6-database-types).
  3. **If does not exist:** S1 either creates it OR S3 rewrites the caller to use a direct `users.update()` setting `metadata` jsonb. **Flag for S3** — caller is in S3's domain.
- **Dependencies:** S1 verifies RPC existence. S3 owns caller.
- **Verification:** Post-fix: types include `update_metadata` Or caller doesn't reference it. `tsc --noEmit` clean.
- **Multi-agent process:** Investigator quotes `pg_proc` result; planner picks remediation path.

---

### S6-Cleanup-§D1 — `/api/ai/generate` legacy route

- **ID:** S6-Cleanup-§D1
- **Title:** DELETE the route + migrate callers into F7 pipeline orchestrator
- **Source:** Cleanup §D1 (CONFIRMED 2026-04-27 — file exists at `web/src/app/api/ai/generate/route.js`). **Locked:** DELETE + migrate.
- **Severity:** P2 (parallel-path drift trap; turns into P0 once it produces drift)
- **Status:** 🟦 open
- **File:line current state:**
  - **Route:** `web/src/app/api/ai/generate/route.js` — single-shot legacy path; ships three actions (`generate`, `kids_rewrite`, `timeline`) bypassing every pipeline guard.
  - **Caller 1:** `web/src/app/admin/story-manager/page.tsx` — calls for `generate` and `timeline`.
  - **Caller 2:** `web/src/app/admin/kids-story-manager/page.tsx` — calls for `kids_story`, `timeline`, `simplify`.
  - **F7 orchestrator:** `web/src/app/api/admin/pipeline/generate/route.ts`.
- **Why it matters:** Two writers into one table = drift trap. Different prompt-injection defense than F7. Different write path than `persist_generated_article`. Memory rule `feedback_genuine_fixes_not_patches`: no parallel paths.
- **The fix:**
  1. **Migrate caller 1** (story-manager): replace `/api/ai/generate` actions with calls to `/api/admin/pipeline/generate` (F7). Map the three action kinds to F7 step invocations. Adjust response handling.
  2. **Migrate caller 2** (kids-story-manager): same pattern for `kids_story`, `timeline`, `simplify`. F7 orchestrator gains `simplify` step if missing (verify).
  3. **Delete `web/src/app/api/ai/generate/` directory entirely** — route handler + any helpers. The OpenAI direct-call code goes with it.
  4. **Drop dead imports.** Run `grep -rn "/api/ai/generate" web/src/` post-fix; expect zero hits.
- **Tradeoff inline:** F7's `simplify` step may not exist; if so, S6 adds it as part of the migration (this lives in `web/src/lib/pipeline/`). Net effect: one orchestrator, one prompt-injection defense, one write path.
- **Dependencies:** None.
- **Verification:** Story-manager generate action works end-to-end through F7. Kids-story-manager simplify works. `grep -rn "ai/generate" web/src/` zero hits. `web/src/app/api/ai/` directory empty (or removed).
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required (pipeline + prompt-injection class).

---

### S6-Cleanup-§D2 — Legacy section-cache permissions

- **ID:** S6-Cleanup-§D2
- **Title:** RETIRE; switch PermissionsProvider to new path
- **Source:** Cleanup §D2 (CONFIRMED 2026-04-27 — R1/R2 memo overstated "one caller"). **Locked:** RETIRE.
- **Severity:** P2
- **Status:** 🟨 coordinates with S7 (PermissionsProvider component ownership)
- **File:line current state:**
  - `web/src/lib/permissions.js:145` — defines `getCapabilities` (S6 owns this lib if it's not under `auth.js`; verify ownership against `00_INDEX.md`).
  - `web/src/components/PermissionsProvider.tsx:17, 149` — imports and uses as `fetchSection`. **Components dir — verify ownership.** Per `00_INDEX.md` cross-cutting note, components excluding S5-owned belong to S7. **PermissionsProvider falls under S7's slice for the component edit.**
  - `web/src/lib/permissionKeys.js:12` — referenced in comments.
  - `web/src/types/database.ts:10561` — `get_my_capabilities` RPC type still present.
- **Why it matters:** Bible §3.1 says "Migration ongoing; both paths share version bumps." Reality: mostly migrated, PermissionsProvider is the remaining caller. Cleanup is one PR. Eliminates a parallel path.
- **The fix:**
  1. **S6 retires lib slice:**
     - `web/src/lib/permissions.js` — remove `getCapabilities`, `getCapability` exports.
     - `web/src/lib/permissionKeys.js` — remove `permissionKeys.SECTIONS` constant.
  2. **S1 ships RPC drop migration:** `DROP FUNCTION IF EXISTS public.get_my_capabilities;` (after callers cleared).
  3. **S7 switches PermissionsProvider** to the new path. Flag this slice for S7 — provide them the diff outline.
  4. **S6 regenerates `database.ts`** post-S1 (covered by S6-database-types).
  5. **Bible update** in S6's final-pass §G3 deliverable: "shipped (single path)."
- **Dependencies:** S7 ships PermissionsProvider edit; S1 ships RPC drop.
- **Verification:** `grep -rn "get_my_capabilities\|getCapabilities\|permissionKeys.SECTIONS" web/src/` zero hits. Permissions still work end-to-end.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required.

---

### S6-Cleanup-§D3 — Tweens story-manager UI stub

- **ID:** S6-Cleanup-§D3
- **Title:** DELETE the stub directory + stop pipeline tween generation
- **Source:** Cleanup §D3. **Locked:** DELETE the stub; data-band stays in DB.
- **Severity:** P2
- **Status:** 🟦 open
- **File:line current state:**
  - `web/src/app/admin/tweens-story-manager/` — partial stub UI (S6-A29 above is the interim fix; this is the final state).
  - `web/src/lib/pipeline/` — pipeline generates tween articles (`age_band='tweens'`).
- **Why it matters:** Editorial side isn't operating tweens end-to-end. Data being written without an editorial UI. AR1 will rebuild the writer-facing UI properly; the stub is dead weight.
- **The fix:**
  1. **Delete the stub directory** `web/src/app/admin/tweens-story-manager/` entirely.
  2. **Stop the pipeline from generating tween articles.** In `web/src/lib/pipeline/` (specifically the audience-safety / band-selection logic), drop `'tweens'` from the band-selection enum on writes. The `age_band='tweens'` value stays in the DB schema (data-band exists); the pipeline simply doesn't target it pre-AR1.
  3. **Drop links to the stub** from any admin nav surface.
  4. Inline rationale comment: "Tweens story-manager removed pre-AR1; data-band stays in schema. AR1 ships the proper editor flow."
- **Dependencies:** None. Supersedes S6-A29 (S6-A29 is the interim fix; once §D3 lands, S6-A29 is moot).
- **Verification:** `web/src/app/admin/tweens-story-manager/` gone. Pipeline runs produce no `age_band='tweens'` rows. Existing tween articles still readable via DB.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Pipeline reviewer required.

---

### S6-Cleanup-§D4 — `verity_family_xl_*` historical comments cleanup

- **ID:** S6-Cleanup-§D4
- **Title:** Sweep stale comments in admin/ad-placements + api/family/config
- **Source:** Cleanup §D4. Q1 cleaned admin/cohorts already.
- **Severity:** P3 (doc rot)
- **Status:** 🟦 open
- **File:line current state (verified 2026-04-27):**
  - `web/src/app/admin/ad-placements/page.tsx:26` — comment: "// T319 — `verity_family_xl` retired per Phase 2 of AI + Plan Change"
  - `web/src/app/api/family/config/route.js:24` — comment: "//   - verity_family_xl is retired permanently (per-kid model replaces it)"
  - admin/cohorts already cleaned (Q1 Wave 21).
- **Why it matters:** Retired SKU per T319 (2026-04-27); plan rows already deleted from DB. Stale comments. Future agents may interpret as live SKU.
- **The fix:**
  1. **`admin/ad-placements/page.tsx:26`** — either delete the comment or update to past-tense: `// T319 — verity_family_xl was retired 2026-04-27 (per-kid model replaces it)`. Keep the past-tense version for git-blame future-readability.
  2. **`api/family/config/route.js:24`** — same; either delete or past-tense.
- **Dependencies:** None.
- **Verification:** `grep -rn "verity_family_xl" web/src/app/admin/ web/src/app/api/family/` returns only past-tense comments OR zero hits. Q1 already verified other surfaces clean.
- **Multi-agent process:** 1 implementer + 1 reviewer. Trivial.

---

### S6-Cleanup-§D5 — `@admin-verified` marker remnants (TRACKER — moved)

- **ID:** S6-Cleanup-§D5
- **Status:** 🟨 MOVED — middleware edit lives in `Session_03_Auth.md` as **S3-§D5**.
- **Why moved:** the substantive edit is to `web/src/middleware.js:267`, which is S3-owned per `00_INDEX.md`. S6 is hermetically blocked from editing middleware.
- **S6's residual scope:**
  1. Edit `web/src/app/admin/pipeline/runs/page.tsx:19` — rephrase the comment without referencing the retired `@admin-verified` marker (e.g., "Coexists with the existing /admin/pipeline shell"). This file is admin-shell territory and stays inside S6.
  2. Post-S3-ship verification: `grep -rn "@admin-verified" web/src/` returns zero hits across both domains.
- **Coordination:** S3-§D5 lands first (or co-ships); S6 lands its admin-page comment rewrite in the same window.

---

### S6-Cleanup-§D6 — Pipeline-cleanup `archive_cluster` cast through unknown (TRACKER — moved)

- **ID:** S6-Cleanup-§D6
- **Status:** 🟨 MOVED — full body lives in `Session_02_Cron.md` as **S2-§D6-CAST**.
- **Why moved:** the substantive edit is to `web/src/app/api/cron/pipeline-cleanup/route.ts:256-265`, which is S2-owned (cron handlers) per `00_INDEX.md`. S6 is hermetically blocked from editing cron route files.
- **S6's residual scope:**
  1. Ship `S6-database-types` (regenerate `web/src/types/database.ts` against the S1 schema). This unblocks the S2 cast removal.
  2. Post-S2-ship verification: `grep -n "as unknown" web/src/app/api/cron/pipeline-cleanup/route.ts` returns zero hits and `tsc --noEmit` is clean.
- **Coordination:** S6's `database-types` regen lands first → S2-§D6-CAST removes the cast → S6 verifies. The existing `S2-D6 (partial verify)` item in `Session_02_Cron.md` covers the verify branch and now coexists with `S2-§D6-CAST` which does the cast removal.

---

### S6-Cleanup-§H3 — Search free-tier paid filters silently stripped

- **ID:** S6-Cleanup-§H3
- **Title:** Return 403 with reason; S7 renders locked UI client-side
- **Source:** Cleanup §H3. **Locked:** Render filter as locked UI client-side (S7 slice); S6 returns proper 403.
- **Severity:** P1 (silent-by-design class)
- **Status:** 🟨 coordinates with S7 (search page UI)
- **File:line current state:**
  - **`web/src/app/api/search/route.js:11`** (S7-owned route per the session map — verify; if S7 owns API search, then S6 only owns the broader pattern). Per `00_INDEX.md`, S7 owns `web/src/app/api/quiz/**` + `web/src/app/api/recap/**`. The search API route is in S7's domain. **Defer the route edit to S7.**
  - But: the **silent-strip pattern** is the issue. Paid filters silently stripped server-side; UI doesn't know.
- **Why it matters:** Free-tier user clicks a paid-only filter, expects results, gets results filtered without the constraint applied. Looks like the product is broken; actually the product is silently lying.
- **The fix:**
  - **S7 owns the route handler edit** in `web/src/app/api/search/route.js`: when free-tier caller attempts a paid-only filter, return 403 with structured body `{ error: 'paid_only_filter', filter: '<name>', upgrade_to: 'pro' }`. Do not silently strip.
  - **S7 owns the page UI:** render filter as locked (greyed + lock icon + "Pro" pill); on click, open upgrade modal.
- **Dependencies:** S7 owns the entire fix. S6 flags it for tracking; no S6 file edits.
- **Verification:** S7 ships; verify free-tier user clicking the filter sees the upgrade affordance, never silent results.
- **Multi-agent process:** S7 owns the implementation. S6 tracks.

---

### S6-Cleanup-§F1-F2-F3 — `/corrections`, `/editorial-standards`, `/methodology` pages

- **ID:** S6-Cleanup-§F1-F2-F3
- **Title:** S7 owns new pages; S6 stub for `/api/corrections` not needed
- **Source:** Cleanup §F1, §F2, §F3. **Locked (Q4.19):** Ship all three pre-launch.
- **Severity:** P1 (trust-transparency surface, launch-blocker per panel §1.1)
- **Status:** 🟨 S7 owns
- **File:line current state:**
  - `/corrections` — does not exist.
  - `/editorial-standards` — does not exist.
  - `/methodology` — does not exist; possibly folds into `/editorial-standards`.
- **Why it matters:** Trust-transparency surface is a launch-blocker. No corrections page = no public accountability for retractions/unpublishes.
- **The fix:**
  - **S7 owns** the three new pages.
  - **`/corrections`** reads `articles WHERE retraction_reason IS NOT NULL OR unpublished_at IS NOT NULL` directly via Supabase client. **No API route needed** — Supabase client + RLS handles the query. **S6 does not ship a stub `/api/corrections`.**
  - **`/editorial-standards`** documents AI-assists-human-author + provenance pill semantics + corrections policy. Static page (no API).
  - **`/methodology`** may fold into `/editorial-standards` as a section.
- **Dependencies:** None on S6.
- **Verification:** S7 ships pages. S6 confirms no stub API was created.
- **Multi-agent process:** S7 owns.

---

### S6-Cleanup-§G — Bible drift refresh (`FEATURE_BIBLE.md`)

- **ID:** S6-Cleanup-§G
- **Title:** Doc-only refresh of FEATURE_BIBLE.md
- **Source:** Cleanup §G. **Q4.17 LOCKED:** Doc-only; bundle into S6's owned scope as final-pass deliverable AFTER all other S6 items ship.
- **Severity:** P3 (doc drift)
- **Status:** 🟦 open (final-pass deliverable)
- **File:line current state (sections needing refresh):**
  - **§3.1** — says Wave 1→2 permission migration "ongoing"; reality: mostly done. Update to "shipped (single path)" after S6-Cleanup-§D2 lands.
  - **§10.2 + §19.1** — say `parental_consents` stores version + parent_name + IP + UA. Reality: half-true (pair-time has IP/UA, no version/name; create-time has version/name in `kid_profiles.metadata`, no UA). Rewrite honestly OR document the schema state.
  - **§13.2** — documents `POST /api/billing/checkout`; route does not exist. Actual endpoint is `/api/stripe/checkout`. Rename bible reference OR restore the alias (S4 owns the alias if needed).
  - **§16** — says 18 crons. Reality: 19 handlers in `api/cron/` (17 registered in `vercel.json`, 2 unregistered: `cleanup-data-exports`, `rate-limit-cleanup`). Update count after S2 confirms cleanup of unregistered crons (Cleanup §C3).
  - **§16** — says `send-push` schedule is "every minute"; vercel.json says daily. After S2 fixes (Cleanup §C1), update.
  - **§18 + §23** — frame NCMEC as a feature toggle alongside AdSense/OpenDyslexic. Rewrite to mark NCMEC as launch-blocker, not toggle.
  - **§22.4** — AI-as-author intent correction per memory `project_ai_role_intent_correction`. Owner-stated: pipeline writing full bodies was unintended; rewrite to AI-assists-human-author intent. AR1 plan inlined elsewhere in this file is the architectural answer; bible documents the intent.
- **Why it matters:** Bible drift makes onboarding new agents harder. Future agents will trust the bible over code; if the bible lies, the gap propagates.
- **The fix:**
  1. **Wait for all other S6 items to ship.** Bible refresh runs LAST.
  2. Edit `FEATURE_BIBLE.md` (verify path; likely repo-root or `Reference/`).
  3. Update each listed section against current reality (verify each claim against code/MCP at write time).
  4. Per `FEATURE_BIBLE.md` §26 maintenance protocol: every §A/§B/§C/§D/§G item resolved produces a bible update in the same change.
- **Dependencies:** All other S6 items ship first. S2 ships C1+C3. S4 may own §13.2.
- **Verification:** Each updated section reflects current code/schema. No claim contradicted by current state.
- **Multi-agent process:** 1 writer + 2 reviewers (one for accuracy, one for tone/style).

---

### S6-Cleanup-§I11-admin — COPPA consent versioning admin UI

- **ID:** S6-Cleanup-§I11-admin
- **Title:** Admin UI for managing consent version + viewing parents flagged for re-consent
- **Source:** Cleanup §I11.
- **Severity:** P1
- **Status:** 🟨 deps on S1 (schema) + S2 (cron)
- **File:line current state:** Consent version stamped at `2026-04-15-v1` with no re-consent mechanism. When text changes, existing kids stay on old version. No admin UI to manage version or view re-consent queue.
- **Why it matters:** When consent text changes (legal copy update, new data-collection scope), parents need re-consent. Today the system has no surface for this.
- **The fix (S6 slice):**
  1. **S1 schema:** add `consent_versions` table (or extend `parental_consents` with `version_text`, `version_active_from`); track active version. **Defer to S1.**
  2. **S2 cron:** sweep `parental_consents` rows where version != current, flag the parent for re-consent (write a notification + `re_consent_required=true` on the row). **Defer to S2.**
  3. **S6 admin UI:** new page `web/src/app/admin/coppa-consent/page.tsx`:
     - Display current consent version + history.
     - Form to ship a new version (writes a new `consent_versions` row, sets active).
     - Table of parents flagged for re-consent (count + filterable list).
     - Audit log of consent-version changes (writes via `withDestructiveAction`).
  4. **EDITOR_ROLES gate** + audit-log on every version change.
- **Dependencies:** S1 schema, S2 cron.
- **Verification:** Ship a new version → cron flags parents on next run → admin UI shows the count.
- **Multi-agent process:** 4 pre-impl + 2 post-impl. Security reviewer required (COPPA-adjacent).

---

### S6-E22 — `category_supervisors` UI surface

- **ID:** S6-E22
- **Title:** Build admin UI for `category_supervisors` table
- **Source:** Cleanup §E22.
- **Severity:** P4
- **Status:** 🟦 open (low priority — feature surfacing)
- **File:line current state:** `category_supervisors` table populated; no UI surface exposing supervision relationships.
- **Why it matters:** Data on the floor. Pipeline costs to compute supervision data with no visibility.
- **The fix:**
  1. New page `web/src/app/admin/category-supervisors/page.tsx`:
     - Table of (category, supervisor user) pairs.
     - Edit/add UI to assign supervisors to categories (select-from-DB for both dropdowns).
     - Audit log on changes via `withDestructiveAction`.
  2. EDITOR_ROLES gate.
  3. Read query joins `category_supervisors` + `categories` + `users` for display names.
- **Tradeoff inline:** Low priority — can defer until product surface needs it. Document as launch-deferrable.
- **Dependencies:** None.
- **Verification:** Add a supervisor → row in `category_supervisors`. Edit → updates row. Delete → removes row.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-E23 — `expert_applications` credentials/bio/portfolio admin display

- **ID:** S6-E23
- **Title:** Surface credentials/bio/portfolio in admin expert review; coordinate with S7/S8 for public expert profile
- **Source:** Cleanup §E23.
- **Severity:** P4
- **Status:** 🟦 open
- **File:line current state:** `expert_applications` table holds credentials/bio/portfolio. Admin-only data; never rendered publicly.
- **Why it matters:** Operator can't see full applicant context when reviewing applications. Public users can't verify expert credentials.
- **The fix (S6 slice):**
  1. **Admin review surface** at `web/src/app/admin/expert-applications/page.tsx` (verify path; if exists, augment) — display credentials/bio/portfolio fields in the application detail view. Not just slug + name.
  2. **Public expert profile is S7/S8 work** (public surface). Flag for them — once approved, expose `expert_organization`, `expert_title`, public-portfolio fields on the public profile.
- **Dependencies:** S7 or S8 ships public expert profile.
- **Verification:** Admin opens an application detail → all fields render including portfolio links.
- **Multi-agent process:** 4 pre-impl + 1 post-impl reviewer.

---

### S6-AR1 — Pipeline AI-as-author rewrite (project, not session items)

- **ID:** S6-AR1
- **Title:** Architectural rewrite — invert pipeline from "LLM authors, human reviews" to "LLM verifies + organizes facts, human authors"
- **Source:** TODO_READ_ONLY_HISTORICAL.md A28 / OWNER-ANSWERS Q4 (treat as project). Memory `project_ai_role_intent_correction`.
- **Severity:** P0 (architectural; pre-launch is the only window without retraction-of-record concerns)
- **Status:** 🟧 PROJECT — multi-week. Not a session item. Inlined here so future S6 sessions have the plan.
- **Why it matters:** Owner intent: AI assists, humans write. Current code does the inverse. Editorial accountability, EU AI Act / CA AB 2655 disclosure, and §230 coverage all fail under "AI authors, no human signature." Pre-launch is the only window to invert without retraction concerns.
- **AR1 punch list (11 sub-tasks):**
  1. **Prompts:** Kill body-writing prompts (adult/kids/tweens) in `web/src/lib/pipeline/editorial-guide.ts`. Convert headline + summary prompts to `_SUGGESTIONS_` shape (N candidates with confidence scores; human picks). Convert timeline to verbatim-extraction.
  2. **New table `editorial_briefs`** (S1 schema): `(id, cluster_id, pipeline_run_id, audience, age_band, facts_brief jsonb, source_grounding jsonb, headline_candidates jsonb, summary_candidates jsonb, timeline_events_extracted jsonb, claimed_by, claimed_at, submitted_article_id, submitted_at, status enum, created_at, updated_at)`.
  3. **New writer-facing UI** at `web/src/app/admin/newsroom/briefs/[id]/page.tsx` (S6 owns): facts panel + source quotes + headline candidates as buttons + markdown editor + Submit-for-review CTA. Editor sees brief, picks candidates, writes the article.
  4. **Orchestrator rewire** (`web/src/app/api/admin/pipeline/generate/route.ts`): restructure 12-step chain to `audience_safety → source_fetch → fact_extract → source_grounding (HARD gate) → categorization → headline_suggestions → summary_suggestions → timeline_extract → kid_url_sanitizer → persist_brief`. Body / plagiarism / quiz / quiz-verification move to a post-human-draft endpoint.
  5. **Schema** (S1): Add `articles.editor_id`, `articles.editor_assigned_at`. Replace `articles.is_ai_generated` boolean with `ai_assistance_level` enum (`none | brief_generated | quiz_generated | timeline_extracted`). Add `article_source_claims` join table. Drop `kids_summary` set-on-adult-article. Delete legacy `/api/ai/generate/route.js` (already covered by S6-Cleanup-§D1).
  6. **Source-grounding:** Promote from warn → block. Any unsupported claim aborts. Drop the threshold-of-3 heuristic. Hard-fail on grounding LLM error (not warn).
  7. **Kid URL sanitizer:** Throw, don't warn. Either sanitizer succeeds or kid article doesn't ship. Today wraps in try/catch and continues.
  8. **Plagiarism redefine:** Target = human draft, not AI output. Add longest-common-substring fair-use check (≥50 chars), not just n-gram overlap. Stop auto-rewriting human drafts behind their back.
  9. **Prompt-override safety** (`web/src/lib/pipeline/prompt-overrides.ts`): server-side filter rejecting overrides containing strings like "ignore", "disregard", "the above does not apply". OR wrap user-supplied additions in `<override_request>` tags with base prompt explicitly stating they never override the rules above.
  10. **Public surface accountability** (S7 owns story page, but coordinate): `author_id IS NOT NULL` required on publish. `editor_id IS NOT NULL AND editor_id != author_id` required on publish. AI provenance pill renders model/provider/role with tooltip linking to `/editorial-standards#ai-disclosure`.
  11. **Audience-safety tightening** (`web/src/app/api/admin/pipeline/generate/route.ts:329, :967`): tighten Zod schema; require `'kids'` only to proceed on a kid run; `'both'` and `'adults'` both abort. Today `'both'` passes through.
- **Files affected:** `web/src/lib/pipeline/{editorial-guide,persist-article,plagiarism-check,prompt-overrides,clean-text}.ts`, `web/src/app/api/admin/pipeline/generate/route.ts`, `web/src/app/api/ai/generate/route.js` (delete — covered by §D1), `web/src/app/admin/newsroom/page.tsx`, new `web/src/app/admin/newsroom/briefs/[id]/page.tsx`, schema migrations (editorial_briefs, article_revisions, article_source_claims, articles.editor_id, ai_assistance_level enum, drop articles.is_ai_generated boolean), permissions seed.
- **Effort:** 4-6 weeks for one engineer. Parallelizable: schema + briefs table + writer UI can start while prompt rewrites land.
- **Dependencies:** S1 ships ~5 migrations (editorial_briefs, article_revisions, article_source_claims, articles.editor_id, ai_assistance_level enum, drop is_ai_generated boolean). S6 owns lib + admin newsroom + orchestrator. S7 owns story-page provenance.
- **Verification:** End-to-end: pipeline run produces a brief (not a draft article); editor opens `/admin/newsroom/briefs/[id]`, picks headline + summary, writes body, submits; published article has `author_id`, `editor_id`, AI provenance pill renders.
- **Multi-agent process:** Per sub-task — 4 pre-impl + 2 post-impl. Security reviewer required throughout. **This project takes its own dedicated session(s); do not start during the standard S6 ship pass.**

---

## Cross-session coordination summary

S6 has dependencies on or coordinates with every other session. Concise map:

- **S1 (DB Migrations):** ships RPCs, schema migrations, column drops, RLS policies. S6 waits for S1 to apply, then regenerates types. S1 deps: A26 (caller_can_assign_role verification), A23 (broadcast RPC), A12-admin (score_tiers.color_hex drop), Q1b-perms (requires_verified drop), T347 (user_state enum), §A1 (expert_vacation column verify), §D1 (no migration; pure code), §D2 (drop get_my_capabilities RPC), AR1 (~5 migrations).
- **S2 (Cron):** owns vercel.json + cron handlers. S6 flags §C1 (send-push schedule) + §C3 (unregistered crons) + §C5 (count) + §D6 (archive_cluster cast removal post-types-regen) for S2.
- **S3 (Auth):** owns `web/src/lib/auth.js`, `middleware.js`, login pages. S6 flags Q1b-perms (resolver branch in auth.js if applicable), §A2 (email-change caller of update_metadata), §D5 (middleware.js comment).
- **S4 (Billing):** owns Stripe/Apple/promo. S6 coordinates §G §13.2 bible reference (alias decision).
- **S5 (Social):** owns components dir EXCEPT shared. PermissionsProvider in §D2 is S7-owned per `00_INDEX.md` ("components excluding S5-owned belong to S7"). Verify each component edit's owner.
- **S7 (Public web):** owns story page, /welcome, /search, /corrections, /editorial-standards, /methodology, /pricing, /how-it-works, AccountStateBanner. S6 flags A100 caller (/contact unchanged — already targets /api/support/public), §H3 search filter UI + route, §F1-F3 new pages, §D2 PermissionsProvider component edit, AR1 story-page provenance.
- **S8 (Profile):** owns /profile, /redesign, /u/[username]. S6 flags A100 (/profile/contact caller), §A1 (ExpertProfileSection caller), T347-admin (no S8 deps but mention).
- **S9 (iOS Adult):** owns VerityPost. S6 flags A12-admin parallel iOS slice.
- **S10 (iOS Kids):** owns VerityPostKids + /api/kids. No direct S6 deps.

---

## Out of scope (explicit)

- Public web pages (S7).
- Profile + redesign (S8).
- iOS apps (S9, S10).
- DB migrations (S1).
- Cron route handlers (S2; S6 doesn't edit `web/src/app/api/cron/**` despite the broader API directory ownership).
- Authentication routes (S3).
- Billing routes (S4).
- Social-surface API routes (S5).
- AR1 implementation (project, not session items — multi-week).

---

## Session-completion checklist

Before declaring S6 done, confirm:

### Code

- [ ] Every item above is shipped (commit hash recorded in this file inline) OR explicitly DEFERRED with rationale (which session/project owns it).
- [ ] No file outside the owned-paths list was edited (`git diff --name-only main` filtered against owned paths).
- [ ] `grep -rn "@admin-verified" web/src/` returns zero hits.
- [ ] `grep -rn "/api/ai/generate" web/src/` returns zero hits (post-§D1).
- [ ] `grep -rn "ToastProvider" web/src/app/admin/` returns only `layout.tsx` (post-A58).
- [ ] `grep -rn "verity_family_xl" web/src/app/admin/ web/src/app/api/family/` returns only past-tense comments (post-§D4).
- [ ] `grep -rn "get_my_capabilities\|getCapabilities" web/src/` returns zero hits (post-§D2 + S1 RPC drop).
- [ ] `grep -rn "color_hex" web/src/app/admin/` returns zero hits (post-A12-admin + S1 column drop).

### Patterns

- [ ] No fake-state UI ships. Every admin toggle either persists or is removed.
- [ ] Every destructive admin action wraps `DestructiveActionConfirm` with reason capture.
- [ ] Every admin mutation uses `withDestructiveAction` from S6-A57 (mutate-first-audit-on-success pattern).
- [ ] No `requires_verified` references in admin UI or `/api/admin/perms/...` routes (post-Q1b-perms).
- [ ] No `/admin/articles/[id]` 404s (post-A29 link repoint OR post-AR1 writer UI).
- [ ] No keyboard shortcuts / hotkeys / command palettes proposed or built (memory `feedback_no_keyboard_shortcuts`).
- [ ] No parallel paths in pipeline (post-§D1; F7 is the only orchestrator).
- [ ] No `// TODO: revisit` / `// HACK` / force-unwrap-as-crutch markers introduced.

### Types

- [ ] `web/src/types/database.ts` regenerated against current schema after S1 confirmed all migrations applied.
- [ ] `npx tsc --noEmit` clean (or surfaced errors filed against owning session).

### Audit + observability

- [ ] All admin mutations write `audit_log` rows (S6-A5 path: structured log + fallback insert on RPC failure).
- [ ] `[AUDIT-FAILURE]` log lines surface in dev when audit RPC fails (smoke tested).
- [ ] Broadcast confirmation modal requires count typeback (smoke tested at small scale).

### Bible (final-pass)

- [ ] §3.1 reflects "shipped (single path)" for permissions.
- [ ] §10.2 + §19.1 honest about parental_consents storage.
- [ ] §13.2 references the actual checkout endpoint name.
- [ ] §16 reflects accurate cron count + send-push schedule.
- [ ] §18 + §23 mark NCMEC as launch-blocker, not toggle.
- [ ] §22.4 reflects AI-assists-human-author intent.

### Commit hygiene

- [ ] Every commit tagged `[S6-<itemid>]` (e.g., `[S6-A23]`, `[S6-Cleanup-§D1]`, `[S6-AR1-step3]`).
- [ ] Final cross-grep run before push: `grep -rn "<S6-keyword>" /Users/veritypost/Desktop/verity-post/web/src/app/profile /Users/veritypost/Desktop/verity-post/web/src/app/api/auth /Users/veritypost/Desktop/verity-post/web/src/app/api/comments /Users/veritypost/Desktop/verity-post/VerityPost /Users/veritypost/Desktop/verity-post/VerityPostKids` returns zero out-of-domain edits.
- [ ] Update this file inline as items ship: append `**SHIPPED <commit-sha> <date>**` to the item's status line.

### Final verification

- [ ] All items either shipped (with SHA), deferred (with reason + owning session), or blocked (with blocker named). No item silently skipped.
- [ ] Grep audit + status checklist signed off.
- [ ] Final reviewer pass against this file: every checklist item satisfied or explicitly waived with reason.
