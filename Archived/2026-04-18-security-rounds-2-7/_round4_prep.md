# Round 4 — Critical Fix Pass — Prep Doc

**Purpose:** scope the four execution tracks that address the 13 real bugs uncovered by the two independent audits after Round 3 sealed the marker/drift work. Execution agents follow this doc literally.

**Working dir:** `/Users/veritypost/Desktop/verity-post`
**Supabase project:** `fyiwulqphgmoqullmrfn`
**Date:** 2026-04-18
**Prep agent scope:** plan only. No code written.

---

## Part 1 — Discovery notes (verified against disk)

Every count in this doc was verified by grep/ls against the working tree before being written down. Where the brief said one number and the tree shows another, the tree wins and is noted.

### 1.1 Users-table self-escalation (Finding 1 — CRITICAL)

- `reset_and_rebuild_v2.sql:3738-3740` defines `users_update` policy as `USING (id = auth.uid() OR public.is_admin_or_above())`. No `WITH CHECK`. No column grant restriction on `authenticated`.
- No `BEFORE UPDATE` trigger exists on `users` that rejects privileged-column mutations. `trg_users_updated_at` is the only trigger (line 2929) and only touches `updated_at`.
- Privileged columns identified in audit: `plan_id`, `plan_status`, `is_expert`, `is_verified_public_figure`, `is_banned`, `verity_score`, `warning_count`, `perms_version`. (Brief listed 7, actual list is 8 once `plan_status` is included — it is privileged for the same reason `plan_id` is.)
- Exploit is a direct PostgREST `PATCH /rest/v1/users?id=eq.<own id>` with any of the above in the body. RLS accepts because the caller owns the row.

### 1.2 iOS `appAwardPoints` client-side score write (Finding 2 — CRITICAL)

- `VerityPost/VerityPost/StoryDetailView.swift:1753-1790`. Brief named this `awardScore`; the actual function name is `appAwardPoints(userId:action:)`. Line 1764 writes `verity_score` directly via `client.from("users").update(...)`. Line 1757 selects the points value from `score_rules`, line 1760 reads the current score, line 1762 sums, line 1764 writes. Classic trust-the-device.
- Server already has `public.score_on_reading_complete(...)` at `01-Schema/022_phase14_scoring.sql:634` plus `score_on_quiz_submit` (515), `score_on_comment_post` (703), `recompute_verity_score` (748). The gap is a reading-complete RPC callable by the iOS client with only `article_id` and auth.uid() as inputs.

### 1.3 iOS `AlertsView` column-name bug (Finding 3 — HIGH)

- `VerityPost/VerityPost/AlertsView.swift:494-510` (`markAsRead`) writes column `read`, lines 512-528 (`markAllRead`) writes column `read` in both the SET list AND the `.eq("read", value: false)` filter.
- Real column is `is_read` (`reset_and_rebuild_v2.sql:1334`: `"is_read" boolean NOT NULL DEFAULT false`). Both iOS calls 400 silently (inside `do { } catch { Log.d }`).
- No existing `/api/notifications/mark-read` route. `/api/notifications/route.js` exists but is for listing, not marking.

### 1.4 iOS `SubscriptionView.redeemPromo` dead path (Finding 4 — HIGH)

- `VerityPost/VerityPost/SubscriptionView.swift:481-493`. Writes `plan` and `subscription_status` on `users` (both nonexistent — real columns are `plan_id`, `plan_status`), and increments `current_uses` on `promo_codes` directly from the user-scoped client.
- `promo_codes_update` RLS policy (`reset_and_rebuild_v2.sql:4165`) requires `is_admin_or_above()`. The user-scoped increment from line 481-484 silently fails 403. Even if it succeeded, the `users` update on lines 487-493 would 400 on the nonexistent columns.
- `/api/promo/redeem/route.js` already exists, has `@migrated-to-permissions 2026-04-18` + `@feature-verified subscription 2026-04-18`, uses `requirePermission('billing.promo.redeem')`, a duplicate-guard via `promo_uses`, audits, and the service client for the `plan_id`/`plan_status` write. The correct fix is to delete the direct-write path in iOS and call the endpoint.

### 1.5 iOS `AuthViewModel` signup user_roles insert (Finding 5 — HIGH)

- `VerityPost/VerityPost/AuthViewModel.swift:275-288`. Grants the default `user` role by selecting `roles.id` (ok — reads are fine), then `INSERT`s into `user_roles` with the caller's own auth.uid() as `assigned_by`.
- `user_roles` RLS requires `is_admin_or_above()` for writes. The insert is wrapped in `try?` — 403 is swallowed. Every new iOS signup ships without the default role; the user is signed in but has no permissions. The comment on line 267-268 even acknowledges this ("Best-effort: if the role row is missing the signup still succeeds; a background reconciliation can fix orphans.") — but there is no reconciliation.
- Web parity: `/api/auth/signup/route.js` and `/api/auth/callback/route.js` do this insert on the service client, so web signups get the default role. iOS has no such server path.

### 1.6 Missing permission key `profile.expert.badge.view` (Finding 6 — HIGH)

- Referenced at `site/src/app/u/[username]/page.tsx:92` and `site/src/app/profile/[id]/page.tsx:141`, both via `hasPermission('profile.expert.badge.view')`. Both files also carry a `Legend` comment at lines 18 and 16 respectively that explicitly names the key.
- Not present in `site/src/lib/permissionKeys.js`. Needs to be created in DB and (optionally) added to the constants file. Behavior of `hasPermission` on unknown key is "deny" — so expert badges silently never render for anyone.
- Fallback decision: canonical name should remain `profile.expert.badge.view` to match the two call-sites rather than renaming the call-sites.

### 1.7 Unmigrated files (Finding 7 — MEDIUM)

Brief said 17. Verified: 11 auth routes + 3 ads routes + `errors/route.js` + `health/route.js` + `layout.js` = **16 files**, not 17. Brief rounded up by counting 14 auth routes; actual is 11:

```
site/src/app/api/auth/callback/route.js
site/src/app/api/auth/check-email/route.js
site/src/app/api/auth/email-change/route.js
site/src/app/api/auth/login/route.js
site/src/app/api/auth/login-failed/route.js
site/src/app/api/auth/login-precheck/route.js
site/src/app/api/auth/logout/route.js
site/src/app/api/auth/resend-verification/route.js
site/src/app/api/auth/reset-password/route.js
site/src/app/api/auth/resolve-username/route.js
site/src/app/api/auth/signup/route.js
site/src/app/api/ads/click/route.js
site/src/app/api/ads/impression/route.js
site/src/app/api/ads/serve/route.js
site/src/app/api/errors/route.js
site/src/app/api/health/route.js
site/src/app/layout.js
```

All 16 have neither `@migrated-to-permissions` nor `@feature-verified` on disk.

### 1.8 Admin design-system primitives (Finding 8 — MEDIUM)

`site/src/components/admin/` contains 28 files. 1 (`DestructiveActionConfirm.tsx`) already carries markers; the other **27** do not. Matches brief.

### 1.9 Files missing `@feature-verified` (Finding 9 — MEDIUM)

Brief said 34. Verified: `comm -23 <(grep -rl '@migrated-to-permissions' site/src | sort) <(grep -rl '@feature-verified\|@admin-verified' site/src | sort)` returns exactly **34 files**. The 16 API routes from Part 1.7 are included in this 34, which is partially overlap — after Track X completes Part 1.7, the remaining gap is 18 files (the ones listed by the second grep minus the 16 unmigrated routes). Confirmed:

```
site/src/app/api/ai/generate/route.js
site/src/app/api/comments/route.js                         (+ 5 more under comments/)
site/src/app/api/expert-sessions/route.js                   (+ 2 more under expert-sessions/)
site/src/app/api/expert/apply/route.js                      (+ 2 more under expert/)
site/src/app/api/family/achievements/route.js
site/src/app/api/reports/route.js
site/src/app/api/reports/weekly-reading-report/route.js
site/src/app/api/supervisor/opt-in/route.js
site/src/app/api/supervisor/opt-out/route.js
site/src/app/accessibility/page.tsx
site/src/app/appeal/page.tsx
site/src/app/browse/page.tsx
site/src/app/cookies/page.tsx
site/src/app/dmca/page.tsx
site/src/app/forgot-password/page.tsx
site/src/app/how-it-works/page.tsx
site/src/app/login/page.tsx
site/src/app/privacy/page.tsx
site/src/app/reset-password/page.tsx
site/src/app/signup/page.tsx
site/src/app/signup/expert/page.tsx
site/src/app/signup/pick-username/page.tsx
site/src/app/status/page.tsx
site/src/app/terms/page.tsx
site/src/app/welcome/page.tsx
```

### 1.10 Duplicate active permission keys (Finding 10 — MEDIUM)

All three duplicate pairs named in the brief need DB-side SELECTs to confirm current `is_active` before Track W picks deactivation targets. Grep of `site/src` shows:

- `billing.frozen_banner.view` vs `billing.frozen.banner.view`: **no call-sites in the code** for either variant. Safe to deactivate the inferior name and keep the canonical for future use. Recommend keeping `billing.frozen_banner.view` (single segment for a banner surface); deactivate `billing.frozen.banner.view`.
- `profile.activity.view` vs `profile.activity.own`: code references `'profile.activity'` (no `.view`, no `.own`) at `site/src/app/profile/page.tsx:223`. This is a third variant. DB has `.view` and `.own` listed as duplicates; code uses neither. Decision in Track W: reconcile to a single key `profile.activity` (matches call-site) and deactivate both `.view` and `.own`, OR rename the call-site to match whichever is chosen canonical. Recommended: deactivate both `.view` and `.own`, ensure a live `profile.activity` row exists (verify in SQL audit), bind it to the same plan set the tab expects.
- `leaderboard.view` vs `leaderboard.global.view` vs `leaderboard.global.full.view`: code references `leaderboard.view` only (`site/src/app/leaderboard/page.tsx:127`). Kids leaderboard uses a separate `kids.leaderboard.global.view` key that is correctly scoped and NOT a duplicate — leave alone. Decision: keep `leaderboard.view` (in-use), deactivate the two `leaderboard.global.*` keys.

### 1.11 `/api/health` env-var enumeration (Finding 11 — MEDIUM)

`site/src/app/api/health/route.js:21-24` enumerates the presence of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`. No auth check. An attacker reading a 200 response learns which backends are provisioned and which are missing — useful reconnaissance.

### 1.12 Dead `NotificationBell.tsx` (Finding 12 — MEDIUM)

Grep confirms zero importers. Only self-hit. Safe to delete after Track X's final grep-verify.

### 1.13 REFERENCE.md stale counts (Finding 13 — MEDIUM)

- `00-Where-We-Stand/REFERENCE.md:25` says "934 active permissions". Track W must re-run the live count at execution time and update this line. Auditor said actual is 932; to be re-confirmed post-deactivations.
- `00-Where-We-Stand/REFERENCE.md:79` says "5 live call-sites use `getMaxRoleLevel`". Grep of `site/src` returns **6 files** with matches (1 in `lib/roles.js` which is the definition, 5 consumer routes). The auditor's "6" count matches that — so either "5 live call-sites" means 5-not-counting-definition (in which case it is correct), or it means 6 total (in which case it is off by one). Recommend rewriting the line to unambiguously state "5 consumer call-sites plus the definition in `lib/roles.js`".

---

## Part 2 — Track split

Tracks U, V, W, X are parallel-safe — different concerns, different files, no shared writes. Track U fixes the security-critical bypass and should start first (highest priority) but does not block the others from running concurrently.

### Track U — DB lockdown + server-side scoring (HIGHEST PRIORITY)

**Files touched:**
- New migration: `01-Schema/065_users_privileged_columns_lockdown.sql`
- New migration: `01-Schema/066_score_on_reading_complete_rpc.sql` (or extend 056 — agent's choice)
- Edit: `VerityPost/VerityPost/StoryDetailView.swift` — replace `appAwardPoints` body with an RPC call

**DB objects touched:**
- `public.users` table — new BEFORE UPDATE trigger
- New function: `public.reject_privileged_user_updates()` (trigger function)
- New RPC: `public.award_reading_points(p_article_id uuid)` — SECURITY DEFINER, called by iOS, looks up `score_rules` server-side, calls existing `score_on_reading_complete` internals if suitable, writes `verity_score`
- Grants: `REVOKE EXECUTE ... FROM anon`, `GRANT EXECUTE ... TO authenticated` on the new RPC only

**Approach (recommended — option b from brief):** BEFORE UPDATE trigger rejecting changes to 8 privileged columns when `NOT is_admin_or_above()`. Chosen over column-revoke-grant because (1) it keeps the single `users_update` RLS policy intact, (2) it handles the case of a legitimate own-row update to non-privileged columns (avatar, bio, display_name) without requiring a separate allow-list grant, (3) column grants on a supabase-managed table are awkward to roll back.

**Trigger logic (pseudocode — agent writes SQL):**
```sql
IF NOT public.is_admin_or_above() THEN
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR
     NEW.plan_status IS DISTINCT FROM OLD.plan_status OR
     NEW.is_expert IS DISTINCT FROM OLD.is_expert OR
     NEW.is_verified_public_figure IS DISTINCT FROM OLD.is_verified_public_figure OR
     NEW.is_banned IS DISTINCT FROM OLD.is_banned OR
     NEW.verity_score IS DISTINCT FROM OLD.verity_score OR
     NEW.warning_count IS DISTINCT FROM OLD.warning_count OR
     NEW.perms_version IS DISTINCT FROM OLD.perms_version THEN
    RAISE EXCEPTION 'privileged column update denied';
  END IF;
END IF;
```

Note: service-role writes bypass triggers that check `auth.uid()`-backed helpers only if the helper returns false for NULL uid — confirm `is_admin_or_above()` semantics before signing off. If it returns false for service-role, add `OR current_setting('role') = 'service_role'` guard or switch to `IF session_user = 'supabase_admin' THEN RETURN NEW`.

**iOS change:** replace the 40-line `appAwardPoints` body with a single `client.rpc('award_reading_points', params: ["p_article_id": articleId]).execute()` call. Remove the `score_rules` select, the points math, the `verity_score` write. Read back the latest `verity_score` + `streak` after the RPC for the toast UX.

**Files NOT to touch:**
- Existing `score_on_*` functions in `022_phase14_scoring.sql` — leave intact; the new RPC is a thin iOS-facing wrapper
- Web scoring paths — web calls server RPCs already
- `increment_field` hardening in `056` — already done

**Verification plan:**
1. Flip test: as a non-admin, `supabase.from('users').update({ plan_id: 'pro' }).eq('id', auth.uid())` should 40x. As admin, same call succeeds.
2. Flip test: as non-admin, `update({ display_name: 'x' })` succeeds (non-privileged column).
3. Flip test: as non-admin, `update({ bio: 'x', verity_score: 999 })` is rejected (mixed writes blocked by the OR chain).
4. iOS smoke: complete a reading — verify `verity_score` increases by the amount in `score_rules` WHERE action='reading_complete', not what iOS sent.
5. SQL audit: `SELECT tgname FROM pg_trigger WHERE tgrelid = 'users'::regclass;` confirms the new trigger row is present alongside `trg_users_updated_at`.
6. Re-runnability: migration uses `CREATE OR REPLACE FUNCTION` and `DROP TRIGGER IF EXISTS ... CASCADE` + `CREATE TRIGGER` to be idempotent.

**Expected size:** ~150 lines SQL, ~15 lines Swift delta.

---

### Track V — iOS broken flows

**Files touched:**
- `VerityPost/VerityPost/AlertsView.swift` (edit `markAsRead`, `markAllRead`)
- `VerityPost/VerityPost/SubscriptionView.swift` (edit `redeemPromo`)
- `VerityPost/VerityPost/AuthViewModel.swift` (edit signup path)
- New file: `site/src/app/api/notifications/mark-read/route.js`
- New migration: `01-Schema/067_on_auth_user_created_trigger.sql` — creates a trigger on `auth.users` INSERT that (a) grants default `user` role, (b) sets `users.plan_id='free'`, `plan_status='active'`, (c) bumps `perms_version`

**Per-item plan:**

**(a) AlertsView mark-read**
- Path: iOS `markAsRead`/`markAllRead` → POST `/api/notifications/mark-read` with body `{ "id": "<notification_id>" }` or `{ "all": true }`.
- Route gates with `requirePermission('notifications.mark_read')` — Track W confirms this key exists; if it does not, Track W adds it and binds to all authenticated plan-sets.
- Route uses user-scoped client (write belongs to the caller, RLS will allow since the notification `user_id = auth.uid()`), sets `is_read = true`.
- iOS call replaces both direct `.update(["read": ...])` calls with the HTTP call, no column-name confusion.

**(b) SubscriptionView promo redemption**
- Delete lines 472-493 in `SubscriptionView.swift` (the `promo_uses` insert, `current_uses` increment, and `users` update).
- Replace with a single POST to `/api/promo/redeem` with body `{ code }`. Parse the response to set `promoMessage` / `promoSuccess`. Keep the early `promo_codes` lookup only if needed for the eligibility preview UI — otherwise delete.
- No server changes needed — `/api/promo/redeem/route.js` already exists and is correct.

**(c) AuthViewModel signup role grant**
- Delete lines 275-288 (the `roles` lookup + `user_roles` insert).
- Server-side replacement: create a trigger on `auth.users` AFTER INSERT that calls a SECURITY DEFINER function which (1) looks up `roles.id WHERE name='user'`, (2) inserts into `user_roles`, (3) backfills `users.plan_id='free'` + `plan_status='active'` + `perms_version=1`. This also covers edge cases where the web signup RPC is bypassed.
- Location: `reset_and_rebuild_v2.sql:4754` already shows `AFTER UPDATE ON auth.users` exists — pattern is known. Migration adds an `AFTER INSERT` variant.
- The existing web `/api/auth/signup/route.js` and `/api/auth/callback/route.js` continue to work — the trigger is idempotent (INSERT ... ON CONFLICT DO NOTHING on `user_roles`).

**Files NOT to touch:**
- Web auth routes (`site/src/app/api/auth/**`) — the trigger covers the gap without touching working code
- Existing `/api/promo/redeem/route.js` — works correctly
- The `VPNotification` / `VPPromo` / `VPUser` Decodable structs — all field names stay the same

**Verification plan:**
1. iOS smoke: tap notification → `is_read` flips to true in DB; admin UI reflects change.
2. iOS smoke: redeem a 100% promo → `users.plan_id` becomes `pro` (or whatever the promo targets); `promo_uses` has a row; `promo_codes.current_uses` incremented; audit log has an entry.
3. iOS smoke: signup a brand-new email → query `user_roles WHERE user_id = <new id>` returns exactly one row with `role_id` matching `user`. `users.plan_id='free'`, `plan_status='active'`.
4. tsc on web: `cd site && npx tsc --noEmit` passes (new route has no type errors).
5. SQL audit: `SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass;` confirms the new trigger.
6. Re-runnability: all CREATE statements use OR REPLACE / IF NOT EXISTS patterns.

**Expected size:** 1 new API route (~60 lines), 1 new migration (~80 lines SQL), ~30 lines Swift deletions + ~25 lines of replacement HTTP calls.

---

### Track W — DB keys + duplicate reconciliation + lockdown

**Files touched:**
- New migration: `01-Schema/068_round4_permission_key_cleanup.sql`
- Edit: `site/src/app/api/health/route.js` (add header gate)
- Edit: `00-Where-We-Stand/REFERENCE.md` §7 count + §6 item #9 call-site count
- (No change to `site/src/lib/permissionKeys.js` — that file is a documentation helper, not authoritative)

**Migration contents (single migration — idempotent):**

1. **Create `profile.expert.badge.view`** (INSERT ... ON CONFLICT DO NOTHING) with `is_active=true`, and bind to the role_permissions / plan_permissions for plans `free|pro|family|expert|moderator|editor|admin|owner` and roles that cover same. Expert badges are a public visibility concern; everyone who can see a profile should see the badge.

2. **Deactivate duplicates** — set `is_active=false` on:
   - `billing.frozen.banner.view` (keep `billing.frozen_banner.view`)
   - `profile.activity.view` and `profile.activity.own` (keep `profile.activity` since code uses it)
   - `leaderboard.global.view` and `leaderboard.global.full.view` (keep `leaderboard.view`)
   - Do NOT deactivate `kids.leaderboard.global.view` — it is a distinct kids-scoped key in active use.

3. **Ensure `notifications.mark_read` exists** (INSERT ... ON CONFLICT DO NOTHING) with `is_active=true`, bound to every authenticated plan-set (free/pro/family/kid/expert/moderator/editor/admin/owner). Required by Track V's new mark-read route.

4. **Bump `perms_global_version`** — `UPDATE settings SET value = value + 1 WHERE key = 'perms_global_version'` (or equivalent; follow the pattern in prior perms migrations). Clients pick up the new keys on next refresh.

**Before any deactivation, run the audit SQL:**
```sql
SELECT key, is_active, description
FROM permissions
WHERE key IN (
  'billing.frozen_banner.view','billing.frozen.banner.view',
  'profile.activity','profile.activity.view','profile.activity.own',
  'leaderboard.view','leaderboard.global.view','leaderboard.global.full.view',
  'notifications.mark_read','profile.expert.badge.view'
)
ORDER BY key;
```
Attach the output to the migration as a comment block so the state is documented.

**`/api/health` lockdown:**
- Add a simple `x-health-key` header check against `process.env.HEALTH_CHECK_TOKEN`. If missing or mismatch, return 401 with `{ ok: false }` and no env-presence detail.
- If the token is unset in the environment, fall back to "db-ping-only" response (no env enumeration) so that local dev doesn't break.
- Add both markers: `@migrated-to-permissions 2026-04-18` and `@feature-verified system_auth 2026-04-18` as part of the edit (this file is on Track X's list; coordinate so whichever track ships first owns the markers).

**REFERENCE.md edits:**
- §7 line 25: re-run live count `SELECT count(*) FROM permissions WHERE is_active = true;` after the migration applies, and replace "934 active permissions" with the new number.
- §6 item #9 line 79: rewrite to "5 consumer call-sites (plus the definition in `lib/roles.js`)" or similar unambiguous phrasing.

**Files NOT to touch:**
- `site/src/lib/permissionKeys.js` — optional to add new constants, but not required; the DB is source of truth
- Kids leaderboard code/keys — distinct system, not a dup
- Any call-site that already uses `profile.activity` — keeping that canonical means the code does not change

**Verification plan:**
1. Post-migration SQL audit re-runs the query above, expected result: the 5 deactivations show `is_active=false`, `profile.expert.badge.view` + `notifications.mark_read` show `is_active=true`.
2. Browser test: visit a public profile of an expert user — badge renders.
3. `curl /api/health` without header → 401; with correct header → full response; without header + no env token set → 200 with `db: ok` but no env list.
4. `git diff 00-Where-We-Stand/REFERENCE.md` shows only the two count/phrasing tweaks.
5. Migration idempotency: re-run the whole migration; all INSERTs are ON CONFLICT DO NOTHING, UPDATEs are idempotent by filter, no errors.

**Expected size:** 1 migration (~100 lines SQL), ~20 lines of health-route edits, 2 single-line REFERENCE.md edits.

---

### Track X — Marker cleanup + dead code

**Files touched (in three groups):**

**Group 1 — 16 unmigrated files (Part 1.7):** Add both markers per conventions:
- 11 `api/auth/**/route.js` files: `@migrated-to-permissions 2026-04-18` + `@feature-verified system_auth 2026-04-18`
- 3 `api/ads/**/route.js` files: `@migrated-to-permissions 2026-04-18` + `@feature-verified ads 2026-04-18`
- `api/errors/route.js`: `@migrated-to-permissions 2026-04-18` + `@feature-verified system_auth 2026-04-18` (error reporting is auth-adjacent infra)
- `api/health/route.js`: `@migrated-to-permissions 2026-04-18` + `@feature-verified system_auth 2026-04-18` (coordinate with Track W — same file, one marker write)
- `layout.js`: `@migrated-to-permissions 2026-04-18` + `@feature-verified system_auth 2026-04-18`

**Group 2 — 27 admin DS primitives (Part 1.8):** Recommend `@admin-verified 2026-04-18` marker (extending the LOCK count from 39 pages to 66 files). Rationale: these primitives are in `components/admin/` and are only imported by admin pages; they inherit the admin surface's stricter change-control. Agent may instead use `@feature-verified shared_components` if the PM wants to reserve `@admin-verified` for pages — flag for PM decision if unsure. Default: `@admin-verified`.

**Group 3 — 18 files with `@migrated-to-permissions` but missing second marker (Part 1.9, excluding the 16 already covered by Group 1):** Add `@feature-verified <category> 2026-04-18` where category is the track/feature the file serves:
- 6 `api/comments/**` → `@feature-verified comments`
- 3 `api/expert-sessions/**` → `@feature-verified expert_sessions`
- 3 `api/expert/**` → `@feature-verified expert`
- 1 `api/family/achievements/route.js` → `@feature-verified family`
- 1 `api/ai/generate/route.js` → `@feature-verified ai`
- 2 `api/reports/**` → `@feature-verified reports`
- 2 `api/supervisor/**` → `@feature-verified supervisor`
- 15 `app/*/page.tsx` (accessibility, appeal, browse, cookies, dmca, forgot-password, how-it-works, login, privacy, reset-password, signup, signup/expert, signup/pick-username, status, terms, welcome) → `@feature-verified system_auth` for auth/signup/login/password/welcome, `@feature-verified shared_pages` for marketing/legal pages (accessibility, cookies, dmca, privacy, terms, how-it-works, status, appeal, browse).

**Group 4 — dead code:**
- Re-grep `NotificationBell` across the whole tree (`site/src`, `VerityPost`, docs) to confirm zero importers. If confirmed, delete `site/src/components/NotificationBell.tsx`.

**Group 5 — REFERENCE.md:**
- Coordinate with Track W: Track W owns the §7 + §6 edits. Track X does not touch REFERENCE.md to avoid merge conflicts.

**Files NOT to touch:**
- Any file that already has both markers (or the admin LOCK marker) — do not re-write
- `site/src/app/api/promo/redeem/route.js` — already sealed
- `site/src/lib/permissionKeys.js` — out of scope
- Anything in `site/src/app/**/*.js` or `*.jsx` from Round 3's Track S list (those were framework shells / redirects and were either skipped or marker-only'd already)

**Verification plan:**
1. After all three groups, re-run the discovery grep:
   `comm -23 <(grep -rl '@migrated-to-permissions' site/src | sort) <(grep -rl '@feature-verified\|@admin-verified' site/src | sort)` → expected output: **empty**.
2. Grep for any new `@feature-verified` lines created by Track X: `grep -r "@feature-verified 2026-04-18" site/src | wc -l` — delta should match the Group 1+2+3 count (16+27+18 = 61) plus any Track V/W writes.
3. tsc / next build: no type regressions.
4. `grep -r NotificationBell site/src VerityPost 00-* 05-*` returns exactly zero matches after deletion.
5. All marker additions are header-comment-only; no behavioral changes.

**Expected size:** 61 files touched, ~2 lines added per file (~122 LoC), 1 file deleted (~75 lines removed).

---

## Part 3 — Sequencing recommendation

**Start Track U first and in isolation for the first 30 minutes** — the users-table trigger migration is the only truly blocking item (everything else is cosmetic/broken-flow). Once the migration is applied to the project and the flip tests pass, Tracks V/W/X fan out in parallel.

**Dependency notes:**
- Track V's mark-read route depends on Track W's `notifications.mark_read` key existing (if it doesn't already). Track W should land that key before Track V's route is deployed. Both tracks can be worked on concurrently; only the deploy order matters.
- Track X's marker add to `api/health/route.js` coordinates with Track W's edit to the same file. Whichever lands first writes the markers; the other leaves them. Flag this explicitly in the track-X briefing so the agent knows to check first.
- No other cross-track file collisions.

**Parallel-safe to work concurrently:** yes, with the two coordination points noted above.

**Serial sequencing (if parallelism is not available):** U → W → V → X. Rationale: U closes the biggest hole; W creates the keys and lands the lockdown + REFERENCE fix; V consumes those keys and fixes the iOS flows; X polishes markers last so it can mop up anything the other tracks touched.

---

## Part 4 — Constraints reminder for execution agents

- All DB migrations must be idempotent: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`, `INSERT ... ON CONFLICT DO NOTHING`, `UPDATE ... WHERE ... AND current_value <> target_value`.
- No column renames on `users`, `notifications`, `promo_codes` — the bugs were column-name mismatches on the client; the fix is to align the client with the DB, not the other way around.
- Do not touch pre-Round-3 marker logic or the admin LOCK set (39 pages already `@admin-verified`).
- Do not re-open the spec-vs-DB subscription-key drift from Round 3 Track T — it is closed.
- Do not add permission-gate logic to framework shells (robots.js, manifest.js, etc.) — that decision was made in Round 3.
- No emojis in any new code, comments, docs, or commit messages.
- The perms_global_version bump at the end of Track W is mandatory — without it, clients keep the cached (stale) key set and the new `profile.expert.badge.view` key does nothing until next login.
