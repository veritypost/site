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

(append final status block here)
