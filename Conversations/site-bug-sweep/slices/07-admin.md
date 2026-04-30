# Slice 07 — Admin surfaces

**Status:** shipped
**Session:** 11 (2026-04-30)
**Adversarial review:** complete — all 9 issues confirmed

---

## Issues

### 07-00 — CRITICAL: PATCH /api/admin/articles/[id] uses service client before auth check

**File:** `web/src/app/api/admin/articles/[id]/route.ts`
**Lines:** 313–314 (service client created + used), 330–335 (requirePermission called after)
**Status:** shipped — `cadf577`

**Root cause.** The PATCH handler creates `createServiceClient()` at line 313 and immediately calls `fetchArticleWithAudience(service, id)` at line 314 to determine article audience (needed to resolve which permission key to check). `requirePermission()` is only called at lines 330–335, after the service client read. An unauthenticated or low-privilege request can trigger an RLS-bypassing DB read before being rejected.

**Fix.** Extract `createClient()` before line 313 and call `requireAuth()` on it first. Reuse that same client for the `requirePermission()` loop at lines 330–335 (replacing the locally-scoped `createClient()` call there). The article fetch continues to happen before the per-permission check (order is correct — you need article metadata to determine which permission keys are required), but unauthenticated callers are rejected before the service client is used.

- Add `requireAuth` to import at line 36: `import { requirePermission, requireAuth } from '@/lib/auth'`
- Before line 310 (comment block), insert: extract `cookieClient = createClient()`, then `await requireAuth(cookieClient)` in try/catch returning `permissionError(err)`
- At lines 329–335: replace locally-scoped `const supabase = createClient()` with `cookieClient`

---

### 07-01 — P1: Penalty buttons in reports page double-fire during in-flight request

**File:** `web/src/app/admin/reports/page.tsx`
**Lines:** 596–599
**Status:** shipped — `71f2640`

**Root cause.** `penaltyLevel()` sets `setBusy('penalty')` at line 322 but the four penalty buttons (`Warn author`, `24h mute`, `7-day mute`, `Ban`) only check `disabled={cannotPenalise}` — the hierarchy guard — not the in-flight busy state. An admin can click while a penalty request is in-flight and queue a second one.

**Fix.** Change each button's `disabled` prop from `disabled={cannotPenalise}` to `disabled={cannotPenalise || busy === 'penalty'}`.

---

### 07-02 — P2: Appeals entry-point buttons unguarded in moderation page

**File:** `web/src/app/admin/moderation/page.tsx`
**Lines:** 534, 537
**Status:** shipped — `5bb496b`

**Root cause.** The Approve (line 534) and Deny (line 537) buttons open the appeal modal but have no `disabled` prop. The confirmation buttons inside the modal correctly have `disabled={busy.startsWith('app:')}`, but the entry points are completely unguarded — an admin can open multiple modal instances by clicking rapidly before the first resolves.

**Fix.** Add `disabled={busy.startsWith('app:')}` to both buttons (Approve line 534, Deny line 537).

---

### 07-03 — P2: Role hierarchy load never checks errors in moderation page init

**File:** `web/src/app/admin/moderation/page.tsx`
**Lines:** 143–166
**Status:** shipped — `5bb496b`

**Root cause.** `Promise.all([actorRolesRes, allRolesRes])` at line 143 fetches the actor's roles and the full roles table. Neither `actorRolesRes.error` nor `allRolesRes.error` is checked (lines 152, 162 use `.data || []`). If either fetch fails, the page proceeds silently — the actor's hierarchy level defaults to 0 and `levelsMap` stays empty, falling through to `HIERARCHY_FALLBACK` with no operator notification.

**Fix.** After the `Promise.all` assignment, add `console.error` guards for each `.error` field (client-side logging; the existing fallback behavior is safe so no early return needed).

---

### 07-04 — P2: Three queries discard error in reports page

**File:** `web/src/app/admin/reports/page.tsx`
**Lines:** 174, 208, 226
**Status:** shipped — `71f2640`

**Root cause.** Three functions destructure only `data` from Supabase responses, silently showing empty state on failure:
- `loadModerationHistory()` line 174 — history panel stays empty with no feedback
- `selectAiFlagged()` line 208 — comment body stays null with no feedback
- `selectReport()` line 226 — comment body stays null with no feedback

**Fix.** Destructure `error` alongside `data` in all three calls. Add `console.error(...)` on error. `loadModerationHistory` should also add an early return when error is set (the `if (!data)` check at line 179 already clears history, which is fine as a fallback, but the early return prevents the moderator username lookup from running on a failed query).

---

### 07-05 — P2: Three action buttons lack loading state in users admin

**File:** `web/src/app/admin/users/page.tsx`
**Lines:** 300–345 (handlers), 760, 778, 796 (buttons)
**Status:** shipped — `5f2a5bc`

**Root cause.** `handleMarkRead`, `handleMarkQuiz`, and `handleAwardAchievement` have no in-flight state. The buttons at lines 760, 778, 796 have no `loading` or `disabled` prop tied to the request. Rapid clicks can fire multiple concurrent requests.

**Fix.** Add three state variables (`markReadBusy`, `markQuizBusy`, `awardBusy`) to `UsersAdmin`. Wrap each handler in try/finally setting/clearing the relevant state. Pass as additional props to `UserDetail`. Update `UserDetail` props type. Apply `loading`/`disabled` to each button.

---

### 07-06 — P2: search() discards role and warning fetch errors in moderation page

**File:** `web/src/app/admin/moderation/page.tsx`
**Lines:** 209–246
**Status:** shipped — `5bb496b`

**Root cause.** `search()` fetches `rolesRes` and `warningsRes` in `Promise.all` at line 209. Neither `.error` field is checked (lines 222, 246 use `.data || []`). If either fails, the user detail panel shows empty roles and empty warnings with no feedback to the operator.

**Fix.** After the `Promise.all` assignment, add `console.error` guards for each `.error` field.

---

### 07-07 — P2: quiz-regenerate rejects on any verification disagreement instead of applying fixes

**File:** `web/src/app/api/admin/pipeline/quiz-regenerate/route.ts`
**Lines:** 247–256
**Status:** shipped — `5a4669c`

**Root cause.** Lines 249–255: if `verifyParsed.fixes.length > 0`, the route returns 422 and discards all the generated quiz content. This means a single mis-keyed `correct_index` identified by the verification step causes the entire regeneration to fail and the admin must retry manually. The verification step exists to fix mistakes, not to block saves.

**Fix.** Replace the rejection block with an apply-fixes loop: iterate through `verifyParsed.fixes`, check `fix.question_index` bounds against `quizQuestions.length`, and update `quizQuestions[fix.question_index].correct_index = fix.correct_answer`. Then fall through to the insert (lines 262+) with the corrected data.

---

### 07-08 — P2: grantRole/revokeRole re-enable buttons before search() completes

**File:** `web/src/app/admin/moderation/page.tsx`
**Lines:** 249–278
**Status:** shipped — `5bb496b`

**Root cause.** In both `grantRole` (line 257) and `revokeRole` (line 271), `setBusy('')` is called before the subsequent `search()` call (which is fire-and-forget, not awaited). This means the role grant/revoke buttons re-enable the moment the fetch completes, before the user list has refreshed. An admin can click again during the `search()` call and trigger a double-grant/double-revoke.

**Fix.** In both functions: remove the `setBusy('')` call before `search()`. Instead, `await search()` and then call `setBusy('')` after it completes. Also move the error-path `setBusy('')` to before the `return` in the `!res.ok` branch (currently there is none — `setBusy('')` runs before the error check, so on error the state is already cleared; the fix needs to keep the state set on the error path until the function returns).

---

## Clean surfaces (no bugs found)

- `admin/layout.tsx` — auth + role check correct; `createClient()` (not service client); `notFound()` for non-staff; `MOD_ROLES.has()` gate
- `admin/newsroom/page.tsx` — all fetches handle errors, all action buttons properly gated with `busyIngest` / `busy` state
- `admin/pipeline/` (all sub-pages: settings, cleanup, costs, runs, runs/[id]) — all action buttons properly gated; no FK hints
- `admin/users/page.tsx` — all modal/dialog-gated actions (ban, delete, role, plan) properly disabled; FK hint `fk_user_roles_user_id` correct
- `api/admin/articles/[id]/route.ts` GET handler — permission check before service client (correct order)
- `api/admin/articles/save/route.ts`, `list/route.ts`, `new-draft/route.ts` — all permission-before-service-client
- `api/admin/users/[id]/route.ts` DELETE + PATCH — permission-before-service-client
- `api/admin/users/[id]/ban/route.js` — permission-before-service-client
- `api/admin/moderation/reports/route.js` — permission-before-service-client
- `api/admin/newsroom/clusters/list/route.ts` — permission-before-service-client
- `api/admin/pipeline/generate/route.ts` — permission-before-service-client
- `api/admin/categories/route.ts` — permission-before-service-client
- `api/admin/settings/route.js` — permission-before-service-client
- FK hints in `reports/page.tsx` (`users!fk_comments_user_id` lines 210, 228) — correct per `database.ts`
- FK hints in `moderation/page.tsx` (`fk_user_roles_role_id`, `fk_user_warnings_user_id`) — correct per `database.ts`
- FK hint in `users/page.tsx` (`user_roles!fk_user_roles_user_id` line 161) — correct per `database.ts`
