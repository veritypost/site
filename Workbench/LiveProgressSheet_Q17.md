# LiveProgressSheet — Q17: Fix import-permissions.js calling non-existent bump_global_perms_version RPC
Started: 2026-04-26

## User Intent
Fix `scripts/import-permissions.js` so that after `--apply` completes, it correctly bumps the global permissions version counter, causing all active web clients to invalidate their permission cache on next poll.

The task originally identified this as "create the missing RPC or wire to the correct existing one." The correct answer is: wire to the existing one — the RPC exists in the DB under a different name (`bump_perms_global_version` vs the script's `bump_global_perms_version`). Additionally the fallback and double-bump logic must be cleaned up.

## Live Code State

### scripts/import-permissions.js — the broken block (lines 303–318)

```js
  // 6. Bump perms_global_version
  await supa.rpc('bump_global_perms_version').catch(async () => {
    // RPC may not exist; fall back to direct UPDATE
    await supa.from('perms_global_version').update({
      version: 999,  // signal
      bumped_at: new Date().toISOString(),
    }).eq('id', 1);
  });
  // Safer direct bump
  const { data: gv } = await supa.from('perms_global_version').select('version').eq('id', 1).single();
  if (gv) {
    await supa.from('perms_global_version').update({
      version: gv.version + 1,
      bumped_at: new Date().toISOString(),
    }).eq('id', 1);
    console.log(`  perms_global_version: ${gv.version} → ${gv.version + 1}`);
  }
```

Three bugs in this block:
1. **Line 304**: Wrong RPC name — `bump_global_perms_version` does not exist. The real RPC is `bump_perms_global_version`.
2. **Lines 305-310**: Fallback sets `version: 999` — a sentinel/signal value, not an increment. Corrupts the version counter if RPC ever fails.
3. **Lines 311-318**: Unconditional second direct-update that runs even when the RPC succeeds — causes a double-bump on every successful `--apply` run.

### DB state (verified via MCP)

- `bump_perms_global_version` EXISTS: `UPDATE perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1`
- `bump_global_perms_version` does NOT exist (the name in the script is wrong)
- `bump_user_perms_version(p_user_id uuid)` EXISTS: bumps per-user `users.perms_version` column — not relevant here
- `my_perms_version()` EXISTS: returns `{ user_version, global_version }` — what clients poll
- `perms_global_version` table has exactly 1 row: `{ id: 1, version: 4533, bumped_at: "2026-04-25 11:31:43..." }`
- `database.ts` line 10442 documents `bump_perms_global_version: { Args: never; Returns: undefined }` — confirms the correct name

### web/src/lib/permissions.js — cache invalidation path (verified)

- Line 59: `my_perms_version()` returns `{ user_version, global_version }`
- Lines 84-86: `refreshIfStale()` compares `v.global_version !== versionState.global_version` — a version bump triggers full cache clear + reload
- A single increment to `perms_global_version.version` via `bump_perms_global_version` is all that's needed to force all clients to reload their permission caches

## Helper Brief

**What "done correctly" looks like:**
1. `scripts/import-permissions.js` lines 303-318 are replaced with a clean block that calls `supa.rpc('bump_perms_global_version')` once
2. No fallback to `version: 999`; if the RPC fails, throw so the caller sees a real error
3. Log the new version by reading `perms_global_version` once after the bump (for the console output)
4. Running `node scripts/import-permissions.js --apply` increments `perms_global_version.version` by exactly 1
5. All web clients polling `my_perms_version()` will detect the bump and invalidate their permission caches

**Risk:** Surgical. Single file, single block, no callers to update, no type changes, no iOS impact. The RPC is already defined and typed in `database.ts`.

**What to watch:** The log line `perms_global_version: X → X+1` is currently produced by the double-bump block. It must be preserved in the replacement — read the version after the RPC call to produce it.

## Contradictions
Intake Agent | scripts/import-permissions.js:304 | RPC name `bump_global_perms_version` to match live DB | Actual DB has `bump_perms_global_version` | Silent failure on every --apply run; double-bump via fallback path makes version inconsistent
Intake Agent | scripts/import-permissions.js:305-310 | Fallback should increment cleanly | Sets version=999 (sentinel/signal) | Corrupts version counter if RPC ever fails
Intake Agent | scripts/import-permissions.js:311-318 | Should run only if RPC fails | Runs unconditionally | Double-bump on every successful --apply

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
[filled only if vote is split]

## Implementation Progress
[filled during execution]

## Completed
SHIPPED 2026-04-26
Commit: ed83cfd6db30a9a4cd2f93c35f6f5f38026a7c71
Files touched: scripts/import-permissions.js (lines 303-318 → 303-307)

Root cause: Wrong RPC name (`bump_global_perms_version`) — the real RPC is `bump_perms_global_version`. Additionally removed a corrupt fallback that set version=999, and an unconditional double-bump block that ran even after a successful RPC call.

Fix: Single correct RPC call (`supa.rpc('bump_perms_global_version')`), throws on error, reads new version for log line. No DB migration needed — RPC already existed.
