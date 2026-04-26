# W2-10: Schema ↔ Code Coherence + API Canonical-Pattern Compliance

## Q1+Q2: Migrations 092/093/100 missing on disk — CONFIRMED + WORSE THAN Z11 SAID

- `ls schema/092*` `schema/093*` `schema/100*` all return **no matches**.
- `grep -rln "require_outranks\|caller_can_assign_role" schema/` returns **NOTHING**. The two most security-critical admin RPCs have **zero on-disk source**.
- They DO exist in `pg_proc` (verified W2-01 Q3): `require_outranks(target_user_id uuid)` + `caller_can_assign_role(p_role_name text)`.
- CLAUDE.md mentions `100_backfill_admin_rank_rpcs_*.sql` as a "backfill of live RPCs, not a real migration" — but that file does not exist in `schema/`. Z11 noted CLAUDE.md says it does; both Z11 and CLAUDE.md were wrong on its presence.
- **Impact:** if anyone needs to redeploy from scratch, the admin authorization layer is missing. `reset_and_rebuild_v2.sql` (per Z11) reflects state through ~migration 091; it would not include these two.

**Recommended action:** dump both RPC bodies from `pg_proc.prosrc`, write `schema/178_recreate_admin_rank_rpcs.sql` with the actual definitions.

## Q3: Migration 170 `occurred_at` vs `created_at` — CONFIRMED RUNTIME BUG

- Live `rate_limit_events` columns (verified): `id, rule_id, user_id, ip_address, endpoint, action, request_count, window_start, user_agent, metadata, created_at, key`. No `occurred_at`.
- Live function body of `cleanup_rate_limit_events` (verified):
  ```
  DELETE FROM rate_limit_events WHERE occurred_at < now() - make_interval(days => p_retention_days)
  ```
- **This RPC will throw `column "occurred_at" does not exist` at every invocation. The cleanup never runs. `rate_limit_events` grows unbounded.**
- Severity: **production runtime bug**. If pg_cron schedules this nightly, every run errors out silently.
- **Fix:** rewrite `cleanup_rate_limit_events` to use `created_at`. Single-routine migration.

## Q4: superadmin dead refs — 8 routines, not 5

(Already documented in W2-01 Q7.) `_user_is_moderator`, `approve_expert_answer`, `approve_expert_application`, `expert_can_see_back_channel`, `grant_role`, `mark_probation_complete`, `reject_expert_application`, `revoke_role`. All need `superadmin` removed from their role-name allowlists.

## Q5: 109/111 self-supersede

Per Z11. `verity_score_events` ledger created in 109, rolled back in 111. Spot-check via `mcp__supabase__list_tables` could confirm whether `verity_score_events` table currently exists. **Deferred to Wave 3** — not blocking.

## Q6: 127 rollback DELETE perm-key bug — CONFIRMED

- Forward 126 INSERTs perm keys (with dots): `admin.pipeline.clusters.manage`, `admin.pipeline.presets.manage`, `admin.pipeline.categories.manage`
- Rollback 127 DELETEs perm keys (legacy underscore form): `pipeline.manage_clusters`, `pipeline.manage_presets`, `pipeline.manage_categories`
- **Result:** if anyone runs 127 rollback, it does NOT delete the rows it should. The forward keys remain in `permissions` table indefinitely.
- **Severity:** harmless if rollback never runs, but a footgun if it does. Worse: anyone reading 127 might think it's a clean reverse.
- **Fix:** edit 127 to use the actual forward keys. (Editing applied migration files is risky — better to write 178 / 179 with corrected DELETE.)

## Q7: 177 partial GRANT — DEFERRED to Wave 3

Z11 said 177 only granted SELECT on 4 of ~10 F7-era tables. Need full F7 table list to verify which were missed. Wave 3 should enumerate via `mcp__supabase__list_tables` for tables named `articles*`, `pipeline*`, `ingest*`, `clusters`, `presets`, etc.

## Q8: `record_admin_action` audit gap — CONFIRMED real

- RPC signature (verified): `record_admin_action(p_action text, p_target_table text, p_target_id uuid, p_reason text, p_old_value jsonb, p_new_value jsonb, p_ip inet, p_user_agent text)`.
- Z15 listed missing-call sites: sponsor/ad-campaign/ad-placement/ad-unit CRUD, recap admin CRUD, expert applications approve/reject, moderation/comments unhide, broadcasts/breaking, push/send, expert/answers approve.
- Z12 said `adminMutation.ts:84-88` is the canonical helper but documents a **FOLLOW-UP gap**: it does NOT pass `p_ip` / `p_user_agent` to the RPC.
- **Recommended fix:** patch `adminMutation.ts` to extract headers and pass them; update missing-caller routes to use the helper instead of writing direct supabase mutations.

## Q9: /api/ai/generate orphan claim — Z15 WAS WRONG. Both endpoints are LIVE.

- `grep -rn "ai/generate"` shows **two callers** in `web/src/app/admin/`:
  - `admin/kids-story-manager/page.tsx:604,618,632` — POSTs `{ storyId, type: 'kids_story'|'timeline'|'simplify' }`
  - `admin/story-manager/page.tsx:756,776` — POSTs to same endpoint
- F7 `/api/admin/pipeline/generate` is the new path used by `admin/newsroom` + `admin/articles/[id]`.
- **Real situation:** legacy admin (story-manager + kids-story-manager) is parallel to F7 newsroom flow. Z14 already flagged story-manager (1229 lines) ↔ articles/[id]/{review,edit} duplication. **The orphan finding was wrong**; the real fix is converging the two admin surfaces, not deleting `/api/ai/generate`.

## Q10: /api/comments/[id]/report ↔ /api/reports duplicate — Both live, different perms

Diff:
- `/api/reports` — generic, takes body `{targetType, targetId, reason, description}`, perm `article.report`, **rate-limit 10/hr**, calls `getSettings`.
- `/api/comments/[id]/report` — comment-specific, hardcodes `target_type='comment'`, perm `comments.report`, **NO rate limit** (BUG), uses `v2LiveGuard`, `createServiceClient`.

Both INSERT into the same `reports` table. They aren't truly redundant because of different perms, but the comments variant lacks rate limiting — a real gap. **Fix:** add `checkRateLimit({key: 'comments-report:'+user.id, max:10, windowSec:3600})` to `/api/comments/[id]/report`.

Also: both files have `@migrated-to-permissions` (228 active project-wide) AND `@feature-verified` (236 active project-wide) markers at the top. CLAUDE.md retired `@admin-verified`; status of `@feature-verified` and `@migrated-to-permissions` is unclear. Wave 3 should resolve.

## Q11: adminMutation.ts:84-88 missing p_ip/p_user_agent — CONFIRMED IN Q8

(See Q8.)

## Q12: F7 tables RLS state — DEFERRED to Wave 3

Need pg_policies enumeration. Quick win for Wave 3.

## Confirmed duplicates
- `/api/ai/generate` + `/api/admin/pipeline/generate` (both live, parallel admin surfaces — Q9)
- `/api/reports` + `/api/comments/[id]/report` (both live, different perms — Q10)

## Confirmed stale
- Z15's "/api/ai/generate is orphan" — both still wired
- Z11's "~5 superadmin RPCs" — actually 8

## Confirmed conflicts (real bugs)
- **Migration 170: `cleanup_rate_limit_events` references nonexistent `occurred_at` column** — runtime bug, RPC always errors, cleanup never runs (Q3)
- **Migrations 092/093/100 missing on disk** — `require_outranks` + `caller_can_assign_role` have no source-of-truth file (Q1)
- **127 rollback uses wrong perm-key naming** — DELETE never matches forward INSERT (Q6)
- **adminMutation.ts skips p_ip/p_user_agent** — audit log incomplete (Q8)
- **/api/comments/[id]/report has no rate limit** (Q10)
- **8 RPC bodies still reference dropped `superadmin` role** (Q4)

## Unresolved (needs Wave 3)
- 109/111 verity_score_events — does the table still exist?
- 177 partial GRANT — full F7 table enumeration
- F7 tables RLS state per pg_policies
- `@feature-verified` + `@migrated-to-permissions` marker status (236 + 228 active in code)

## Recommended actions (ordered by severity)
1. **P0:** Write `schema/178_fix_cleanup_rate_limit_events_column.sql` — replace `occurred_at` → `created_at`
2. **P0:** Write `schema/179_recreate_admin_rank_rpcs.sql` — dump pg_proc bodies of `require_outranks` + `caller_can_assign_role`, capture in repo
3. **P1:** Write `schema/180_strip_superadmin_from_routines.sql` — CREATE OR REPLACE for the 8 dead-ref routines
4. **P1:** Edit `web/src/lib/auth/adminMutation.ts` to pass `p_ip` + `p_user_agent`
5. **P1:** Add rate limit to `/api/comments/[id]/report`
6. **P2:** Audit-log gap fix — convert listed routes to use `adminMutation` helper
7. **P2:** Edit `schema/127_rollback_126_newsroom_redesign.sql` (or new 181) to fix DELETE perm keys
8. **P2:** Decide F7 vs legacy admin: keep both with clear separation, or migrate story-manager → articles/[id]/{review,edit}
9. **P3:** Resolve `@feature-verified` + `@migrated-to-permissions` marker fate (retire or document)
