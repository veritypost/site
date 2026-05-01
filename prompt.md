# Agent Working Guide

Lessons from real failures in this codebase. Read before touching anything.

---

## The biggest mistake: stopping too early

When something is broken, the default failure mode is fixing the first place you see the problem and calling it done. Don't do that.

**Always trace the full enforcement chain before writing a fix:**
- App route (API layer)
- RPC called by that route (DB function)
- Triggers on tables that RPC writes to

The quiz gate was enforced in both the API route AND the `post_comment` RPC. Fixing the route did nothing. The correct move is to read every layer before shipping any change. If you bypass a gate, you have to bypass it everywhere it exists.

Same logic applies to any validation, permission check, cap, or restriction. Ask: "where else does this get checked?"

---

## How to fix things properly

1. **Read the code first.** Don't guess. Read the route, read the RPC it calls, read the DB functions those RPCs call. This codebase has defense-in-depth by design — multiple enforcement layers are intentional.

2. **Trace callers.** If you're changing behavior, grep for every caller. A fix in one place that breaks a caller elsewhere is worse than not fixing.

3. **Verify the actual DB schema via MCP**, not migration file names or comments. Migrations applied via SQL editor don't update tracking tables. Use `apply_migration` and verify with `information_schema`.

4. **Check DB triggers when inserting/updating.** Triggers fire regardless of which role is doing the write (service_role bypasses RLS but NOT triggers). `enforce_bookmark_cap` fires on every INSERT into bookmarks no matter what.

5. **SECURITY DEFINER RPCs** run as the function owner (postgres), not the calling user. `auth.uid()` and `auth.email()` return null inside them when called via service_role. Use the already-loaded row (e.g. `v_user.email`) for identity checks.

6. **For god-mode / admin bypasses**: check `user.email === 'admin@veritypost.com'` directly from the already-loaded user object. Zero extra DB calls. Don't call `hasPermissionServer('admin.god_mode')` in a hot path unless you thread the same Supabase client instance (otherwise you pay a DB round-trip for every non-admin request).

---

## Supabase MCP

- **Correct project ID: `fyiwulqphgmoqullmrfn`** (from `web/.env.local` URL). Memory has had the wrong one (`bsocntqfpncxekbegmkp`). Always derive from the URL.
- `apply_migration` is for DDL. `execute_sql` is for reads/queries. Both use the same project_id.
- After applying a migration via MCP, save a local copy to `supabase/migrations/` with a timestamped name. Otherwise the local repo drifts from the DB.
- To disable a trigger for one transaction from a SECURITY DEFINER function: `SET LOCAL session_replication_role = 'replica';` — works because the function owner (postgres) is a superuser.

---

## Always push after committing

Vercel deploys from git. A commit that isn't pushed never deploys. Every session ends with `git push`. No exceptions.

---

## The 6-agent ship pattern

For non-trivial changes (anything touching auth, permissions, billing, RBAC, COPPA, quiz gates, DB schema):

1. **Investigator** — reads all affected files, quotes current code, traces the full call chain. Does NOT propose solutions.
2. **Planner** — proposes the specific changes. References what the investigator found.
3. **Big-picture reviewer** — looks for what the planner missed: other callers, regressions, scope creep.
4. **Independent adversary** — tries to break the plan. Looks for security holes, edge cases, things that seem fine but aren't.
5. **Post-impl reviewer 1** — reads the actual diff, not the plan. Verifies the code does what was intended.
6. **Post-impl reviewer 2** — independent second read of the diff. Specifically looks for status transition bugs, missing error handling, and half-finished changes.

The adversary and post-impl reviewers consistently find real problems. Don't skip them to go faster.

For quick fixes (one-line changes, obvious typos, copy edits): skip the full pattern, but still read the full file before touching it.

---

## What "investigate first" means in practice

The investigator agent's job is to **quote actual current code**, not summarize it. If the investigator says "the quiz check is at line 111 in the route," the planner should be able to read that quote and know exactly what to change. Vague summaries like "there's a quiz gate in the API" are useless.

Before any implementation:
- Read the specific file, the specific lines
- Grep for all other places the thing being changed is referenced
- Check if the change has a DB equivalent (route logic often mirrors an RPC)

---

## Common traps in this codebase

**Status transitions** — the PATCH route for articles only allows: `draft→published`, `draft→archived`, `published→archived`, `archived→draft`. The UI buttons must match exactly. "Unpublish" sends `archived`, not `draft`. Get this wrong and you get 400s that are hard to debug.

**FK join hints** — selects like `stories!articles_story_id_fkey(slug)` must match the `foreignKeyName` in `database.ts`. The schema uses `fk_` prefix. Wrong hint = silent empty result, not an error.

**`.next/` TS errors** — stale cache from deleted pages. Not real errors. Clear on next build.

**`createClient()` vs `createServiceClient()`** — user client respects RLS. Service client bypasses RLS but NOT triggers. Use service client for all server-side writes. Use user client when you need RLS to enforce ownership.

**Optimistic updates in admin tables** — don't re-fetch after a mutation (resets cursor position, breaks pagination). Update local React state directly.

**`requirePermission` vs `requireAuth`** — `requirePermission` does the DB permission check and returns the user. `requireAuth` just checks that someone is logged in. Both return user objects with `.email`. For the owner email (`admin@veritypost.com`), `requirePermission` returns immediately without a DB call (email allowlist short-circuit).

---

## When "it doesn't work"

Before writing any code:
1. What is the exact error? (message, status code, which layer returned it)
2. Is it the app layer or the DB? (check Vercel logs vs Supabase logs)
3. Trace backwards from the error to find every place that check exists
4. Fix all of them, not just the first one

The pattern "I fixed it but it still doesn't work" almost always means there was a second enforcement point you didn't find.

---

## iOS / web platform rule

Every fix must cover web + iOS + kids iOS, or explicitly state "not applicable" for each. A fix that only touches the web route but leaves the iOS endpoint broken is incomplete. Check for parallel iOS API routes when patching user-facing features.
