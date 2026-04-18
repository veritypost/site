# Migration Status — Permission-System Rebuild

**Source of truth:** `/Users/veritypost/Desktop/verity post/permissions.xlsx`
**Target:** Supabase project `fyiwulqphgmoqullmrfn` (VP Project)
**Started:** 2026-04-18
**Last updated:** 2026-04-18 (before Phase 1 kickoff)

---

## Current state

- Local repo: `/Users/veritypost/Desktop/verity-post` — git init'd, pushed to `github.com/veritypost/site.git`
- Vercel auto-deploy: **OFF** (Ignored Build Step = skip all)
- Local dev server: running on `localhost:3000`
- Supabase CLI: installed (2.90.0), logged in, linked to VP Project
- Test accounts: seeded (17 role accounts + 30 community users + 2 kid profiles)
- Permission xlsx: 916 permissions + 10 permission sets, last edited 2026-04-18

## Where we're going

Replace the current mixed-model (role-hierarchy gates + some permission-set plumbing) with a single clean permission-driven system:

- Admin toggles a permission for a user
- User's next navigation refreshes capabilities
- Feature shows/hides accordingly
- Zero hardcoded role checks in new/migrated code

## The 5 phases

| # | Phase | Status | Duration | Notes |
|---|---|---|---|---|
| 0 | Matrix cleanup (xlsx finalized) | **DONE** | — | 916 perms, 10 sets |
| 1 | Import xlsx → Supabase DB | **DONE** | 2–4 hrs | Replaces old 81 perms + 11 sets |
| 2 | Build user-centric admin page (/admin/users/:id/permissions) | NOT STARTED | 2–3 days | Search user → toggle perms |
| 3 | Pilot feature migration (expert_queue) | NOT STARTED | 1–2 hrs | First feature proves the model |
| 4 | Strangler migration of remaining gates | NOT STARTED | Weeks | One feature at a time as you touch them |
| 5 | Cleanup (delete role hierarchy, dead code) | NOT STARTED | Later | Only after Phase 4 ~complete |

---

## Phase 1 — step by step

### 1a — Backup current permission tables to JSON
**Status:** DONE (2026-04-18 11:39)

Wrote to `test-data/backup-2026-04-18/`:
- permissions.json (81 rows)
- permission_sets.json (11 rows)
- permission_set_perms.json (79 rows)
- role_permission_sets.json (62 rows)
- plan_permission_sets.json (22 rows)
- user_permission_sets.json (0 rows)
- permission_scope_overrides.json (0 rows)
- perms_global_version.json (1 row)

**Side note flagged during 1a:** `site/.env.local` had been pointing at the wrong Supabase project (VP2, which is empty). Swapped back to VP Project (fyiwulqphgmoqullmrfn) before backup ran. Dev server restarted to pick up new env.

### 1b — Write import script (with --dry-run)
**Status:** DONE — `scripts/import-permissions.js`

### 1c — Dry-run
**Status:** DONE — diff matched expectations.

### 1d — Execute import
**Status:** DONE (2026-04-18 11:44)
- 916 active permissions (71 old soft-deactivated)
- 10 active sets (11 old soft-deactivated)
- 2,493 set-perm links
- 53 role→set links
- 21 plan→set links
- perms_global_version bumped to 3751

### 1e — Verify in admin UI
**Status:** NOT STARTED

Open `http://localhost:3000/admin/permissions`. Expect to see new 916 keys + 10 sets in the existing 5-tab UI.

### 1f — Checkpoint commit
**Status:** NOT STARTED

`git commit -m "phase 1: import permission matrix to DB"`

---

## Phase 2 — outline (for when we get there)

- SQL function `compute_effective_perms(user_id)` — joins role+plan+direct grants + overrides
- New page at `/admin/users/[id]/permissions` with search + toggle grid
- `POST /api/admin/users/:id/permissions` endpoint with `users.perms_version` bump
- Audit log on every write

## Phase 3 — outline

- Pilot feature: `expert_queue.view`
- Swap `requireRole` → `requirePermission('expert_queue.view')` across web + iOS + API
- Test live toggle flow end-to-end

---

## Decisions / open questions

- **Anon + unverified permission set columns:** seeded partially (82 rows marked anon). Owner to refine manually before Phase 1. Current plan: import what's in the xlsx verbatim; owner can adjust post-import via admin UI once Phase 2 is built.
- **Minimum access baseline:** using Pattern A (anon is just the rows marked anon; no separate "base" set).
- **Rows in xlsx marked N/A / not yet implemented (~50):** import them anyway as `is_active=false` so they appear in admin UI but don't gate anything.

## Rollback procedure

If Phase 1 breaks something:
1. Stop — do not run any further scripts.
2. Run `node scripts/restore-permissions.js test-data/backup-2026-04-18/` (to be written alongside import script).
3. Manually bump `perms_global_version` via MCP so clients re-fetch.
4. Restart dev server.

## Log of actual events

_Entries added as we go. Newest on top._

- 2026-04-18 11:44: Phase 1d complete — import applied. DB now holds the new 916 perms + 10 sets.
- 2026-04-18 11:44: perms_global_version bumped 12 → 3751 (existing counter had been bumped many times in past; +1 sends signal to clients).
- 2026-04-18 11:40: dev server restarted on VP Project env. `/api/health` green.
- 2026-04-18 11:39: Phase 1a complete — 256 rows backed up across 8 tables to `test-data/backup-2026-04-18/`.
- 2026-04-18 11:35: Discovered `.env.local` was pointing at empty VP2 project (user intent: stay on VP Project). Swapped URL + anon key + service role back to VP Project.
- 2026-04-18 11:26: Supabase CLI 2.90.0 installed, logged in, linked to VP Project.
- 2026-04-18 (start of session): status doc created, about to begin Phase 1a (backup).
