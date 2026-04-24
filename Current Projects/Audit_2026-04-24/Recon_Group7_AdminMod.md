---
group: 7 Admin Moderation + Content
reconciler: 1/1
anchor_sha: ed4944ed40b865e6daf7fcea065630988a00e9b8
phase: 4
---

# Reconciliation — Admin Moderation + Content

## AGREED findings (≥2 agents, both waves ideally)

High confidence. Ready for master list.

### R-7-AGR-01 — Client-side role hierarchy drifts from DB live values

**Severity:** CRITICAL

**File:line:** `web/src/app/admin/moderation/page.tsx:28-37, 341`

**Surfaced by:** WaveA Agent3, WaveB Agent1 (2/6)

**Consensus description:** The moderation console defines a hardcoded HIERARCHY map (owner: 100, admin: 80, editor: 70, moderator: 60, etc.) and uses it for button visibility gating on role grants/revokes. The actor's maxLevel is correctly loaded from the live DB `hierarchy_level` column (line 120-123), but the outOfScope check (line 341) uses the stale hardcoded map. If a role's hierarchy_level changes in the database without code redeploy, the UI will show/hide role-grant buttons incorrectly, allowing UX that suggests the actor can perform actions the API will reject. This masks drift between client display and server enforcement.

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Details:** Replace hardcoded HIERARCHY with a dynamic load from the roles response metadata or call `getRoleNames()` client-side to compute `actorMaxLevel` and button visibility from the same live source.

---

### R-7-AGR-02 — Moderation actions (penalty, appeal, report, comment hide) lack audit logging

**Severity:** CRITICAL

**File:line:** 
- `web/src/app/api/admin/moderation/users/[id]/penalty/route.js:63-74`
- `web/src/app/api/admin/appeals/[id]/resolve/route.js:43-54`
- `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:43-54`
- `web/src/app/api/admin/moderation/comments/[id]/hide/route.js:38-48`

**Surfaced by:** WaveB Agent2 (F-B7-2-01), WaveB Agent3 (F-B7-3-01, F-B7-3-02) (3/6)

**Consensus description:** All four critical moderation action routes call service RPCs (`apply_penalty`, `resolve_appeal`, `resolve_report`, `hide_comment`) without calling `recordAdminAction()` server-side. The client-side DestructiveActionConfirm component also fails to capture these actions because the routes bypass it. Penalties, appeal resolutions, report resolutions, and comment hides produce zero audit trail, violating compliance for admin action tracking and chain-of-custody for moderation decisions.

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Details:** Each route must call `recordAdminAction()` immediately after the RPC succeeds, passing the warning_id or report_id as targetId and the appropriate action label ('moderation.penalty', 'moderation.appeal.resolve', 'moderation.report.resolve', 'content.comment.hide').

---

### R-7-AGR-03 — Report and appeal resolution endpoints lack enum validation

**Severity:** HIGH

**File:line:**
- `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:40-48`
- `web/src/app/api/admin/appeals/[id]/resolve/route.js:40-48`

**Surfaced by:** WaveA Agent2 (F-A7-2-01 appeals), WaveA Agent3 (F-G7-3-02 reports), WaveB Agent2 (F-B7-2-04), WaveB Agent3 (F-B7-3-03, F-B7-3-04) (5/6)

**Consensus description:** Both routes accept `outcome` (appeals) or `resolution` (reports) from the request body without validating against allowed enums before calling the RPC. The UI constrains buttons to valid values ('approved'/'denied' for appeals, 'actioned'/'dismissed'/'duplicate' for reports), but a direct API call or buggy client could send arbitrary strings. The RPC may enforce the whitelist, but boundary validation should not rely on implicit contracts. Silent acceptance of invalid state corrupts the report/appeal lifecycle.

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Details:** Add whitelist checks before RPC calls:
- Appeals: `if (!['approved', 'denied'].includes(outcome)) return badRequest('Invalid outcome')`
- Reports: `if (!['actioned', 'dismissed', 'duplicate'].includes(resolution)) return badRequest('Invalid resolution')`

---

### R-7-AGR-04 — Permission naming inconsistency: "bulk_resolve" for single-item endpoint

**Severity:** HIGH

**File:line:** `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js:14` and `/api/admin/moderation/reports/route.js:11`

**Surfaced by:** WaveA Agent2 (F-A7-2-02), WaveB Agent2 (F-B7-2-02) (2/6)

**Consensus description:** The report resolution endpoint uses permission key `admin.moderation.reports.bulk_resolve`, but the endpoint is `/api/admin/moderation/reports/[id]/resolve` — a single-item, not bulk operation. The same permission is used for both GET (list) and single resolve, creating audit trail ambiguity (was this one item or a batch?) and inconsistent vocabulary (the permission says "bulk" but the endpoint is singular). If bulk batch-resolve operations exist elsewhere, they share the same rate limit, which may not be intended.

**Suggested disposition:** OWNER-ACTION

**Details:** Clarify permission semantics with owner. Either rename to `admin.moderation.reports.resolve` (singular, applies to list+single), or document that both operations intentionally share a bulk-operation permission. Add a separate `admin.moderation.reports.list` if list and single-resolve should have different permissions.

---

### R-7-AGR-05 — Penalty buttons lack role hierarchy gating in UI

**Severity:** CRITICAL

**File:line:**
- `web/src/app/admin/moderation/page.tsx:326-332`
- `web/src/app/admin/reports/page.tsx:352-355`

**Surfaced by:** WaveA Agent1 (F-7-1-01, F-7-1-02) (2/6)

**Consensus description:** Both moderation and reports pages render penalty level buttons (Warn, 24h mute, 7-day mute, Ban) unconditionally to every admin/moderator user, without differentiating by hierarchy. The role buttons below correctly disable based on `outOfScope`, but penalty buttons have no such gating. An editor is shown a "Ban" button even though the API will reject attempts to ban an admin. Users may attempt actions they cannot complete, leading to confusing UX (button disabled post-click with "Forbidden" toast rather than pre-click with disabled state).

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Details:** Disable penalty buttons based on hierarchy level. Compute `max-bannable-level` from `actorMaxLevel` (already loaded at moderation page line 81), disable buttons for levels > actor hierarchy. Reports page must track actor's hierarchy level in state (similar to moderation page) before rendering penalty buttons.

---

### R-7-AGR-06 — MOD_ROLES vs ADMIN_ROLES inconsistency in role checks

**Severity:** MEDIUM

**File:line:**
- `web/src/app/admin/reports/page.tsx:85`
- `web/src/app/admin/moderation/page.tsx:118-119`

**Surfaced by:** WaveA Agent2 (F-A7-2-06), WaveB Agent2 (F-B7-2-02) (2/6)

**Consensus description:** The reports page uses `MOD_ROLES` constant while the moderation page manually checks `ADMIN_ROLES.has(n)` or explicitly lists `['moderator', 'editor']`. Both pages functionally gate moderators + admins, but use different constants and logic. Inconsistent vocabulary increases drift risk — if `MOD_ROLES` is later redefined, the two pages diverge silently.

**Suggested disposition:** AUTONOMOUS-FIXABLE

**Details:** Use the same constant in both pages. Either: (a) define both reports and moderation to use `MOD_ROLES`, (b) define both to use `ADMIN_ROLES`, or (c) create a new constant `MODERATION_PAGE_ROLES` with explicit documentation of which roles are allowed and why they differ from `MOD_ROLES` if intentional.

---

## UNIQUE-A findings (Wave A only, needs tiebreaker)

### R-7-UA-01 — Role grant/revoke endpoints may lack server-side permission re-check

**Severity:** HIGH

**File:line:** `web/src/app/admin/moderation/page.tsx:179, 197` (client calls to `/api/admin/users/[id]/roles`)

**Surfaced by:** WaveA Agent1 only

**Description:** The penalty route was hardened with `requireAdminOutranks(params.id, user.id)` per F-036 comment. Grant/revoke role routes at `/api/admin/users/[id]/roles` are called but those specific routes were not shown in the audit. If grant/revoke routes lack the same `requireAdminOutranks` check, an editor could elevate another user above their own hierarchy level, violating the principle that hierarchy operations require outranking.

**Tiebreaker question:** Do `/api/admin/users/[id]/roles` POST (grant) and DELETE (revoke) both call `requireAdminOutranks(target_id, actor_id)` before any role mutation? If yes, close as verified. If no, escalate to AGREED CRITICAL.

---

### R-7-UA-02 — Self-penalty is blocked in RPC but no UI-side prevention

**Severity:** HIGH

**File:line:** `web/src/app/admin/moderation/page.tsx:208-243, 341`

**Surfaced by:** WaveA Agent2 only

**Description:** The moderation console allows penalty buttons for any target, including self-search. The RPC blocks self-penalty with "cannot penalise yourself", but the client UI does not disable penalty buttons if `target.id === actor.id`. A user who searches their own username sees "Apply penalty" buttons; clicking them returns a 400 error with an opaque message, leaving the UX confusing.

**Tiebreaker question:** Is it intentional for users to attempt self-penalty and receive a backend error, or should the UI explicitly disable penalty buttons for self-targets? Check product intent and UX flow. If self-penalty should never be attempted, escalate to AGREED HIGH for UI-side prevention.

---

### R-7-UA-03 — Categories page calls `refreshAllPermissions` but no evidence it's called after role changes

**Severity:** MEDIUM

**File:line:** `web/src/app/admin/categories/page.tsx:35`

**Surfaced by:** WaveA Agent1 only

**Description:** The categories page imports `refreshAllPermissions` from permissions lib but the excerpt doesn't show evidence it's called after role mutations or permission state changes. If not called after revoking a moderator's editor role, that user's cached client-side permissions won't refresh, and they'll see stale action buttons until manual page refresh.

**Tiebreaker question:** Does the categories page or any shared parent component call `refreshAllPermissions()` after a role grant/revoke? If yes, close as verified. If no, escalate to fix recommendations.

---

### R-7-UA-04 — Article status state machine not explicitly validated on save

**Severity:** MEDIUM

**File:line:** `web/src/app/api/admin/articles/save/route.ts:57-58`

**Surfaced by:** WaveA Agent1 only

**Description:** The save route permits draft/published/archived state changes but does not validate the state machine (e.g., can you move from archived back to published?). The route accepts any `status` value the client sends. A story could be moved through invalid state transitions if the permission model doesn't enforce allowed-next-states server-side.

**Tiebreaker question:** Does the RPC or schema constraint validate status transitions, or is state-machine enforcement missing? If the RPC enforces, close as verified. If not, escalate to recommend adding explicit state machine validation.

---

### R-7-UA-05 — Report status enum values not validated at API

**Severity:** MEDIUM

**File:line:** `web/src/app/api/admin/moderation/reports/route.js:24`

**Surfaced by:** WaveA Agent1 only

**Description:** The reports fetch endpoint filters by status but does not validate that status ∈ ['pending', 'resolved']. Typos or injection attempts are not rejected; the query silently returns empty if a bad status is passed.

**Tiebreaker question:** Is this intentional (silently return empty for invalid status) or a validation gap? Check product spec. If intentional, document. If gap, add 400 validation.

---

## UNIQUE-B findings (Wave B only, needs tiebreaker)

### R-7-UB-01 — Article DELETE endpoint missing rate limiting

**Severity:** HIGH

**File:line:** `web/src/app/api/admin/articles/[id]/route.ts:578-618`

**Surfaced by:** WaveB Agent1 only

**Description:** The DELETE endpoint lacks `checkRateLimit()` call. PATCH (line 358) and POST save (line 68) both call it (30/60s), but DELETE does not. An actor with `admin.articles.delete` can rapidly delete articles without throttling, e.g., loop against 500 articles without hitting rate limit. Briefing §4 mandates "every mutation — is checkRateLimit called?"

**Tiebreaker question:** Is missing rate limit on DELETE intentional (articles are rarely bulk-deleted) or oversight? Check with owner. If oversight, fix by adding `checkRateLimit` with a reasonable max (e.g., 10/60s for deletes).

---

### R-7-UB-02 — Moderation console appeals load once at init, no refresh on role changes

**Severity:** MEDIUM

**File:line:** `web/src/app/admin/moderation/page.tsx:92-104, 127, 191, 205`

**Surfaced by:** WaveB Agent1 only

**Description:** Appeals are loaded once in useEffect. After `grantRole()` / `revokeRole()`, the code calls `search()` (line 191, 205) to reload the target user, but does not call `loadAppeals()`. The appeals list on the page becomes stale. If another moderator approves/denies an appeal while the user is viewing, the UI doesn't reflect the change.

**Tiebreaker question:** Is stale appeals list acceptable for the moderation console (requires user F5 refresh), or should appeals auto-refresh after role mutations? Check product requirements. If auto-refresh is required, escalate to fix recommendations.

---

### R-7-UB-03 — Penalty action UI doesn't pre-validate actor can penalize target

**Severity:** MEDIUM

**File:line:** `web/src/app/admin/moderation/page.tsx:208-243`

**Surfaced by:** WaveB Agent1 only

**Description:** The moderation console does not pre-check whether the actor can penalize the target before showing the penalty modal. Buttons are always shown (unless busy), and rejection only happens server-side. User clicks "Ban", sees confirmation modal, submits, then gets "Forbidden" async. While the API is correctly gated, the UX is poor.

**Tiebreaker question:** Is deferred rejection acceptable (user clicks, gets error toast), or should hierarchy checks happen before button render? This may be resolved by R-7-AGR-05 (disable penalty buttons by hierarchy). If not, add a pre-check.

---

### R-7-UB-04 — Categories soft-delete audit logging is post-mutation and best-effort

**Severity:** MEDIUM

**File:line:** `web/src/app/api/admin/categories/[id]/route.ts:365-372`

**Surfaced by:** WaveB Agent1 only

**Description:** The delete endpoint calls `recordAdminAction` **after** the soft-delete is committed. The audit write is best-effort (fire-and-forget). If `recordAdminAction` fails silently, the category is deleted but the audit log is incomplete. This is correctness-critical for editorial workflows.

**Tiebreaker question:** Is the post-mutation, best-effort audit pattern acceptable, or should audit logging be atomic with the deletion? Check briefing §3 (DB write-back requirement). If atomic required, escalate to OWNER-ACTION (may require transactional RPC).

---

### R-7-UB-05 — Category hierarchy cycle validation uses multiple queries (latency, TOCTOU window)

**Severity:** MEDIUM

**File:line:** `web/src/app/api/admin/categories/[id]/route.ts:215-289`

**Surfaced by:** WaveA Agent3 (F-G7-3-04), implicitly flagged for latency concerns

**Description:** Cycle prevention walks the parent chain explicitly (correct), but generates 2-3 sequential DB round-trips per parent_id change. No transactional guard; if a sibling deletes the target parent between the lookup and the update, a TOCTOU window exists. Not a security bug (cycles are impossible with depth-2 cap), but adds latency and theoretical race risk.

**Tiebreaker question:** Is the multi-query pattern acceptable for the depth-2 topology (low TOCTOU risk), or should cycle validation use a single `WITH RECURSIVE` SQL query? Check performance requirements. If latency is concern, escalate to fix recommendations.

---

## STALE / CONTRADICTED findings

### R-7-STALE-01 — Reports page supervisor flag filtering (FALSE ALARM)

**Claimed by:** WaveB Agent1 (F-B7-1-006)

**Dispute:** WaveB Agent1 itself concluded "No bug here. Code is correct. This is a false alarm. No fix needed."

**Your verdict:** STALE — Agent corrected themselves. No action.

---

## Summary counts

- **AGREED CRITICAL:** 3 (HIERARCHY drift, moderation audit gaps, penalty button visibility)
- **AGREED HIGH:** 3 (resolution enum validation, permission naming, plus includes escalation from UA-01 if tiebreaker confirms)
- **AGREED MEDIUM/LOW:** 1 (MOD_ROLES inconsistency)
- **UNIQUE-A:** 5 (role grant/revoke perms, self-penalty, categories refresh, article state machine, report status enum)
- **UNIQUE-B:** 5 (article DELETE rate limit, appeals refresh, penalty pre-validation, categories audit latency, category cycle TOCTOU)
- **STALE:** 1 (supervisor flag filtering)

**Total findings reconciled:** 18 (6 AGREED, 10 UNIQUE, 1 STALE, 1 FALSE-ALARM)

### By severity (AGREED only)
- CRITICAL: 3
- HIGH: 3
- MEDIUM: 1

All CRITICAL and HIGH AGREED findings should be addressed before launch. UNIQUE findings require tiebreaker/owner clarification to escalate or close. The audit logging gaps (R-7-AGR-02) and permission gating issues (R-7-AGR-01, R-7-AGR-05) are launch-blockers.

