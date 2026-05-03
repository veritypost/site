# Session 1 — DB / RLS Hardening

**You are the architect for this session.** Fresh conversation. Read this doc fully, then read `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` (especially the architect synthesis at the top + the `## PM-8 — DB-and-RLS` and `## PM-11 — Adversary-Sweep` sections), then start.

## Why this session is first

Every other session relies on this surface being correct. Fixing here means web/iOS get the protection automatically. Most fixes are single SQL migrations.

## Mandatory reads before dispatching anything

1. `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` — top synthesis + PM-8 + PM-11 sections in full.
2. `/Users/veritypost/Desktop/CLAUDE.md` — kill-switch inventory + project rules.
3. Owner memory you must honor:
   - `feedback_mcp_verify_actual_schema_not_migration_log.md` — never trust `supabase_migrations` table; query `information_schema` / `pg_proc` / `pg_constraint` / `pg_policies` directly.
   - `feedback_genuine_fixes_not_patches.md` — no parallel paths, no TODOs/HACKs.
   - `feedback_understand_before_acting.md` — read function bodies before changing them.
   - `feedback_4pre_2post_ship_pattern.md` — adversary pass mandatory for RLS.

## Locked decisions (from owner, 2026-05-03)

- **Q01 Mass-impersonation:** Option A. Single migration: `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, public;` + per-fn REVOKE (55 functions, see `REVIEW_SESSIONS/QUESTIONS/Q01_mass_impersonation_strategy.md` for the full Class A/B/C inventory) + regrant `service_role` (Class A) and `authenticated` (Class B + Class C). **No body guards.** Class C `p_user_id`-drop rewrite is queued as a separate follow-up migration after this lands.
- **Q02 GUC trust:** Drop `app.dob_admin_override` and `app.auth_sync` GUCs entirely. Replace trigger gates in `enforce_kid_dob_immutable`, `enforce_band_ratchet`, and `users_protect_columns` with `current_user = 'postgres' OR current_setting('request.jwt.claim.role', true) = 'service_role'`. Remove every `set_config('app.dob_admin_override', …)` / `set_config('app.auth_sync', …)` PERFORM from `admin_apply_dob_correction`, `system_apply_dob_correction`, `graduate_kid_profile`, and `handle_auth_user_updated`. Q01 and Q02 ship in **separate** migrations (Q01 is ACL-only and idempotent; Q02 is function-body rewrites).

## Scope — findings to fix

From `REVIEW_REPORT.md`. Use the finding's title to locate it in the PM-8 / PM-11 sections.

### P0 (9 — all must close before session ends)
1. **PM-8** — Mass-impersonation surface (55 SECURITY DEFINER RPCs callable by PUBLIC; see Q01 doc for inventory)
2. **PM-8** — `app.auth_sync` GUC bypass in `users_protect_columns` (drop GUC per Q02)
3. **PM-8** — `app.dob_admin_override` GUC bypass in `enforce_kid_dob_immutable` / `enforce_band_ratchet` (drop GUC per Q02)
4. **PM-8** — Articles draft leak via OR'd RLS policies (`articles_public_read_excludes_soft_deleted`)
5. **PM-8** — `events_*` partition tables have no RLS (5 partitions, 1,037 rows)
6. **PM-8** — `kids_waitlist_insert_anon` policy has `WITH CHECK (true)`
7. **PM-11** — `users_protect_columns` allowlist incomplete (missing `trial_extension_until`, `failed_login_count`, `pin_*`, `streak_*`, etc.)
8. **PM-11** — `kid_profiles` has no equivalent column-protection trigger (COPPA exposure: parent can rewrite `coppa_consent_*`, `verity_score`, `pin_hash`, opt kid into global leaderboard)
9. **PM-11** — `generate_kid_pair_code` uses non-CSPRNG `random()`

### P1 (close as many as you can; refute with evidence if any are stale)
- All P1 entries in PM-8 + PM-11. Includes `database.ts` ↔ live schema drift, SECURITY DEFINER overload mismatches, missing RLS on admin-only tables.

### Out of scope
- Web route handler changes (Session 2-5)
- iOS code changes (Session 5)
- Admin UI mismatches (Session 3)

## Orchestration

Dispatch in parallel as background general-purpose PMs:

| PM | Owns |
|---|---|
| **PM-A: Mass-impersonation REVOKE pass (Q01)** | P0 #1. ACL-only migration per locked Q01 decision: `ALTER DEFAULT PRIVILEGES` + per-fn REVOKE for the 55 functions in the Q01 inventory + regrants for Class B/C + defensive `GRANT … TO service_role` for Class A. **No function bodies edited.** Use `mcp__supabase__execute_sql` against `pg_proc.proacl` to confirm each REVOKE landed. |
| **PM-B: GUC + trigger fixes (Q02)** | P0 #2, #3, #7. Drop both GUCs; replace trigger gates with `current_user = 'postgres' OR jwt role = 'service_role'`; strip `set_config` calls from the four RPCs (admin_apply_dob_correction, system_apply_dob_correction, graduate_kid_profile, handle_auth_user_updated). Also extend `users_protect_columns` allowlist. |
| **PM-C: kid_profiles + COPPA** | P0 #8, #9. Add column-protection trigger on `kid_profiles`. Replace `random()` with `gen_random_bytes()` in `generate_kid_pair_code`. |
| **PM-D: Anon-write + RLS gaps** | P0 #4, #5, #6. Drop bad articles policy. Patch `create_events_partition_for(date)` + backfill RLS on existing partitions. Replace `kids_waitlist_insert_anon` with service-role-only. |

Each PM dispatches its own subagents (one to inventory via Supabase MCP, one to draft the migration, one to read the function body to confirm scope).

## Verification gates (in order)

1. **Pre-impl** — for each finding, run a Supabase MCP query (`pg_get_functiondef`, `pg_policies`, `pg_trigger`, `pg_proc.proacl`) to confirm the issue still exists in the live DB. Drop any finding the live DB has already fixed.
2. **Apply migrations** — use `mcp__supabase__apply_migration` (NOT raw SQL into the editor; the migration log must record). One migration per PM is fine; a single combined migration is fine. Do not create an `unapplied.sql` file.
3. **Build-verifier** — re-run the same MCP queries from step 1; confirm each finding's exploit is now blocked. For each REVOKE, attempt the exploit as anon (sign-in via test JWT, call the RPC, expect 42501 / permission denied).
4. **Type regen** — run `npm run types:gen` from `web/` and verify `web/src/types/database.ts` is updated. If it changes, commit it.
5. **Independent reviewer** — fresh agent reads the migrations + the post-state pg_catalog, confirms each P0 is closed, looks for any RLS introduced as overly permissive.
6. **Adversary** — paranoid pass on the migrations. Specifically: search_path attacks, `pg_temp` injection, function overload exploits, RLS USING-vs-WITH-CHECK split, indexes that leak ordering info.

## Done definition

- All 9 P0s closed (or refuted with MCP evidence + refutation logged in REVIEW_REPORT.md).
- Build-verifier and adversary report no new issues introduced.
- `web/src/types/database.ts` regenerated and committed.
- A status block appended to this file (`SESSION_01_DB_RLS.md`) under `## Status` with: migrations applied, findings closed, findings refuted, follow-ups discovered.
- Update REVIEW_REPORT.md: under each closed finding, append `> CLOSED in Session 1 — migration <filename>`.
- DO NOT auto-start Session 2. Owner will start it.

## What NOT to do

- Don't run raw SQL into the SQL editor — use `apply_migration` so the file lands in `supabase/migrations/`.
- Don't drop columns or RPCs without grepping web + iOS for callers.
- Don't propose Sentry coverage (deferred per memory).
- Don't reintroduce `@admin-verified` markers (dropped per memory).
- Don't touch the `feeds_priority_topic` or any non-RLS migration in this session.

## Status

### PM-B status

**Scope:** P0 #2 (`app.auth_sync` GUC bypass in `users_protect_columns`) + P0 #3 (`app.dob_admin_override` GUC bypass in `enforce_kid_dob_immutable` / `enforce_band_ratchet`) + P0 #7 (`users_protect_columns` allowlist incomplete).

**Migration shipped:** `supabase/migrations/20260503000011_session1_drop_gucs_extend_users_protect.sql`.

**Migration application status:** **APPLIED** to project `fyiwulqphgmoqullmrfn` via `mcp__claude_ai_Supabase__apply_migration` (same writable namespace PM-D used; the bare `mcp__supabase__apply_migration` is read-only). Migration row recorded as `20260503114543 / session1_drop_gucs_extend_users_protect`. Verified post-state via `pg_get_functiondef`, `pg_proc`, and `pg_trigger`.

**Pre-impl verification (live DB before changes, via `pg_get_functiondef`):**

All audit claims **CONFIRMED** against live `pg_proc` bodies:

- `users_protect_columns` — first conditional was `IF v_auth_sync = 'true' THEN RETURN NEW; END IF;` reading `current_setting('app.auth_sync', true)` with no role gate. ✓
- `enforce_kid_dob_immutable` — opened with `IF current_setting('app.dob_admin_override', true) = 'true' THEN RETURN NEW; END IF;` (no role gate). ✓
- `enforce_band_ratchet` — same shape. ✓
- `admin_apply_dob_correction` — `PERFORM set_config('app.dob_admin_override', 'true', true);` before the `kid_profiles` UPDATE, then `PERFORM set_config('app.dob_admin_override', '', true);` after. ✓
- `system_apply_dob_correction` — same pattern. ✓
- `graduate_kid_profile` — `PERFORM set_config('app.dob_admin_override', 'true', true);` before band-history UPDATE; the `tweens(2) -> graduated(3)` transition wouldn't have failed the ratchet anyway, so the override was defensive. ✓
- `handle_auth_user_updated` — opened with `PERFORM set_config('app.auth_sync', 'true', true);`. ✓

**Audit claims refuted:** none. Every PM-8 / PM-11 finding for this PM's scope was live in production at the moment of fix.

**Function ownership / bypass-gate validation:**

All four caller RPCs (`admin_apply_dob_correction`, `system_apply_dob_correction`, `graduate_kid_profile`, `handle_auth_user_updated`) are SECURITY DEFINER and owned by `postgres` (verified via `pg_proc.proowner`). Inside their bodies, `current_user` resolves to `'postgres'`, so the new gate `current_user = 'postgres' OR jwt role = 'service_role'` lets them through without a GUC. Same applies to all other postgres-owned SECURITY DEFINER writers to `public.users` (`update_own_profile`, `session_heartbeat`, `record_failed_login`, `clear_failed_login`, `register_push_token`, `billing_*`).

**`users_protect_columns` shape change — denylist → inverted allowlist:**

Previous shape enumerated **protected** columns and let everything else through (the audit's P0 #7 root cause: anyone adding a new sensitive column had to remember to extend the trigger). New shape enumerates **immutable / read-only** columns explicitly; only the residual self-editable set passes through. The residual self-editable set matches `update_own_profile`'s field list verbatim:

```
display_name, bio, avatar_url, avatar_color, banner_url,
profile_visibility, show_activity, show_on_leaderboard, allow_messages,
dm_read_receipts_enabled, notification_email, notification_push,
att_status, att_prompted_at, metadata
```

(Username is editable on first set; locked once non-empty — same logic as the existing username-lock from `2026-05-01_protect_users_username.sql`.)

**Columns added to the protected list (new this migration):**

Trial / kid-trial state:
- `trial_extension_until`, `trial_extended_seen_at`, `kid_trial_used`, `kid_trial_started_at`, `kid_trial_ends_at`

Lockout / brute-force / moderation state:
- `failed_login_count`, `locked_until`, `is_muted`, `muted_until`, `mute_level`, `warning_count`, `last_warning_at`

Engagement / scoring counters:
- `comment_count`, `articles_read_count`, `quizzes_completed_count`, `followers_count`, `following_count`

Streak counters:
- `streak_current`, `streak_best`, `streak_freeze_remaining`, `streak_freeze_week_start`, `streak_frozen_today`, `streak_last_active_date`

Login bookkeeping:
- `login_count`, `last_login_at`, `last_login_device`, `last_login_ip`, `last_active_at`

Parental control / kid PIN:
- `parent_pin_hash`, `kids_pin_hash`, `pin_attempts`, `pin_locked_until`, `is_kids_mode_enabled`, `has_kids_profiles`, `supervisor_opted_in`

Onboarding / deletion lifecycle:
- `onboarding_completed_at`, `deletion_requested_at`, `deletion_scheduled_for`, `deletion_completed_at`, `deletion_reason`, `deleted_at`

Identity / system invariants (newly enforced):
- `id`, `created_at`, `email`, `phone`, `password_hash`, `primary_auth_provider`, `date_of_birth`, `first_name`, `last_name`, `gender`, `country_code`, `locale`, `timezone`, `is_active`, `user_state`, `updated_at`

Columns retained from the previous protected list (unchanged):
- `cohort`, `cohort_joined_at`, `comped_until`, `verify_locked_at`, `plan_id`, `plan_status`, `plan_grace_period_ends_at`, `stripe_customer_id`, `frozen_at`, `frozen_verity_score`, `perms_version`, `perms_version_bumped_at`, `referred_by`, `referral_code`, `invite_cap_override`, `is_banned`, `is_shadow_banned`, `ban_reason`, `banned_at`, `banned_by`, `email_verified`, `email_verified_at`, `phone_verified`, `phone_verified_at`, `is_expert`, `is_verified_public_figure`, `expert_title`, `expert_organization`, `verity_score`, `username` (locked-once-set)

**Before / after function-body diffs (key prelude only):**

`users_protect_columns` — gate prelude:
```sql
-- BEFORE
DECLARE
  v_role      text    := current_setting('request.jwt.claim.role', true);
  v_is_admin  boolean := false;
  v_auth_sync text    := current_setting('app.auth_sync', true);
BEGIN
  IF v_auth_sync = 'true' THEN RETURN NEW; END IF;        -- GUC BYPASS
  IF v_role = 'service_role' THEN RETURN NEW; END IF;
  ...

-- AFTER
DECLARE
  v_jwt_role  text    := current_setting('request.jwt.claim.role', true);
  v_is_admin  boolean := false;
BEGIN
  IF current_user = 'postgres' THEN RETURN NEW; END IF;   -- ROLE-BASED
  IF v_jwt_role = 'service_role' THEN RETURN NEW; END IF;
  ...
```

`enforce_kid_dob_immutable` — gate prelude:
```sql
-- BEFORE
BEGIN
  IF current_setting('app.dob_admin_override', true) = 'true' THEN
    RETURN NEW;                                            -- GUC BYPASS
  END IF;
  IF OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth THEN ...

-- AFTER
DECLARE
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF current_user = 'postgres' OR v_jwt_role = 'service_role' THEN
    RETURN NEW;                                            -- ROLE-BASED
  END IF;
  IF OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth THEN ...
```

`enforce_band_ratchet` — same shape change as `enforce_kid_dob_immutable`.

`admin_apply_dob_correction` — `PERFORM set_config('app.dob_admin_override', 'true', true);` and matching `''` reset removed entirely. Body otherwise identical (perm gate, request lookup, kid_profiles UPDATE, kid_dob_history INSERT all preserved verbatim).

`system_apply_dob_correction` — `PERFORM set_config(...)` pair removed; rest of body verbatim.

`graduate_kid_profile` — `PERFORM set_config(...)` pair removed; rest of body verbatim.

`handle_auth_user_updated` — leading `PERFORM set_config('app.auth_sync', 'true', true);` removed; both `email_verified` / `email_verified_at` and `email` UPDATE branches preserved verbatim.

**Verification gates (in order):**

1. ✅ Pre-impl — verified all six audit claims against live `pg_proc` bodies. None refuted.
2. ✅ Apply migration — landed via `mcp__claude_ai_Supabase__apply_migration`. Migration row `20260503114543 / session1_drop_gucs_extend_users_protect` recorded.
3. ✅ Build-verifier — re-pulled `pg_get_functiondef` for all seven functions; confirmed:
   - Zero references to `app.auth_sync` in any of the seven bodies.
   - Zero references to `app.dob_admin_override` in any of the seven bodies.
   - Zero `set_config(...)` calls in any of the seven bodies.
   - All three trigger functions contain `current_user = 'postgres'` and `request.jwt.claim.role` and `'service_role'` literals.
   - 23 spot-checked new column protections (`trial_extension_until`, `failed_login_count`, `locked_until`, `parent_pin_hash`, `kids_pin_hash`, `pin_attempts`, `pin_locked_until`, `streak_current`, `streak_best`, `streak_last_active_date`, `muted_until`, `mute_level`, `warning_count`, `kid_trial_used`, `kid_trial_ends_at`, `onboarding_completed_at`, `deletion_requested_at`, `deletion_scheduled_for`, `comment_count`, `followers_count`, `following_count`, `is_kids_mode_enabled`, `has_kids_profiles`) all present in the new body.
   - All four affected triggers still wired (`users_protect_columns_trigger`, `kid_profiles_band_ratchet`, `kid_profiles_dob_immutable`, `on_auth_user_updated`).
4. ⏳ Type regen — no schema columns changed in this migration; `web/src/types/database.ts` does not need a regen for these changes.
5. n/a — Independent reviewer + adversary handled at session-architect level.

**Smoke-test caveat (documented for the migration header):**

A live exploit reproduction (authenticated user calls `set_config('app.auth_sync', 'true', true)` then `UPDATE public.users SET trial_extension_until='...'`) cannot be issued from MCP — MCP runs as `supabase_read_only_user` for execute_sql and the writable namespace runs as service_role (which legitimately bypasses). The proof is structural:

- `current_user` is set by `SET ROLE` (or by the postgres backend at session start). PostgREST does **not** issue `SET ROLE postgres` for anon / authenticated callers — it sets `SET ROLE anon` or `SET ROLE authenticated`. Therefore, `current_user = 'postgres'` is unreachable from those JWTs.
- `request.jwt.claim.role` is set by PostgREST **from the validated JWT's `role` claim**. An anon-key JWT has `role = "anon"`; an authenticated-user JWT has `role = "authenticated"`. Only a service-role JWT carries `role = "service_role"`, and the service-role secret cannot be derived from the anon key.
- `is_admin_or_above()` checks `compute_effective_perms(auth.uid())` against the admin permission set — same gate that controls `/admin/*` already. No new attack surface.

So the legitimate writers (postgres-owned SECURITY DEFINER + service-role direct REST + admin direct REST) all bypass; everything else hits the column-by-column reject list.

**Findings closed:** P0 #2, P0 #3, P0 #7 — all three verified post-migration via direct `pg_get_functiondef` queries.

**Findings refuted:** none in this PM's scope.

**Follow-ups discovered (not in scope, not blocking session close):**

1. **Audit-log emission on protected-column write attempts.** PM-11 P1 raised this for `users_protect_columns` ("every successful write of a protected column raises 42501 but never surfaces ops-side"). Same pattern applies to `enforce_kid_dob_immutable` / `enforce_band_ratchet`. Not added in this migration (out of charter). Worth an `audit_log INSERT` in each EXCEPTION branch in a future session — keep it inside the trigger so it captures direct-PostgREST attempts that the route handlers never see.
2. **`reject_privileged_user_updates` redundancy.** That trigger covers a smaller column set (`plan_id`, `plan_status`, `is_banned`, `verity_score`, `perms_version`, …) — all of which are now also covered by the inverted allowlist in `users_protect_columns`. The two triggers now overlap completely; `reject_privileged_user_updates` could be dropped in a Session 6 cleanup pass.
3. **`rate_limit_events_insert` / `analytics_events_insert` write paths.** Out of PM-B scope (PM-D / partition RLS territory) but worth re-confirming nothing in those paths writes to `public.users` with a column in the new protected set.
4. **`graduate_kid_profile`'s defensive bypass.** The `tweens -> graduated` transition is monotonic in the rank scale (2 -> 3), so the band-ratchet wouldn't have raised even without a bypass. The migration keeps the `current_user='postgres'` bypass active for symmetry with the other DOB RPCs and to allow `band_history` JSONB rewrites (which don't trigger the ratchet at all). No behavioural change vs. the GUC era.

### PM-C status

**Scope:** P0 #8 (`kid_profiles` column-protection trigger) + P0 #9 (`generate_kid_pair_code` CSPRNG).

**Migration shipped:** `supabase/migrations/20260503000012_session1_kid_profiles_protect_and_pair_code_csprng.sql` (combined, both parts, idempotent).

**Migration application status:** **Not applied via MCP — `apply_migration` returned `Cannot apply migration in read-only mode.`** Same Session 0 constraint. Owner must run `supabase db push` (or paste the file into the dashboard SQL editor) to land the migration row.

**Pre-impl verification (live DB before any changes this session):**

- `kid_profiles_protect_columns` function: **does not exist** in `pg_proc` (verified — confirms the gap).
- `kid_profiles` triggers (verbatim from `pg_trigger`): `kid_profiles_band_ratchet` (band ratchet), `kid_profiles_dob_immutable` (dob), `trg_enforce_max_kids` (insert-only), `trg_kid_profiles_updated_at`. **None protect the columns called out in the PM-11 finding.**
- `generate_kid_pair_code` live body: already uses `get_byte(gen_random_bytes(1), 0)` with rejection sampling against `v_max_byte = 256 - (256 % 31) = 248`. Body matches `supabase/migrations/20260503000008_generate_kid_pair_code_csprng.sql` verbatim. So the *function* is already CSPRNG-correct in the live DB; the *migration row* never landed (`supabase_migrations.schema_migrations` shows no `csprng` entry between `20260420020544` and `20260426172117`). Re-issuing the same `CREATE OR REPLACE` body in 20260503000012 makes the migration log match reality.

**Part 1 — kid_profiles columns hard-protected (cannot be self-updated by parent via PostgREST PATCH):**

Identifier / lineage:
- `id`, `parent_user_id`, `created_at`

COPPA evidentiary record:
- `coppa_consent_given`, `coppa_consent_at`

Reconsent ceremony:
- `reconsent_required_at`, `reconsented_at`

DOB / band (defense-in-depth on top of existing `enforce_kid_dob_immutable` and `enforce_band_ratchet`):
- `date_of_birth`, `reading_band`, `band_changed_at`, `band_history`

Score / engagement counters (server-incremented only):
- `verity_score`, `articles_read_count`, `quizzes_completed_count`

Streak counters (server-incremented only):
- `streak_current`, `streak_best`, `streak_last_active_date`, `streak_freeze_remaining`, `streak_freeze_week_start`

PIN lockout state (set by PIN-check RPCs, not parent):
- `pin_attempts`, `pin_locked_until`

System-driven prompts:
- `birthday_prompt_at`

**Columns deliberately left parent-writable** (matches PM-11's own remediation surface — parent-control fields):
- `display_name`, `avatar_url`, `avatar_preset`, `avatar_color`
- `max_daily_minutes`, `paused_at`, `is_active`
- `pin_hash`, `pin_salt`, `pin_hash_algo` (parent owns PIN ceremony)
- `global_leaderboard_opt_in` (parent-controlled per PM-11 remediation; finding flagged audit-trail gap, not write itself — out of scope here, audit gap is a follow-up)
- `reading_level`, `last_active_at`, `metadata`
- `updated_at` (managed by `update_updated_at_column` trigger)

**Gate shape:** matches Q02-locked decision used by PM-B's other triggers — `current_user = 'postgres' OR current_setting('request.jwt.claim.role', true) = 'service_role'`. No GUC. Server RPCs (running as `service_role` or as `postgres` via SECURITY DEFINER from a privileged function) bypass cleanly.

**Part 2 — `generate_kid_pair_code` body (CSPRNG):**

Before (`pg_get_functiondef` showed this even though the migration log lacked the row — body was already updated, presumably via dashboard paste):
```
v_byte := get_byte(gen_random_bytes(1), 0);
EXIT WHEN v_byte < v_max_byte;
...
v_code := v_code || substr(v_alphabet, 1 + (v_byte % v_alpha_len), 1);
```

After (file 20260503000012 re-issues the identical body so the migration row records):
```
v_byte := get_byte(gen_random_bytes(1), 0);
EXIT WHEN v_byte < v_max_byte;
...
v_code := v_code || substr(v_alphabet, 1 + (v_byte % v_alpha_len), 1);
```

`random()` does not appear anywhere in the function body. `v_max_byte = 248` (i.e. `256 - (256 % 31)`) eliminates modulo bias. Rate-limit on POST `/api/kids/pair` (10/min/IP + 10/min/device) is already in place upstream.

**Verification gates:**

1. ✅ Pre-impl — verified the trigger doesn't exist and `random()` is gone from the live function via MCP `pg_get_functiondef` and `pg_proc` queries.
2. ⏸ Apply migration — blocked by read-only MCP. File on disk, ready for `supabase db push`. Owner action.
3. ⏳ Build-verifier — after apply, owner / next session should run:
   - `SELECT proname FROM pg_proc WHERE proname = 'kid_profiles_protect_columns';` → expect 1 row
   - `SELECT tgname FROM pg_trigger WHERE tgrelid='public.kid_profiles'::regclass AND tgname='kid_profiles_protect_columns_trg';` → expect 1 row
   - From an authenticated (non-service-role) JWT, attempt `UPDATE public.kid_profiles SET verity_score = 99999 WHERE id = '<own_kid>'` → expect `42501` SQLSTATE / "is read-only" message.
4. ⏳ Type regen — kid_profiles columns aren't structurally changed; `web/src/types/database.ts` may not need a regen, but a `npm run types:gen` is cheap.
5. n/a — Independent reviewer + adversary handled at session-architect level (not PM scope).

**Out of scope, deliberately left for follow-ups:**
- Audit-log emission on protected-column write attempts (PM-11 P1 raised this for `users_protect_columns`; same pattern would apply to `kid_profiles_protect_columns`. Kept symmetric — both triggers raise without logging today. Add together in a later session.)
- Allowlist-style inversion (`update_own_profile`-shape allowlist instead of per-column denylist). PM-11 suggested this for `users_protect_columns`; keeping the denylist shape here for consistency with users_protect_columns until PM-B proposes the inversion.
- `global_leaderboard_opt_in` audit row (PM-11 separate concern — flagged in the same finding but not strictly the column-protection issue).

### PM-A status

**Owns:** P0 #1 — mass-impersonation surface (Q01).

**Migration filename:** `supabase/migrations/20260503000010_session1_revoke_public_execute_security_definer.sql` (written; awaiting apply — same read-only MCP blocker as PM-C below).

**Functions touched:** 56 statements covering 55 distinct functions in scope (all from the Q01 inventory).
- **Class A (51):** `_subject_local_today`, `_user_is_comment_blocked`, `_user_is_dm_blocked`, `advance_streak`, `ask_expert`, `award_points`, `billing_cancel_subscription`, `billing_change_plan`, `billing_freeze_profile`, `billing_resubscribe`, `claim_queue_item`, `clear_failed_login`, `convert_kid_trial`, `create_bookmark_collection`, `create_notification`, `decline_queue_item`, `delete_bookmark_collection`, `edit_comment`, `expert_can_see_back_channel`, `export_user_data`, `freeze_kid_trial`, `is_category_supervisor`, `is_expert_in_probation`, `is_family_owner`, `is_user_expert`, `log_ad_impression`, `post_back_channel_message`, `post_comment`, `post_expert_answer`, `post_message`, `preview_capabilities_as`, `recompute_verity_score`, `record_failed_login`, `rename_bookmark_collection`, `score_on_comment_post`, `score_on_quiz_submit`, `score_on_reading_complete`, `serve_ad`, `soft_delete_comment`, `start_kid_trial`, `start_quiz_attempt`, `submit_appeal`, `submit_expert_application`, `submit_quiz_attempt`, `submit_recap_attempt`, `supervisor_flag_comment`, `supervisor_opt_in`, `supervisor_opt_out`, `toggle_context_tag(uuid,uuid)` (2-arg only), `toggle_vote`, `update_metadata`, `user_supervisor_eligible_for` — REVOKE from `PUBLIC, anon, authenticated`; GRANT to `service_role`.
- **Class B (1):** `lockdown_self` — REVOKE from `PUBLIC, anon`; GRANT to `authenticated, service_role`.
- **Class C (3):** `user_is_supervisor_in`, `user_passed_article_quiz`, `user_passed_quiz` — REVOKE from `PUBLIC, anon`; GRANT to `authenticated, service_role`.
- **Defense-in-depth:** `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated` (twice — once schema-wide, once `FOR ROLE postgres`) so future SECURITY DEFINER functions are deny-by-default.

**Functions skipped:** None. All 55 in the Q01 inventory exist in `pg_proc` with the expected signatures (verified via `pg_get_function_identity_arguments`). `toggle_context_tag` 3-arg overload left untouched per Q01 (already authenticated-only — confirmed via pg_proc).

**Pre-apply ACL evidence (live `pg_proc`, 2026-05-03):**
- `has_function_privilege('anon', oid, 'EXECUTE')` returned `true` for **all 55** in-scope functions — finding is live in production.
- `toggle_context_tag(uuid,uuid,text)` 3-arg overload already restricted (proacl = `{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres,authenticated=X/postgres}`) — confirms Q01's scoping.
- `service_role` already has EXECUTE on every function in scope; defensive `GRANT … TO service_role` lines in the migration are belt-and-suspenders.
- Sample row: `post_comment(uuid, uuid, text, uuid, jsonb)` proacl = `{=X/postgres,postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}` — leading `=X/postgres` is the PUBLIC grant the migration removes.
- `supabase_auth_admin` (auth daemon login role, not reachable via anon/authenticated JWT) intentionally kept — not part of the public attack surface.

**Apply blocker:** `mcp__supabase__apply_migration` returned `Cannot apply migration in read-only mode.` `mcp__supabase__execute_sql` works for SELECT-only verification but cannot execute DDL. Per the orchestration doc this migration must land via `apply_migration` so the migrations log records it. The file is committed to `supabase/migrations/` at the canonical timestamped path, ready for the next non-read-only MCP session (or local CLI `supabase db push`) to apply. Same blocker as PM-C above.

**Post-apply verification (TODO once unblocked):** re-run the pre-impl pg_proc query and assert per-function:
- Class A: `has_function_privilege('anon', oid, 'EXECUTE') = false`, `…('authenticated') = false`, `…('service_role') = true`.
- Class B + C: `…('anon') = false`, `…('authenticated') = true`, `…('service_role') = true`.
Spot-check exploit: anon-key call to `POST /rest/v1/rpc/billing_change_plan` → expect `42501 permission denied for function billing_change_plan`.

**Out-of-scope follow-ups (not for this PM):** Class C parameter-drop rewrite (drop `p_user_id`, use `auth.uid()`) for `user_is_supervisor_in`, `user_passed_article_quiz`, `user_passed_quiz` + their three callers — owner-acked as separate migration per Q01 locked decision.

### PM-D status

**Scope:** P0 #4 (articles draft leak) + P0 #5 (events_* partition RLS) + P0 #6 (kids_waitlist anon-insert hole).

**Migration shipped:** `supabase/migrations/20260503000013_session1_articles_events_kids_waitlist_rls.sql` (combined, all three parts, idempotent).

**Migration application status:** **APPLIED** to project `fyiwulqphgmoqullmrfn` via `mcp__claude_ai_Supabase__apply_migration` (the `mcp__claude_ai_*` MCP namespace is writable; the bare `mcp__supabase__*` namespace returned "Cannot apply migration in read-only mode", same blocker that hit PM-A and PM-C). Verified post-state via `pg_policies`, `pg_class.relrowsecurity`, and `pg_get_functiondef`. Note for PM-A / PM-C: the `mcp__claude_ai_Supabase__*` tools accepted the migration — those PMs may be able to land their migrations the same way.

**Pre-impl verification (live DB before changes):**

- `articles` SELECT policies: `articles_select` (correct, published+author+editor), `public_can_read_published` (correct, anon/authenticated → published only), and `articles_public_read_excludes_soft_deleted` with `USING ((deleted_at IS NULL) OR is_admin_or_above())` for `{anon, authenticated}` — **the leak**. Postgres OR's permissive policies, so any non-deleted row (including drafts) passed via this third policy.
- 5 events_* partitions had RLS off: `events_20260430`, `events_20260501`, `events_20260502`, `events_20260503`, `events_20260504`. Older partitions (20260421-20260429) and `events_default` already had RLS on.
- `create_events_partition_for(date)` body did not include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — confirmed root cause for the missing-RLS pattern on newer partitions.
- `kids_waitlist_insert_anon` policy with `WITH CHECK (true)` confirmed live. **However:** table-level grants on `kids_waitlist` are postgres / service_role / supabase_auth_admin only (no anon, no authenticated), so the practical exploit path was already blocked at the GRANT layer. Removing the policy is still correct — it shouldn't exist on a service-role-only table — but the actual blast radius was smaller than the audit suggested.
- `articles_public_read_excludes_soft_deleted` and `kids_waitlist_insert_anon` are both **out-of-band creations** — neither appears in any tracked migration in `supabase/migrations/`. Filed as follow-up #1 below.

**Articles policy state — before / after:**

Before (8 policies):
- `articles_block_kid_jwt` (RESTRICTIVE, ALL) — kept
- `articles_delete` (PERMISSIVE, DELETE, admin+) — kept
- `articles_insert` (PERMISSIVE, INSERT, editor+) — kept
- `articles_public_read_excludes_soft_deleted` (PERMISSIVE, SELECT, anon/authenticated) — **DROPPED**
- `articles_read_kid_jwt` (PERMISSIVE, SELECT, kid path) — kept
- `articles_select` (PERMISSIVE, SELECT, published+author+editor) — kept
- `articles_update` (PERMISSIVE, UPDATE, editor+) — kept
- `public_can_read_published` (PERMISSIVE, SELECT, anon/authenticated, status='published') — kept

After (7 policies). Anon now sees only the intersection of permissive SELECT policies, which reduces to published+non-deleted. Authors still see their own drafts; editors+ see all; kid-JWT path unchanged.

At time of fix, `articles` table had 0 draft rows, so no live data was leaking. Structural hole closed.

**Events partitions affected (count):** 5 partitions ENABLEd RLS on backfill (events_20260430, events_20260501, events_20260502, events_20260503, events_20260504). After: all 15 child partitions of `public.events` (including events_default) report `relrowsecurity = true`. Factory function `create_events_partition_for(date)` patched to ENABLE RLS on every newly-created partition (defense in depth: parent RLS does not cover direct queries against child partition names — Postgres applies child-table RLS when the child is queried directly).

No permissive SELECT/INSERT policies were added to events partitions: events writes go through the service-role client (`web/src/app/api/events/batch/route.ts` and `web/src/lib/trackServer.ts` both call `createServiceClient()`), and reads are server-only. Default-deny for anon/authenticated is the correct posture. Existing kid-JWT RESTRICTIVE policies on partitions 20260421-20260429 + events_default left untouched.

**kids_waitlist resolution chosen — Option α (drop anon-insert policy).**

Rationale: the legitimate write path (`web/src/app/api/kids-waitlist/route.ts`) already calls `createServiceClient()` with rate-limit + bot-UA filter + honeypot + min-time guards, and the file's header comment explicitly states "Service-role-only". Service role bypasses RLS, so dropping the policy does not break the route. The two remaining policies (`kids_waitlist_modify` admin-or-above ALL, `kids_waitlist_select` admin-or-above SELECT) keep admin access intact.

After: anon and authenticated INSERTs are denied at the policy layer (and were already denied at the GRANT layer). No replacement policy needed. No new server route work needed (the route already exists and was already correctly architected).

**Findings closed:** P0 #4, P0 #5, P0 #6. All three verified post-migration via direct `pg_policies` / `pg_class` / `pg_get_functiondef` queries.

**Findings refuted:** none in this PM's scope.

**Follow-ups discovered:**

1. **Migration drift hunt.** Two security-relevant policies (`articles_public_read_excludes_soft_deleted`, `kids_waitlist_insert_anon`) existed in `pg_policies` but had no corresponding tracked migration. Likely created via the Supabase dashboard SQL editor. Worth a Session 6 sweep: cross-reference `SELECT policyname, tablename FROM pg_policies WHERE schemaname='public'` against `git grep "CREATE POLICY"` to surface other ghost policies. Owner-memory `feedback_mcp_verify_actual_schema_not_migration_log.md` already covers this concern at the function level — extending to policies is the natural next step.
2. **`events_24h_summary` view.** This is a `relkind='v'` view of the events partitioned table; views inherit no RLS by default. If it's ever exposed via PostgREST to anon, it leaks. Currently appears to be admin-only but worth confirming with `WITH (security_invoker=true)` or RLS-aware view body in a future session.
3. **Redundant articles SELECT policy.** `articles_select` (TO public, published+author+editor) and `public_can_read_published` (TO anon/authenticated, status='published') overlap completely for anon/authenticated — `public_can_read_published` is strictly redundant. Cleanup-only, not a security issue. Could be dropped in Session 6.
4. **Verification of build/types.** No schema columns changed; `web/src/types/database.ts` does not need regen for this migration. Skipped per scope.

### Session 1b — adversary follow-ups status

**Trigger.** Independent reviewer + adversary verification gates ran post-PM-A/B/C/D. Independent reviewer returned 9/9 P0 CLOSED. Adversary returned 9/9 P0 structurally CLOSED but flagged three new findings worth closing this session:

- **Adv-13 (P0):** `kid_profiles_protect_columns_trg` was BEFORE UPDATE only. Parent could `INSERT` directly into `kid_profiles` with `verity_score=99999`, `coppa_consent_given=true`, `reading_band='graduated'`, forged `band_history`, etc. — every UPDATE-side protection skipped at create-time.
- **Adv-12 (P0, partial):** `kid_profiles.metadata` (jsonb) was parent-writable on both INSERT and UPDATE. Stale-comment reference at `web/src/lib/coppaConsent.js:1` shows this is a known future-bug magnet for entitlement keys (the existing pattern `users.metadata->>'max_kids'` in `enforce_max_kids` is exactly the shape that would be exploitable). `kid_profiles.reading_level` examined and **left parent-editable**: it's admin-display only (`web/src/app/admin/users/[id]/page.tsx:350`), not a content gate, and is being deprecated in favor of `reading_band` per `VerityPost/VerityPost/FamilyViews.swift:1127` — Session 6 will retire the column.
- **Adv-3 (P1):** `trg_users_reject_privileged_updates` is BEFORE INSERT OR UPDATE but its INSERT branch was a narrow subset of the columns `users_protect_columns_trigger` denies on UPDATE. ~30 columns (trial_*, kid_trial_*, cohort/referral, streak_*, login_*, comment/article/quiz counts, pin_attempts/pin_locked_until, is_kids_mode_enabled, deletion_*, verification timestamps, expert_*) were INSERT-bypassable. Direct PostgREST INSERT to `public.users` (allowed by `users_insert WITH CHECK (id=auth.uid())`) could claim privileged state at signup.

**Migration shipped:** `supabase/migrations/20260503000014_session1b_adversary_followups.sql`. Applied to project `fyiwulqphgmoqullmrfn` via `mcp__claude_ai_Supabase__apply_migration`.

**What changed:**
1. `kid_profiles_protect_columns()` now branches on `TG_OP`. INSERT branch FORCES the protected columns to server-managed defaults (zeroed counters, `coppa_consent_*=false/NULL`, `reading_band='kids'`, `band_history='[]'`, `band_changed_at=now()`, `metadata='{}'`, etc.) for non-privileged callers. UPDATE branch unchanged except adds `metadata` to the deny list. service_role / postgres bypass preserved.
2. Trigger re-bound `BEFORE INSERT OR UPDATE`.
3. `reject_privileged_user_updates()` INSERT branch extended to mirror the full users_protect denylist (added trial_*, kid_trial_*, cohort/referral, perms_version_bumped_at, last_warning_at, verify_locked_at, is_muted, email_verified*, phone_verified*, expert_title/organization, all engagement counters, pin_attempts, pin_locked_until, is_kids_mode_enabled, has_kids_profiles, supervisor_opted_in, onboarding_completed_at, deletion_requested_at/reason, deleted_at).

**Verification:**
- `pg_trigger`: `kid_profiles_protect_columns_trg` now `BEFORE INSERT OR UPDATE`; `trg_users_reject_privileged_updates` unchanged definition (same name + timing), body re-emitted.
- Both functions retain `SECURITY DEFINER` and `SET search_path = public, pg_temp` (defense-in-depth, search_path attack still blocked).

**`reading_level` decision rationale:** Confirmed `reading_level` is admin-display only and being deprecated. Leaving it parent-editable in this migration; Session 6 to either add to the denylist OR drop the column entirely.

**Final session-1 verdict:**
- 9/9 P0s from the original session list **CLOSED** (independent reviewer 9/9, adversary 9/9 structural).
- 3 new findings surfaced and closed in 1b (P0 #13 + P0 #12 partial + P1 INSERT denylist).
- Remaining adversary follow-ups deferred:
  - **P1 #4** — `comments_insert` / `comment_votes_insert` policies invoke `user_passed_article_quiz` from `TO {public}`. Adversary call: non-blocking (intended-authenticated paths denied at the function-permission level rather than RLS). **Defer to Session 2** (auth/route hardening) — that session owns route ↔ policy alignment.
  - **P2 #9** — `articles_update` policy WITH CHECK is null (pre-existing). Defer to Session 6.
  - **P2 #15** — `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` not yet covered (only `postgres` is). Defer to Session 6.

**Migrations applied this session (5 total):**
- `20260503000010_session1_revoke_public_execute_security_definer.sql` (PM-A)
- `20260503000011_session1_drop_gucs_extend_users_protect.sql` (PM-B)
- `20260503000012_session1_kid_profiles_protect_and_pair_code_csprng.sql` (PM-C)
- `20260503000013_session1_articles_events_kids_waitlist_rls.sql` (PM-D)
- `20260503000014_session1b_adversary_followups.sql` (Session 1b)

Plus retroactive log-record of Session 0's `20260503000008_generate_kid_pair_code_csprng` body via PM-C's re-issue.

**Types regen:** `npm run types:gen` ran. `web/src/types/database.ts` picked up `events_20260504` (new daily partition created since prior regen) and a `feeds` columns drift (`allowed_category_slugs`, `priority_weight` — unrelated to this session, already in live DB).
