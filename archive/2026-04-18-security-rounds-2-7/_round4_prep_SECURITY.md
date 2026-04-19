# Round 4 Prep — SECURITY PACKAGE (Tracks U + V)

**Prepper:** PREPPER 1 of 2
**Executor:** EXECUTOR 1
**Scope:** Tracks U (DB lockdown + server-side scoring) and V (iOS broken flows)
**Working dir:** `/Users/veritypost/Desktop/verity-post`
**Supabase project:** `fyiwulqphgmoqullmrfn`
**Date:** 2026-04-18

Parallel package (do not touch): PREPPER 2 handles Tracks W (permission key cleanup + `/api/health` lockdown + REFERENCE.md count fixes) and X (marker cleanup + dead `NotificationBell.tsx` deletion).

---

## Part 0 — Validation summary (did not trust master prep)

All claims in `_round4_prep.md` Parts 1.1, 1.2, 1.3, 1.4, 1.5 were re-verified against the live DB and source tree. Deltas vs the master prep below:

1. **Line numbers drift.** Master prep quoted `AlertsView.swift:494-510` and `512-528`; actual is **494-510** (markAsRead) and **512-528** (markAllRead) — exact match. Master prep quoted `SubscriptionView.swift:481-493`; actual redeemPromo function starts at **400**, with the broken writes spanning **472-493** (`promo_uses` insert at 472-478, `current_uses` increment at 481-484, `users` plan write at 487-493). Master prep quoted `AuthViewModel.swift:281`; actual `user_roles` insert spans **281-287** (prefaced by a `RoleRow` fetch at 275-279). Master prep quoted `StoryDetailView.swift:1753-1790`; confirmed exact.

2. **`appAwardPoints` is dead code in iOS.** Grep across `VerityPost/` and the whole tree returns exactly **one** match — the definition at `StoryDetailView.swift:1753`. **No call-site.** Fix is still worth doing (the code is a loaded gun), but this moves from CRITICAL-in-prod to CRITICAL-in-future-ship.

3. **`PATCH /api/notifications` already exists and already does mark-read.** File `site/src/app/api/notifications/route.js:38-69` exports a PATCH handler gated on `requirePermission('notifications.mark_read')`, uses the service client, accepts both `{ ids: [...] }` and `{ all: true }`, writes `is_read=true, read_at=now, is_seen=true, seen_at=now`. **The master prep told us to build a new `/api/notifications/mark-read` route. That is wrong — reuse the existing PATCH.** Track V just needs iOS to call it.

4. **`on_auth_user_created` AFTER INSERT trigger on `auth.users` already exists** (calls `public.handle_new_auth_user()`). It already inserts into `public.users (id, email, email_verified, email_verified_at, plan_status, locale)` with `ON CONFLICT DO NOTHING` and — critically — **does NOT seed `user_roles`** except for the very first user (who gets `owner`). Master prep proposed adding a new trigger; the correct move is to **extend the existing `handle_new_auth_user()` function** to also seed the default `user` role via `user_roles`.

5. **Privileged columns on `users` — final list is 9, not 8.** Master prep said 7 and then said 8 once `plan_status` was added. Actual set that a self-escalator would want: `plan_id`, `plan_status`, `is_expert`, `is_verified_public_figure`, `is_banned`, `is_shadow_banned`, `verity_score`, `warning_count`, `perms_version`. (Also candidates but lower-value: `frozen_at`, `frozen_verity_score`, `plan_grace_period_ends_at`, `mute_level`, `is_active`, `ban_reason`, `banned_at`, `banned_by`, `muted_until`, `kid_trial_used`, `kid_trial_started_at`, `kid_trial_ends_at`, `deletion_scheduled_for`, `deletion_completed_at`, `stripe_customer_id`, `referral_code`, `streak_best`.) Recommended core list for the trigger: the 9 above. Optional expansion: add `frozen_at`, `frozen_verity_score`, `plan_grace_period_ends_at`, `mute_level`, `is_active`, `ban_reason`, `banned_at`, `banned_by`, `muted_until`, `stripe_customer_id`, `deletion_scheduled_for`, `deletion_completed_at`. See Track U fix design below for the full recommended set.

6. **`is_admin_or_above()` returns FALSE for service-role calls.** Confirmed by running `SELECT auth.uid()` as the service connection — it returns NULL. `is_admin_or_above()` wraps `user_has_role('admin')` which joins on `user_roles WHERE user_id = auth.uid()` → NULL uid → EXISTS returns false. **This means a naive `IF NOT is_admin_or_above() THEN RAISE` trigger would block legitimate service_role + webhook + trigger writes.** The trigger MUST also exempt superuser / `supabase_admin` / `service_role`. See the exact check in the Track U SQL below.

7. **`notifications.mark_read` and `notifications.mark_all_read` permission keys both exist and are active** (SELECT confirmed; `is_active=true`). No coordination needed with Prepper 2 on key creation for V.1.

8. **`promo_codes` column audit matches master prep.** Real columns: `applies_to_plans` (not `applicable_plans`), `duration_months` (not `duration_days`), `discount_type`, `discount_value`. The iOS `PromoCode` struct at `SubscriptionView.swift:416-425` decodes `plan`, `duration_days`, `active` — none of which exist. The decode silently fails / returns empty; the whole redeem flow is dead even before the broken writes. This reinforces "delete the client path, call `/api/promo/redeem`".

9. **Separate latent bug flagged (NOT in scope — do not fix):** `/api/promo/redeem/route.js:88` reads `promo.applicable_plans?.[0]` — the DB column is `applies_to_plans`. Any 100% promo will 400 with "This promo is not tied to a specific plan." until renamed. Flag this to the PM / Round 5.

---

## Part 1 — Track U: DB lockdown + server-side scoring

### U.1 — Validated RLS and policy state on `public.users`

Query run:
```sql
SELECT polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
FROM pg_policy WHERE polrelid = 'public.users'::regclass;
```
Result:
- `users_insert` WITH CHECK `(id = auth.uid())`
- `users_select` USING `((id = auth.uid()) OR ((profile_visibility)::text = 'public'::text) OR is_admin_or_above())`
- `users_update` USING `((id = auth.uid()) OR is_admin_or_above())` — **no WITH CHECK clause.**

Column-level grants for `authenticated` on `public.users` — **94 columns all have UPDATE** (all columns on the table; no column-level revoke has been applied). `anon` is SELECT-only. `service_role` has full INSERT/UPDATE/SELECT/REFERENCES.

Existing triggers on `public.users` (non-internal):
- `trg_users_updated_at` — BEFORE UPDATE, sets `updated_at`. That is all.

**Conclusion:** Exploit confirmed exactly as the master prep described. Any authenticated user can `UPDATE users SET plan_id='<pro plan uuid>', is_expert=true, verity_score=999999, perms_version=0, is_banned=false WHERE id = auth.uid()` via direct PostgREST PATCH. RLS accepts because `id = auth.uid()`. No trigger intervenes.

### U.2 — Validated `appAwardPoints` state

```
VerityPost/VerityPost/StoryDetailView.swift:1753  private func appAwardPoints(userId: String, action: String) async {
```

Body spans 1753–1790. Writes `users.verity_score` directly on line 1764 through `client.from("users").update(ScoreUpdate(verity_score: newScore))`. **Grep confirms zero call-sites.** No `appAwardPoints(` invocations anywhere in `VerityPost/` or `site/`. Function is dormant.

Existing scoring infra on the DB:
- `score_on_reading_complete(p_user_id uuid, p_kid_profile_id uuid, p_article_id uuid, p_reading_log_id uuid)` — SECURITY DEFINER, returns jsonb `{awarded, points, reason, streak}`. Calls `award_points('read_article', ...)` and `advance_streak(...)`. Does all the server-side work correctly: `score_rules` lookup, cap enforcement (`max_per_day=50`, `max_per_article=1`), ledger insert into `score_events` with unique-violation replay guard, updates `users.verity_score`, `category_scores`, streak tables, etc.
- `reading_log` table columns: `id, user_id, kid_profile_id, article_id, session_id, read_percentage, time_spent_seconds, completed, source, referrer_url, device_type, points_earned, created_at, updated_at`.
- `score_rules` entries for `read_article`: 5 points, max_per_day=50, max_per_article=1, is_active=true. (No row for `reading_complete` — the action key is `read_article`.)

Gap: `score_on_reading_complete` requires a `p_reading_log_id` that the iOS client does not have. The iOS client never writes to `reading_log`. The correct new RPC is a thin wrapper that writes the `reading_log` row AND calls `score_on_reading_complete`, returning the scoring result.

### U.3 — Fix design — Track U (CHOICE and JUSTIFICATION)

**Choice: Option B — BEFORE UPDATE trigger rejecting privileged-column mutations when caller is not admin/service-role.**

Justification:
- **Option A** (REVOKE UPDATE on privileged columns) is fiddly — Supabase's PostgREST reacts to column-level permissions by returning 403 on the whole request if any column in the PATCH is revoked, which breaks legitimate mixed writes (e.g. iOS writing `avatar_url` + `bio`). Column grants on a Supabase-managed table are also awkward to roll back and easy for future migrations to wipe when a new column is added.
- **Option B** is one trigger function, one trigger, scoped exactly to privileged columns, with explicit handling of the service-role bypass. Keeps the single `users_update` RLS policy intact. Non-privileged writes (avatar, bio, display_name, timezone, locale, notification toggles, etc.) flow through unchanged.
- Critical refinement over the master prep: the trigger MUST exempt service-role and superuser, because `is_admin_or_above()` returns false when `auth.uid()` is NULL (confirmed by live SELECT). Without the exemption, the existing `handle_new_auth_user` trigger and every backend service path would start failing.

### U.4 — Track U migration 1: `restrict_users_table_privileged_updates_2026_04_19`

Idempotent. Creates `public.reject_privileged_user_updates()` trigger function + `trg_users_reject_privileged_updates` BEFORE UPDATE trigger on `public.users`.

Privileged column set (9 core — non-negotiable):
- `plan_id`
- `plan_status`
- `is_expert`
- `is_verified_public_figure`
- `is_banned`
- `is_shadow_banned`
- `verity_score`
- `warning_count`
- `perms_version`

Extended set (recommended — shut every audit escalation path):
- `ban_reason`, `banned_at`, `banned_by`
- `muted_until`, `mute_level`
- `frozen_at`, `frozen_verity_score`
- `plan_grace_period_ends_at`
- `is_active`
- `stripe_customer_id`
- `deletion_scheduled_for`, `deletion_completed_at`
- `streak_best` (score-adjacent; users shouldn't be able to overwrite their own lifetime peak)

Executor decision: ship with the **full extended set**. There is no legitimate iOS or web user-scoped write to any of these today. If a future flow needs one, it can be added to an allow-list RPC.

Exact SQL — write exactly this (executor may adjust column set but keep structure):

```sql
-- Migration: restrict_users_table_privileged_updates_2026_04_19
-- Prevents self-escalation via direct UPDATEs on public.users
-- by authenticated callers. Service-role and admins are exempt.

CREATE OR REPLACE FUNCTION public.reject_privileged_user_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Exempt:
  --   1. Trigger runs initiated by service_role / postgres / supabase_admin
  --      (auth.uid() is NULL in those paths; is_admin_or_above() returns false
  --      because it joins on user_roles WHERE user_id = auth.uid()).
  --   2. Authenticated callers with admin or higher role.
  IF auth.uid() IS NULL
     OR current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')
     OR public.is_admin_or_above() THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan_status IS DISTINCT FROM OLD.plan_status
     OR NEW.is_expert IS DISTINCT FROM OLD.is_expert
     OR NEW.is_verified_public_figure IS DISTINCT FROM OLD.is_verified_public_figure
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
     OR NEW.is_shadow_banned IS DISTINCT FROM OLD.is_shadow_banned
     OR NEW.verity_score IS DISTINCT FROM OLD.verity_score
     OR NEW.warning_count IS DISTINCT FROM OLD.warning_count
     OR NEW.perms_version IS DISTINCT FROM OLD.perms_version
     OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
     OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
     OR NEW.banned_by IS DISTINCT FROM OLD.banned_by
     OR NEW.muted_until IS DISTINCT FROM OLD.muted_until
     OR NEW.mute_level IS DISTINCT FROM OLD.mute_level
     OR NEW.frozen_at IS DISTINCT FROM OLD.frozen_at
     OR NEW.frozen_verity_score IS DISTINCT FROM OLD.frozen_verity_score
     OR NEW.plan_grace_period_ends_at IS DISTINCT FROM OLD.plan_grace_period_ends_at
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.deletion_scheduled_for IS DISTINCT FROM OLD.deletion_scheduled_for
     OR NEW.deletion_completed_at IS DISTINCT FROM OLD.deletion_completed_at
     OR NEW.streak_best IS DISTINCT FROM OLD.streak_best THEN
    RAISE EXCEPTION 'privileged column update denied for user %', auth.uid()
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_users_reject_privileged_updates ON public.users;
CREATE TRIGGER trg_users_reject_privileged_updates
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.reject_privileged_user_updates();

-- Sanity: revoke PUBLIC on the function, grant execute to authenticated so
-- RAISE EXCEPTION surfaces as a proper PostgREST error (not a silent grant
-- error).
REVOKE ALL ON FUNCTION public.reject_privileged_user_updates() FROM PUBLIC;
```

Note on `current_user` list:
- `postgres` — pg superuser, used by manual SQL execution.
- `supabase_admin` — Supabase internal superuser role.
- `service_role` — PostgREST service-key role.
- `supabase_auth_admin` — the role under which `auth` schema triggers run (important because `handle_auth_user_updated` and `handle_new_auth_user` write to `public.users`).

Confirmed via `SELECT current_user, session_user` run as the service connection: both return `postgres`. That alone would pass the check; we whitelist all four to be safe across connection paths.

### U.5 — Track U migration 2: `add_award_reading_points_rpc_2026_04_19`

New RPC `public.award_reading_points(p_article_id uuid)`. SECURITY DEFINER. Writes a `reading_log` row (if none exists today for this user+article), then calls `score_on_reading_complete(auth.uid(), NULL, p_article_id, reading_log.id)`. Returns the jsonb from the scorer.

```sql
-- Migration: add_award_reading_points_rpc_2026_04_19
-- Server-authoritative replacement for StoryDetailView.appAwardPoints.

CREATE OR REPLACE FUNCTION public.award_reading_points(p_article_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_log_id uuid;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_article_id IS NULL THEN
    RAISE EXCEPTION 'article_id required' USING ERRCODE = '22023';
  END IF;

  -- One completed reading_log per user + article is enough for scoring
  -- (score_on_reading_complete caps at max_per_article=1 anyway — this
  -- just avoids piling up identical rows).
  SELECT id INTO v_log_id
    FROM reading_log
   WHERE user_id = v_user AND article_id = p_article_id AND completed = true
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_log_id IS NULL THEN
    INSERT INTO reading_log (user_id, article_id, read_percentage, completed, source)
    VALUES (v_user, p_article_id, 100, true, 'ios')
    RETURNING id INTO v_log_id;
  END IF;

  v_result := public.score_on_reading_complete(v_user, NULL, p_article_id, v_log_id);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.award_reading_points(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_reading_points(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_reading_points(uuid) TO authenticated;
```

### U.6 — iOS change — `StoryDetailView.swift:1753-1790`

Replace the entire body of `appAwardPoints(userId:action:)` with:

```swift
private func appAwardPoints(userId: String, action: String) async {
    // action is legacy parameter; server uses the fixed 'read_article'
    // rule key via award_reading_points RPC. We pass the article id only.
    guard action == "read_article" else { return }
    let articleId = story.id
    let ss = SettingsService.shared
    do {
        struct Params: Encodable { let p_article_id: String }
        struct RPCResult: Decodable {
            let awarded: Bool?
            let points: Int?
            let streak: StreakPayload?
            struct StreakPayload: Decodable {
                let advanced: Bool?
                let streak: Int?
                let best: Int?
                let milestone: String?
            }
        }
        let result: RPCResult = try await client
            .rpc("award_reading_points", params: Params(p_article_id: articleId))
            .execute().value

        let awarded = result.awarded ?? false
        if awarded, ss.isEnabled("achievement_toasts", default: true) {
            // Optional: toast on newly unlocked achievement (server-side).
            struct A: Decodable { let id: String; let achievements: I; struct I: Decodable { let name: String? } }
            let recent: [A] = (try? await client.from("user_achievements")
                .select("id, achievements:achievement_id(name)")
                .eq("user_id", value: userId)
                .order("unlocked_at", ascending: false)
                .limit(1)
                .execute().value) ?? []
            if let latest = recent.first, let name = latest.achievements.name {
                achievementToastText = "Achievement: \(name)"
                showAchievementToast = true
                Task {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    await MainActor.run { showAchievementToast = false }
                }
            }
        }

        if ss.isEnabled("streak_celebration"),
           let streakInfo = result.streak,
           streakInfo.advanced == true,
           let current = streakInfo.streak {
            streakCount = current
            showStreakCelebration = true
            Task {
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                await MainActor.run { showStreakCelebration = false }
            }
        }
    } catch { Log.d("Award points error:", error) }
}
```

Notes for executor:
- The function still takes `userId` and `action` for call-site compatibility, though currently neither is referenced externally (it's unused). Keep the signature stable to avoid breaking any future caller.
- Do NOT change `client.rpc` calling convention — it matches other RPC calls in the app (e.g. check `HomeFeedSlots.swift` or `StoryDetailView.swift` existing `.rpc(` usage).
- Do NOT write to `users.verity_score` anywhere. All writes go through the RPC.

### U.7 — Track U verification plan

Before migration:
1. As a real test account (not admin), run via PostgREST:
   `UPDATE users SET verity_score = 999999 WHERE id = '<own uid>'` — should succeed (baseline confirmed exploitable).

After migration 1:
2. Same query → must return `42501 privileged column update denied`.
3. `UPDATE users SET display_name = 'test' WHERE id = '<own uid>'` → succeeds (non-privileged write still allowed).
4. `UPDATE users SET bio = 'x', verity_score = 999 WHERE id = '<own uid>'` → must fail (mixed write correctly rejected by the OR chain).
5. Sign up a brand new user via existing `auth.users` path → `handle_new_auth_user` trigger still works (writes `public.users` row under `supabase_auth_admin` role, bypasses our new trigger via the `current_user` whitelist).
6. As admin user (`is_admin_or_above()` returns true), run `UPDATE users SET plan_id = '<other user free>' WHERE id = '<other user uid>'` → succeeds.
7. SQL check:
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal;
   ```
   Expect two rows: `trg_users_updated_at`, `trg_users_reject_privileged_updates`.

After migration 2:
8. As a logged-in iOS test user, call `SELECT public.award_reading_points('<real article uuid>')`. Expect jsonb `{"awarded": true, "points": 5, "streak": {...}}`. Re-call → expect `{"awarded": false, "reason": "already_awarded"}` (or `max_per_article`). Either way `verity_score` increments by 5 only the first time.
9. Call the RPC as `anon` → 403 / access denied.
10. Re-run migration 1 and 2 — both must apply cleanly (idempotent: `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS ... CREATE TRIGGER`).

### U.8 — Track U rollback

If migration 1 breaks a legitimate flow, roll back with:
```sql
DROP TRIGGER IF EXISTS trg_users_reject_privileged_updates ON public.users;
DROP FUNCTION IF EXISTS public.reject_privileged_user_updates();
```
Document the blocking flow and redesign the trigger's whitelist. Do NOT loosen the privileged column set to fix a bug — fix the caller to use a proper admin/service path.

---

## Part 2 — Track V: iOS broken flows

### V.1 — `AlertsView.markAsRead` / `markAllRead`

**Validation:**
- `VerityPost/VerityPost/AlertsView.swift:494-510` — `markAsRead`: writes `["read": "true"]` on `notifications`.
- `VerityPost/VerityPost/AlertsView.swift:512-528` — `markAllRead`: writes `["read": "true"]`, filters by `.eq("read", value: false)`.
- Real column set on `notifications`: `id, user_id, type, title, body, image_url, action_url, action_type, action_id, sender_id, channel, priority, is_read, read_at, is_seen, seen_at, push_sent, push_sent_at, push_receipt, email_sent, email_sent_at, campaign_id, expires_at, metadata, created_at, updated_at`. **No `read` column.** Both calls return 400 with `column "read" of relation "notifications" does not exist`; `do { ... } catch { Log.d(...) }` swallows it.
- `notifications_update` RLS: `USING (user_id = auth.uid())` — users CAN update their own rows if they write the correct column name. Pure client-side fix is feasible.
- `notifications.mark_read` and `notifications.mark_all_read` keys both exist and `is_active=true`.

**Fix: route through existing `PATCH /api/notifications` (NOT a new `/api/notifications/mark-read` route).**

Why PATCH the existing: it already does exactly this work (`is_read`, `read_at`, `is_seen`, `seen_at`), is already gated with `requirePermission('notifications.mark_read')`, already accepts `{ ids }` or `{ all: true }`, uses the service client, and has a `MAX_IDS_PER_PATCH = 200` cap. Building a parallel mark-read endpoint would duplicate that surface for no benefit.

iOS change at `AlertsView.swift`:

Replace `markAsRead(_:)` (lines 494-510):

```swift
private func markAsRead(_ notif: VPNotification) async {
    guard !notif.isRead else { return }
    guard let session = try? await client.auth.session else { return }
    let siteUrl = SupabaseManager.shared.siteURL
    guard let url = URL(string: "/api/notifications", relativeTo: siteUrl) else { return }
    do {
        struct Body: Encodable { let ids: [String]; let mark: String }
        let payload = Body(ids: [notif.id], mark: "read")
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONEncoder().encode(payload)
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            Log.d("Mark read failed:", (response as? HTTPURLResponse)?.statusCode as Any)
            return
        }
        if let idx = notifications.firstIndex(where: { $0.id == notif.id }) {
            notifications[idx] = VPNotification(
                id: notif.id, userId: notif.userId, title: notif.title,
                body: notif.body, type: notif.type, read: true, link: notif.link, createdAt: notif.createdAt
            )
        }
    } catch {
        Log.d("Mark read error:", error)
    }
}
```

Replace `markAllRead()` (lines 512-528):

```swift
private func markAllRead() async {
    let unread = notifications.filter { !$0.isRead }
    guard !unread.isEmpty else { return }
    guard let session = try? await client.auth.session else { return }
    let siteUrl = SupabaseManager.shared.siteURL
    guard let url = URL(string: "/api/notifications", relativeTo: siteUrl) else { return }
    do {
        struct Body: Encodable { let all: Bool; let mark: String }
        let payload = Body(all: true, mark: "read")
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONEncoder().encode(payload)
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            Log.d("Mark all read failed:", (response as? HTTPURLResponse)?.statusCode as Any)
            return
        }
        notifications = notifications.map {
            VPNotification(id: $0.id, userId: $0.userId, title: $0.title,
                           body: $0.body, type: $0.type, read: true, link: $0.link, createdAt: $0.createdAt)
        }
    } catch {
        Log.d("Mark all read error:", error)
    }
}
```

**No server changes needed.** No new route. The existing PATCH handles both cases. Permission key already exists.

### V.2 — `SubscriptionView.redeemPromo`

**Validation:**
- `VerityPost/VerityPost/SubscriptionView.swift:400-506`, broken writes at 472-493.
- Three separate failures chained:
  1. `PromoCode` struct at 416-425 decodes `plan`, `duration_days`, `active` — none exist on `promo_codes` (columns are `applies_to_plans`, `duration_months`, `is_active`). Decode returns empty array → "Invalid promo code" without ever hitting a real bug.
  2. If the decode somehow worked (e.g. a promo row existed with the right shape): line 472-478 inserts into `promo_uses` with column `promo_id` — real column is `promo_code_id`. Insert 400s.
  3. Line 481-484: `UPDATE promo_codes SET current_uses = ... WHERE id = ...` — RLS requires `is_admin_or_above()`. User-scoped call 403s silently.
  4. Line 487-493: writes `plan` and `subscription_status` columns on `users` — neither exists (real names: `plan_id`, `plan_status`). 400s.
- `promo_codes_update` RLS confirmed: `USING is_admin_or_above()`.
- `promo_uses_insert` RLS: `WITH CHECK (user_id = auth.uid())` — so an insert would succeed if the column name were right.

**Fix: delete the entire client direct-write path (lines 414-493); replace with a single POST to `/api/promo/redeem`.**

The route already exists, is gated with `billing.promo.redeem`, service-client writes, optimistic `current_uses` increment, audit log, duplicate guard. Full marker already present (`@migrated-to-permissions 2026-04-18`, `@feature-verified subscription 2026-04-18`).

iOS change at `SubscriptionView.swift:400-506`, replace the whole `redeemPromo()` body from line 414 down to line 505 (keep the function signature and the early-exit guards on 400-412):

```swift
private func redeemPromo() async {
    let code = promoCode.trimmingCharacters(in: .whitespaces).uppercased()
    guard !code.isEmpty else { return }
    guard let session = try? await client.auth.session else {
        promoMessage = "You must be logged in."
        promoSuccess = false
        return
    }

    promoLoading = true
    promoMessage = nil
    defer { promoLoading = false }

    let siteUrl = SupabaseManager.shared.siteURL
    guard let url = URL(string: "/api/promo/redeem", relativeTo: siteUrl) else {
        promoMessage = "Couldn't reach server."
        promoSuccess = false
        return
    }

    struct Body: Encodable { let code: String }
    struct SuccessResponse: Decodable {
        let success: Bool?
        let fullDiscount: Bool?
        let plan: String?
        let message: String?
    }
    struct ErrorResponse: Decodable { let error: String? }

    do {
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONEncoder().encode(Body(code: code))
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            promoMessage = "Network issue."
            promoSuccess = false
            return
        }
        if http.statusCode == 200 {
            let decoded = try JSONDecoder().decode(SuccessResponse.self, from: data)
            promoMessage = decoded.message ?? "Promo applied!"
            promoSuccess = true
            promoCode = ""
            await auth.checkSession()
        } else {
            let err = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error
            promoMessage = err ?? "Failed to redeem code."
            promoSuccess = false
        }
    } catch {
        promoMessage = "Failed to redeem: \(error.localizedDescription)"
        promoSuccess = false
    }
}
```

**No server changes needed.** `PromoCode` struct at 416-425 can be deleted entirely since the response comes back from the API. Also delete any now-unreferenced `RedemptionRow` / `RedemptionEntry` structs.

### V.3 — `AuthViewModel` signup `user_roles` insert

**Validation:**
- `VerityPost/VerityPost/AuthViewModel.swift:275-287` — fetches `roles` row, inserts `user_roles(user_id, role_id, assigned_by)`.
- `user_roles_insert` RLS: `WITH CHECK is_admin_or_above()`. Caller is the new user (just signed up) → not admin → `try?` swallows 403.
- `on_auth_user_created` trigger ALREADY EXISTS on `auth.users` (AFTER INSERT, fires `handle_new_auth_user()`).
- `handle_new_auth_user()` current body (validated):
  - INSERTs into `public.users` with `ON CONFLICT DO NOTHING`.
  - If this is the first-ever user, seeds `user_roles` with `owner` role.
  - **Does NOT seed `user_roles` with the default `user` role for every subsequent signup.**
- `plan_id` is NOT set in the trigger today — only `plan_status='free'` is set. This is a separate bug: the iOS signup flow inserts its own users row at line 253-263 without `plan_id`, so new users end up with NULL `plan_id`. The web signup flow at `/api/auth/signup/route.js` looks up the free plan UUID and sets `plan_id` explicitly.

**Fix choice: EXTEND `handle_new_auth_user()` (not create a new trigger).**

Why extend:
- Avoids two triggers racing on the same INSERT.
- Keeps all post-signup bootstrap in one place.
- Migration is small, idempotent via `CREATE OR REPLACE FUNCTION`.
- Works for both iOS and web — web calls pass through the trigger too.

New migration: `add_post_signup_user_roles_trigger_2026_04_19`.

```sql
-- Migration: add_post_signup_user_roles_trigger_2026_04_19
-- Extend handle_new_auth_user() to seed the default 'user' role
-- and resolve the free plan_id. Idempotent; does not drop the
-- existing trigger (same trigger, replaced function body).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  user_count int;
  owner_role_id uuid;
  user_role_id uuid;
  free_plan_id uuid;
BEGIN
  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

  INSERT INTO public.users (id, email, email_verified, email_verified_at, plan_id, plan_status, locale)
  VALUES (
    NEW.id,
    NEW.email,
    false,
    NULL,
    free_plan_id,
    'active',
    'en'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.users;

  IF user_count = 1 THEN
    SELECT id INTO owner_role_id FROM public.roles WHERE name = 'owner' LIMIT 1;
    IF owner_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, owner_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    SELECT id INTO user_role_id FROM public.roles WHERE name = 'user' LIMIT 1;
    IF user_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, user_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- The trigger itself already exists (on_auth_user_created AFTER INSERT
-- ON auth.users). No DROP/CREATE needed. The function body is now updated.
```

**Note on `plan_status`:** the existing trigger set `plan_status='free'`, but `plan_status` is a lifecycle enum (`'active' | 'past_due' | 'canceled' | 'frozen' | 'grace'` per app usage), not a plan name. Updated to `'active'` which matches what `/api/promo/redeem` writes. The master prep's Track V.3 glossed over this.

**iOS change at `AuthViewModel.swift`:**

Delete lines 265-288 (the RoleRow fetch + user_roles insert). The trigger handles it.

Also: the explicit `INSERT INTO users (...)` at 253-263 remains in place — the trigger uses `ON CONFLICT DO NOTHING`, so the iOS insert wins for `username` and the counts. That is fine. Optionally simplify later; out of scope for this round.

### V.4 — Track V verification plan

**V.1 (mark-read):**
1. Create a test notification row for a test user (admin seeds via DB or service client).
2. In iOS, open Alerts tab → tap the unread notification.
3. SQL check: `SELECT is_read, read_at FROM notifications WHERE id = '<id>'` → both set.
4. Tap "Mark all read" with multiple unread rows → all flip to `is_read=true`.
5. DB probe to confirm no direct writes: check PostgREST logs for any `PATCH /rest/v1/notifications?id=eq.<id>` calls from iOS user-scoped JWTs in this window — expect zero. Calls should go to `/api/notifications` (next.js route).

**V.2 (promo redeem):**
1. Seed a 100% promo via service client with `applies_to_plans=['pro']`, is_active=true.
2. In iOS, Subscription → enter code → Redeem.
3. Expect success message.
4. SQL check: `SELECT plan_id, plan_status FROM users WHERE id=<test user>` → plan_id is pro, plan_status='active'. `SELECT * FROM promo_uses WHERE user_id=<test user>` → one row. `SELECT current_uses FROM promo_codes WHERE code='<code>'` → incremented by 1. `SELECT * FROM audit_log WHERE actor_id=<test user> AND action='promo:apply_full_discount'` → row present.
5. Redeem same code again → "You have already used this code" with promoSuccess=false.
6. **Note:** the upstream `applicable_plans` vs `applies_to_plans` latent bug in `/api/promo/redeem/route.js:88` may surface here. If the full-discount branch returns "This promo is not tied to a specific plan." despite the promo having `applies_to_plans` set, **that is NOT a Track V bug** — flag to PM for a Round 5 rename but do not fix in this round (out of scope).

**V.3 (signup role + plan_id):**
1. Fresh signup from iOS with a brand new email.
2. SQL check: `SELECT role_id FROM user_roles WHERE user_id=<new uid>` → one row, role_id matches `SELECT id FROM roles WHERE name='user'`.
3. `SELECT plan_id, plan_status FROM users WHERE id=<new uid>` → plan_id matches `SELECT id FROM plans WHERE name='free'`, plan_status='active'.
4. Re-signup with the same email through web → trigger still writes, iOS flow also works (ON CONFLICT paths exercised).
5. `SELECT count(*) FROM user_roles WHERE user_id=<new uid>` → exactly 1 (no duplicate from `ON CONFLICT DO NOTHING`).
6. For the very-first-user path: can only verify on a fresh DB; can mentally trace the `IF user_count = 1` branch.

### V.5 — Track V rollback

- V.1: revert the two methods to their prior (broken) state — safer to leave fixed even if something regresses; the old state was non-functional.
- V.2: same — the old path was entirely broken.
- V.3: rollback the function body to the previous one (insert public.users with `plan_status='free'`, only seed owner for first user, no default 'user' role). Restore iOS role-insert block if needed.

---

## Part 3 — Migration names (idempotent)

Use these exact file names / names inside `01-Schema/`:

1. `01-Schema/065_restrict_users_table_privileged_updates_2026_04_19.sql` — Track U migration 1.
2. `01-Schema/066_add_award_reading_points_rpc_2026_04_19.sql` — Track U migration 2.
3. `01-Schema/067_add_post_signup_user_roles_trigger_2026_04_19.sql` — Track V.3 migration.

All three use `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`, and `REVOKE/GRANT` as shown above. Re-run safe.

(If PREPPER 2 also creates migrations in 065+ range, executor may renumber to avoid collision. Suggest giving Security package 065-067 and hygiene package 068+ — this matches the master prep's numbering convention.)

---

## Part 4 — Files NOT to touch (out of scope for EXECUTOR 1)

These are all owned by PREPPER 2 / Tracks W + X or are explicitly out of bounds:

- `site/src/app/api/health/route.js` — Track W owns the env-var lockdown + marker add.
- `site/src/lib/permissionKeys.js` — optional doc file; Track W owns edits.
- `00-Where-We-Stand/REFERENCE.md` — Track W owns count fixes.
- `site/src/components/NotificationBell.tsx` — Track X owns the deletion (after grep-verify).
- Any `site/src/app/api/auth/**/route.js` file — Track X adds markers.
- Any `site/src/app/api/ads/**/route.js` file — Track X adds markers.
- Any `site/src/components/admin/*` file — Track X adds `@admin-verified`.
- Any file with `@migrated-to-permissions` but missing `@feature-verified` (18 files in Part 1.9 of master prep) — Track X owns marker additions.
- `site/src/app/api/promo/redeem/route.js` — already sealed. Do NOT add the `applicable_plans` rename (out of scope, flag for PM).
- `site/src/app/api/notifications/route.js` — already has both markers. Do NOT touch. iOS calls it as-is.
- `01-Schema/reset_and_rebuild_v2.sql` — monolithic schema file, do NOT edit; migrations land in `01-Schema/065+`.
- Existing `score_on_*` DB functions — leave intact.
- `handle_auth_user_updated` trigger function — leave untouched.
- iOS `PermissionService.swift`, `Models.swift` — out of scope; no schema additions needed since no new structs.

---

## Part 5 — Coordination with PREPPER 2

Only two touch-points:

1. **Permission keys for V.1 (mark-read):** master prep recommended creating `notifications.mark_read` / `notifications.mark_all_read` keys if missing. **Verified both exist and are active in the live DB.** No action required from Prepper 2 / Track W for the security package. No DB dependency.

2. **`/api/notifications` marker status:** already has both markers (`@migrated-to-permissions 2026-04-18`, `@feature-verified notifications 2026-04-18`). Not on Track X's list. No coordination needed.

3. **No new API routes from the security package.** V.1 and V.2 both reuse existing routes. This means Track X has no new marker work caused by Track V. Confirm with PREPPER 2 that the 61-file marker count holds (should — nothing added here).

4. **`perms_global_version` bump:** Track W will bump `perms_global_version` at end of its migration. Our migrations do NOT need to bump — no new permission keys, no grants changed. Track U migration 1 changes behavior but is not permission-keyed; clients see the effect immediately via 403 on privileged writes.

5. **Migration numbering coordination:** we claim 065, 066, 067. PREPPER 2 / Track W's `068_round4_permission_key_cleanup.sql` follows. If PREPPER 2 wants to stack more, use 069+.

6. **Latent bug flagged, NOT for either package:** `/api/promo/redeem/route.js:88` reads `promo.applicable_plans` but real column is `applies_to_plans`. 100% promos cannot currently resolve a target plan. Flag for Round 5 / PM; do NOT fix under U/V/W/X.

---

## Part 6 — Blocker check

None. All claims validated. All required DB state exists. All required keys exist. All required API routes exist. All file line numbers confirmed. Executor can begin at Track U migration 1.

One **sharp edge** for the executor to be aware of:

- After Track U migration 1 lands, **Track U migration 2's RPC writes will flow through the new trigger.** The trigger exempts `current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin')`. A SECURITY DEFINER RPC run by `authenticated` will run with the definer's privileges (the owner of the function, which is typically `postgres`). Check the `award_reading_points` function owner after creation — if it's owned by `postgres`, the `current_user` inside the function will be `postgres` and the trigger is bypassed correctly. If it ends up owned by a less-privileged role (rare but possible if the session that runs the migration is not `postgres`), the trigger could fire. Verification step: run `SELECT proowner::regrole FROM pg_proc WHERE proname = 'award_reading_points' AND pronamespace = 'public'::regnamespace;` — expect `postgres`. If not, `ALTER FUNCTION public.award_reading_points(uuid) OWNER TO postgres;` as part of the migration.

  Belt-and-braces: add `ALTER FUNCTION public.award_reading_points(uuid) OWNER TO postgres;` as the last statement of migration 2. Idempotent.

---

## Part 7 — Execution order (within the security package)

1. Migration 1 (restrict_users_table_privileged_updates) — apply first, run verification steps 1-7 from section U.7.
2. Migration 2 (add_award_reading_points_rpc) — apply, run verification steps 8-10.
3. Migration 3 (post_signup trigger extend) — apply, run V.3 verification steps.
4. iOS edits in one commit (StoryDetailView.swift + AlertsView.swift + SubscriptionView.swift + AuthViewModel.swift). Build + run on simulator. Smoke test all three V.x flows.
5. Final SQL audit:
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal;
   SELECT proname, proowner::regrole FROM pg_proc
     WHERE proname IN ('reject_privileged_user_updates','award_reading_points','handle_new_auth_user')
       AND pronamespace = 'public'::regnamespace;
   ```
   Expect: two triggers on users; all three functions owned by `postgres`; `handle_new_auth_user` source contains `'user_role_id'`.

End of security package briefing.
