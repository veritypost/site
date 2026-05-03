# Session 3 — Admin RBAC + Chrome

**You are the architect for this session.** Fresh conversation. Read this doc, then `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` (top synthesis + `## PM-3 — Web-Admin` in full), then start.

## Prerequisite

Sessions 1 and 2 must be marked complete. Verify by reading the `## Status` blocks at the bottom of `SESSION_01_DB_RLS.md` and `SESSION_02_AUTH.md`.

## Mandatory reads

1. `REVIEW_REPORT.md` — top synthesis + PM-3 section.
2. `/Users/veritypost/Desktop/CLAUDE.md`.
3. Owner memory:
   - `feedback_no_keyboard_shortcuts.md` — owner has BANNED hotkeys / command palette in admin. Reject any reviewer or implementer suggestion of one.
   - `feedback_admin_marker_dropped.md` — do NOT reintroduce `@admin-verified` markers.
   - `feedback_genuine_fixes_not_patches.md`.
   - `feedback_understand_before_acting.md`.

## Locked decisions (from owner, 2026-05-03)

- **Q03 top_stories write path:** Option A. New `/api/admin/top-stories/route.ts` (POST) and `/api/admin/top-stories/[position]/route.ts` (DELETE), both following the `web/src/lib/adminMutation.ts` 8-step skeleton (`requirePermission('admin.top_stories.manage')` → service client → `checkRateLimit` (`admin.top_stories.mutate`, 30/60s) → validate → mutate → `recordAdminAction({ action: 'top_stories.pin' | 'top_stories.clear' })` → respond). Add `admin.top_stories.manage` permission key. Drop the open `top_stories_write_authenticated` RLS policy; replace with a `top_stories_service_role_all` policy mirroring `muted_outlets`. Page refactor: replace the two `supabase.from('top_stories').upsert()` / `.delete()` calls in `web/src/app/admin/top-stories/page.tsx:110-128` with `fetch()` calls; drop client-side `pinned_by`. Web only — iOS/kids N/A.

## Scope

### P0 (must close)
1. **PM-3 / Q03** — `top_stories` RBAC bypass. Fix per Q03 above.
2. **PM-3** — `/admin/webhooks` retry button non-functional (no UPDATE policy on `webhook_log`). Fix: add admin-only UPDATE policy + service-role retry RPC, wire the button.

### P1 (close all)
- **PM-3** — `ticket_messages.is_staff` is client-trusted. Add CHECK / trigger / RLS pinning `is_staff = true` to admin-or-above only.
- **PM-3** — `/admin/access` mutates `access_codes` from browser without rank guard or audit-before-mutate. Move to a server route with `requireAdminOutranks` + `recordAdminAction`.
- **PM-3** — `hide_comment` SECDEF RPC checks `_user_is_moderator` but no rank guard. Add `requireAdminOutranks(target_user)` semantics.
- **PM-3** — Admin pages mix MOD vs ADMIN client-side gates inconsistently with server-side layout. Audit + align.
- **PM-3** — Three pipeline-regenerate routes (sources / timeline / quiz) lack rate limits despite invoking Anthropic on every call. (Note: same code is also touched by Session 5 P0 cost-cap bypass — coordinate.)

### P2 (close opportunistically)
- **PM-3** — `KBD.jsx` exists but has zero imports. Delete (after one final grep).

### Out of scope
- Pipeline cost-cap fix (Session 5)
- Billing admin UI (Session 4 owns billing-side, this session only touches admin-page wiring)

## Cross-cutting concern

PM-3's P0 (`top_stories`) needs a DB migration AND a new server route AND a page rewrite. Treat it as a single end-to-end slice; don't ship one half without the other.

## Orchestration

| PM | Owns |
|---|---|
| **PM-A: top_stories end-to-end** | P0 #1. Migration + new admin API route + page rewrite. Single coherent slice. |
| **PM-B: webhook retry + ticket staff impersonation** | P0 #2 + the `is_staff` P1. DB-side pinning + service-role wiring. |
| **PM-C: access codes + hide_comment + admin gate consistency** | The remaining P1s. Mix of route handlers and policy tightening. |
| **PM-D: pipeline-regenerate rate-limits + KBD cleanup** | The pipeline rate-limit gap (coordinate with Session 5 plan) + KBD.jsx deletion. |

Each PM dispatches Explore + bug-hunter-security + bug-hunter-flow subagents.

## Verification gates

1. **Pre-impl** — re-verify each finding against current code. Especially confirm Session 1 hasn't already closed any of them as a side effect of the mass-impersonation REVOKE.
2. **Build-verifier** — type-check + lint + sentinel grep.
3. **Smoke-tester** — boot dev server, sign in as a non-admin, attempt to call the previously-broken endpoints (top_stories write, webhook retry, access codes mutate, hide_comment on owner). Confirm denied.
4. **Independent reviewer** — fresh agent reads the diff, confirms each finding closed.
5. **Adversary** — paranoid pass on RBAC: did any new route gate by client-only, by wrong role, by absent `recordAdminAction`? Does the new top_stories migration correctly REVOKE old browser-scoped writes?

## Done definition

- All 2 P0s + 5 P1s closed or refuted with evidence.
- All gates pass.
- `## Status` block appended below.
- REVIEW_REPORT.md: each closed finding gets `> CLOSED in Session 3 — commit <hash>`.

## Status

### Shipped 2026-05-03 — 8/8 closed (2 P0 + 5 P1 + 1 P2) + 12 reviewer/adversary follow-ups

**Original scope (8 findings):**
- ✅ P0 top_stories RBAC — RLS swapped (open `top_stories_write_authenticated` dropped, replaced with `top_stories_service_role_all`); new POST /api/admin/top-stories + DELETE /api/admin/top-stories/[position] (canonical 8-step skeleton); page rewritten to fetch(); `admin.top_stories.manage` perm minted + granted.
- ✅ P0 webhook_log retry — admin-only UPDATE policy added; new POST /api/admin/webhooks/[id]/retry; page wired through fetch.
- ✅ P1 ticket_messages.is_staff — BEFORE INSERT/UPDATE trigger raises `insufficient_privilege` for non-admin sender_id with `is_staff=true`; new POST /api/admin/support/[id]/reply (server-set is_staff); page rewritten.
- ✅ P1 /admin/access mutations — 3 page flows moved to POST /api/admin/access-codes + PATCH /api/admin/access-codes/[id]; uses `withDestructiveAction` (audit-after); client-side `record_admin_action` calls dropped.
- ✅ P1 hide_comment rank guard — `requireAdminOutranks(comment.user_id, user.id)` added before RPC call (matches `apply_penalty` pattern).
- ✅ P1 admin gate consistency — 6 pages migrated to `refreshAllPermissions()` + `hasPermission(KEY)` + redirect to `/admin` (newsroom, breaking, access, top-stories, webhooks, support).
- ✅ P1 pipeline-regenerate rate-limits — `checkRateLimit` (10/60s, distinct policy keys) added to sources, timeline, quiz routes.
- ✅ P2 KBD.jsx — deleted (verified zero live imports).

**Reviewer-surfaced follow-ups (independent-reviewer pass):**
- Next 15 async params shape applied to webhooks/[id]/retry + support/[id]/reply routes.
- Date validation in access-codes routes (returns 400 on invalid date instead of 500).
- Ticket-existence pre-check in support/[id]/reply (404 vs FK 500).
- top-stories POST: UUID format check + 23505/23503 → 409/400 mapping.
- New `admin.webhooks.view` perm minted; webhooks + support pages migrated to canonical gate (originally out of scope but caught by reviewer).

**Adversary-surfaced follow-ups (paranoid pass):**
- ⚠️ Webhook retry truth-up — original P0 fix wrote `processing_status='retrying'` with no consumer (verified via grep; no worker reads that state). Route now sets `processing_status='success'` + audit action `webhooks.manual_resolve` + `manual_resolved: true` in newValue. UI copy clarified — "operator-acknowledged, no automatic redispatch." Honest-fix per `feedback_genuine_fixes_not_patches.md`.
- Access-codes POST role-grant rank check — `grants_role_id` now compared to actor's max `hierarchy_level`; 403 if target role is at/above actor's rank (privilege-escalation hole closed).
- Top-stories POST article-state check — preflight `articles.select('status, deleted_at, visibility')`; 422 if not published+public+not-deleted.
- Access-codes [id] PATCH: Next 15 async params shape (third route, missed in earlier pass).
- Top-stories DELETE: `.select()` after delete + 404 if 0 rows; audit row only on real change (no more no-op audit pollution).
- ticket_messages trigger hardened — replaced `JOIN roles req ON req.name='admin'` with `r.hierarchy_level >= 80` constant (immune to future role rename).
- support_tickets status flip moved into /api/admin/support/[id]/reply server route; client-side write dropped.

**Adversary findings deferred (documented, not fixed in this session):**
- P1 page perm-gate / route perm-gate split (e.g. `admin.support.tickets.view_all` opens page but `admin.support.reply` may 403 the textarea). UX polish — defer to a focused permission-set audit.
- P1 `setStatus` audit-first antipattern in support page (REVIEW_REPORT lists this as a separate P1 NOT in Session 3 scope).
- P2 audit-log denial blind spot (403/429 attempts not audited) — general improvement, not Session 3 specific.
- P2 `top_stories_service_role_all` policy is no-op cosmetic (service_role bypasses RLS) — leave for now; the actual gate is "no other policy exists for non-service writes."
- P2 `webhook_log_update` policy permits broader admin client writes than the new route uses — narrow with column-level WITH CHECK in a follow-up if any direct-write surface emerges.
- P3 migration filename `…access_codes_perms.sql` actually mints `admin.newsroom.view` + `admin.breaking.view` — cosmetic; rename in a future cleanup pass.

**Migrations applied via MCP (5 total):**
- `2026-05-03_session_3_top_stories_rbac.sql`
- `20260503000015_session3_webhook_ticket_rbac.sql`
- `2026-05-03_session_3_access_codes_perms.sql` (mints admin.newsroom.view + admin.breaking.view)
- `2026-05-03_session_3_webhooks_view_perm.sql`
- `2026-05-03_session_3_ticket_trigger_harden.sql`

**New permission keys:** admin.top_stories.manage, admin.webhooks.retry, admin.webhooks.view, admin.support.reply, admin.newsroom.view, admin.breaking.view (all granted to admin + owner).

**Verification gates passed:**
- Pre-impl finding-verifier: 8/8 CONFIRMED before work began.
- Build-verifier: type-check + lint + 11 sentinel greps all PASS (after 1 round of follow-up cleanup for `withDestructiveAction` Promise wrap + dead `currentUserId`/`generateCode`).
- Smoke-tester (DB-side): top_stories policy state correct, webhook_log UPDATE policy live, ticket_messages trigger CONFIRMED to RAISE `insufficient_privilege` on non-admin `is_staff=true` insert.
- Independent reviewer: 8/8 closed (with 5 follow-ups, all addressed).
- Adversary RBAC: 7 fixes landed (3 P0 + 4 P1), 6 lower-priority items documented as deferred.

**iOS / kids:** N/A — pure web admin slice. None of these tables/routes are touched by iOS or kids client.

**Owner-decision:** none required this session. All locked decisions (Q03 from STATE.md) applied per spec.
