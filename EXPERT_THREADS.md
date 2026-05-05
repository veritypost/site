# Expert Threads + Mention Caps + Expert Prefs — Spec v4

Single source of truth for the expert-anchored Q&A thread mode, asker mention rate caps, and expert availability/notification preferences. Owner-locked decisions only — agents do not edit the **Locked decisions** or **Tunability surface** sections without an owner-written `UNLOCKED` line.

## 0. Status

```
PHASE:   spec v4 — Waves 0 + 1 + 2 + 3 + 3.5 + 4a + 4b + 5 done; kill switch still false (owner flips after TestFlight)
CURRENT: Waves 4b + 5 shipped together — web @expert picker + thread-mode UI + iOS adult parity. Awaiting owner-run smoke + TestFlight before kill-switch flip.
WAVES:   Wave 0 ✅, 1 ✅, 2 ✅, 3 ✅, 3.5 ✅, 4a ✅, 4b ✅, 5 ✅, kill-switch flip pending
NOTES:   Wave 4b (web): /api/expert/picker (wraps list_active_experts_for_category, 60-sec composer cache, rate-limit toast); /api/comments/expert-thread-state (one-call thread state — verified categories + chains, service-role to bypass expert_applications RLS); CommentComposer.tsx @expert picker with broadcast button + directed list, cap-hit / duplicate / inert copy; CommentRow.tsx author-attribute-driven expert chrome (re-anchored from is_expert_reply column to author.is_expert ∧ in-category) + Close-thread button with cooldown countdown + Reopen (mod) + Allow-another-reply (expert) + asker chain affordances ("1 reply left", "Conversation complete with @maria — they can grant another reply if you have a follow-up."); /api/settings/public extended with expert_inert_mention_visual_giveaway. Wave 5 (iOS): Models.swift extended with 9 ExpertApplication fields + 5 thread-mode comment fields + AuthorRef.verifiedCategoryIds; SettingsView.swift ExpertProfileView fully mirrors web Wave 4a UI; StoryDetailView.swift gets @expert picker + thread-mode UI parity; /api/expert/availability extended to accept the two iOS-EXCLUSIVE push toggles (RPC signature stable, push fields written via service-client UPDATE with re-checked ownership). tsc clean. iOS Xcode build succeeded. Owner smoke checklist: EXPERT_THREADS_SMOKE.md.
```

### What changed from v3

- **iOS-wait decision locked.** Wave 4b flips the web kill switch ONLY after iOS Wave 5 is in TestFlight. Web does not run ahead of iOS for this feature.
- **Multi-region cron dedup** — `send-push` cron's digest path uses `SELECT … FOR UPDATE SKIP LOCKED` on the candidate `expert_applications` row before sending the digest + updating `last_quiet_hours_digest_at`. Three multi-region instances no longer triple-fire the same digest.
- **Kill-switch read-once-per-TXN** — `expertConfig.ts` callers read `features.expert_threads_enabled` + `expert.config.version` ONCE at RPC entry, thread the values through downstream calls. Prevents orphan `is_expert_thread_root=true` rows when admin flips the switch mid-request.
- **Mod-reopen cooldown reset** — `close_expert_thread` cooldown predicate uses `GREATEST(last_expert_reply_at, last_reopen_at)`. After mod reopens a thread, asker can't immediately re-close (otherwise mod intent is undone instantly).
- **Expert chrome scope corrected** — distinctive expert chrome (Verified Expert chip + accent border) attaches to **author.is_expert AND article.category ∈ author.verified_categories**, NOT to thread-mode. Maria's reply gets the chip whether the thread is in expert-mode or a regular conversation.
- **Picker rate-limit composer UX** — when `list_active_experts_for_category` returns rate-limited, composer shows toast `easy on the search — try again in a sec` AND caches successful picker results for 60 seconds per composer instance, so legitimate open-close-reopen browsing doesn't false-positive.
- **Web push prefs visibility** — when an iOS user has push prefs set, web profile renders a disabled read-only block "Push managed in iOS app." When user has no iOS push prefs, web hides the block entirely. Beats total invisibility for cross-platform users.
- **Settings rows get `category`** — 7 `expert.*` rows use new category `expert`; `features.expert_threads_enabled` uses existing category `general` (matches `beta_active` precedent).
- **`value_type` consistency** — pick `number` (23-row precedent) for all numeric tunables.
- **`bump_expert_config_version()` is SECURITY DEFINER** with internal `is_admin_or_above()` guard. Future-proof against non-admin call paths.
- **Version-bump once per TXN** — admin save handler bumps once after all field UPDATEs commit, not once per field. Prevents cache reload thrashing on multi-field saves.
- **DB trigger on `settings` + `plan_features`** auto-calls `bump_expert_config_version()` on any UPDATE/INSERT/DELETE. Catches SQL-editor edits + seed migrations the app-layer save handler would miss.
- **`bump_expert_config_version()` ships in Wave 1**, not Wave 2 — admin save handlers in Wave 1 depend on it.
- **3 new verification cases** added: cache version-bump invalidation, picker rate-limit burst (11/min), deadlock prevention under concurrent reply load.

## 1. Scope

Three interrelated capabilities, shipped together:

- **Asker mention rate caps** — per-plan limits on how many `@expert` invocations a user can make per hour and per day. Hard-blocked on cap-hit.
- **Expert availability + notification prefs** — each expert configures: pause toggle, recurring quiet hours, per-post and per-day cap on mentions of themselves, and two iOS-only push opt-ins.
- **Expert thread mode** — comments whose **root** contains `@expert` enter a structured Q&A mode with asker reply caps, unlimited expert replies, cross-expert collaboration, distinctive expert reply chrome, per-(asker, expert) "allow another reply" grants, and a 60-sec-cooldown asker close button.

Out of scope: bare `@<username>` mentions for non-experts (no caps, no quiet hours, no quota).

## 2. Locked decisions

**Locks set defaults; the tunability surface (§2.5) lets owner adjust per-environment without re-spec.**

### Queue model

- The expert queue is **shared across all verified experts in a given category.**
- Pause / quiet hours / at-quota state controls **whether the expert is notified and shown in the picker.** It does NOT suppress queue items — items always land in the shared category queue.
- Existing implementation at `web/src/app/api/expert/queue/route.js:47-54`.

### Asker rate caps

- Two windows only: per-hour and per-day.
- Stored on `plan_features`. Admin-tunable via `/admin/plans`.
- Default seed values:
  - Free: 2/hr, 5/day
  - Pro: 10/hr, 30/day
  - Family: 15/hr, 50/day **per seat** (see Open Q1)
- **Broadcast cost:** `@expert` broadcast counts as 3 mentions. Tunable (`comments.expert_mention.broadcast_cost`, default 3).
- **Hard block on cap-hit.** Composer copy: `you reached your mentions for today.`
- Counter via existing `check_rate_limit(p_key text, p_max integer, p_window_sec integer) → jsonb`. Two keys: `mentions:hr:<asker_id>` and `mentions:day:<asker_id>`. Writes to `rate_limit_events`.
- Reset semantics: rolling windows.
- Cap fires inside `post_comment` AND `edit_comment`. **Edit-swap counts as 1.** Tunable via `settings.expert.mentions.edit_refunds_removed` (default `true`).
- **No duplicate `@` of the same expert in one comment.** Composer prevents; server rejects with `you've already @'d this expert in this comment.`

### Mention syntax + autocomplete

- Trigger: typing `@expert` opens a picker.
- Picker shows: `Ask all experts in [Category]` broadcast button + directed list of currently-active experts in the article's category.
- "Currently active" = NOT paused, NOT in quiet hours, NOT at per-day quota.
- Empty active list = broadcast button only.
- Bare `@<username>` continues unchanged.
- Token in body: `@expert_<username>` for directed; sentinel `@expert` for broadcast.
- **Parser disambiguation:** extract `@expert(_[a-zA-Z0-9_]{2,30})?` first, strip from body, then run existing bare-mention regex at `web/src/lib/mentions.js:1`. The 30-char bound prevents OOM.
- **Username reservation:** new usernames cannot start with `expert_`. Wave 0 sweep guards (today: 0 matches).
- **Picker rate-limit:** `list_active_experts_for_category` capped at 10 calls/minute per asker via `check_rate_limit` (key `picker:<asker_id>`). On rate-limit hit, composer shows toast `easy on the search — try again in a sec`. Successful picker results cached client-side per composer instance for 60 seconds so open-close-reopen browsing doesn't false-positive.

### Inert mentions

- When asker manually types `@expert_maria` and Maria is paused / in quiet hours / at quota, the @ is **inert**: no notification, no per-day quota tick for Maria, no notification row write. Queue item still lands.
- Asker's daily mention cap **still ticks**.
- Render: token displays normally. Tunable via `settings.expert.inert_mention.visual_giveaway` (default `false`).
- **Inert mentions are NEVER counted in the quiet-hours-end digest** — they didn't generate a notification row to defer.

### Expert preferences (inline in Expert profile settings)

Section order:

1. **Pause my queue.** Three radio states: `Off` / `Until I turn it back on` / `Until a date` + quick-pick chips.
2. **Quiet hours.** Master toggle (off by default). Single recurring window + 7-day-chip multi-select. Pre-fills 9:00 PM → 7:00 AM.
3. **Mention caps.** Two number fields: per-article (default 3) and per-day (default 25). Read-only "Today: X of Y."
4. **Push alerts (iOS only).** Two toggles, both off by default. Web shows disabled read-only "Push managed in iOS app" block when iOS prefs exist; otherwise hides entirely.
5. Verified areas (existing).
6. Credentials (existing).
7. Application status (existing).

### Mentionability vs push (orthogonal)

- **Pause + quiet hours = mentionability OFF.** Picker hides; manual `@` is inert; queue item still lands.
- **Push toggles = delivery channel only.**
- **Quiet-hours-end digest:** new column `expert_applications.last_quiet_hours_digest_at`. `send-push` cron checks every 5 min for users whose quiet hours just ended since `last_quiet_hours_digest_at` (uses `SELECT … FOR UPDATE SKIP LOCKED` to prevent multi-region triple-fire). Sends one summary push: `You have N new mentions from quiet hours.` Updates the column.
- **Un-pause digest:** same cron logic when `vacation_until` clears or `pause_until_indefinite` flips false.
- **Digest scope:** the digest covers MENTIONS only — not category-arrival broadcasts or thread-activity events.

### Expert thread mode

Thread enters expert mode when the **root comment** (depth 0) contains `@expert`. A `@expert` typed in a deep reply works as a directed mention (counters tick, picker shows, asker cap fires) but doesn't enter thread mode (no chain row, no 2-cap, no grant button).

- **Asker reply cap:** ≤ 2 per expert chain in that thread. Tunable (`comments.expert_thread.asker_replies_per_chain`, default 2).
- **Expert reply cap:** unlimited.
- **Cross-expert collaboration:** any verified in-category expert can post unlimited.
- **Allow another reply:** each expert sees a button on their own replies; lifts the asker's cap for THAT chain only. Permission: `comments.expert_thread.allow_followup`.
- **Distinctive expert reply chrome** — `Verified Expert · [Category]` chip + accent border. **Attaches to `author.is_expert AND article.category ∈ author.verified_categories`, NOT to thread mode.** An expert replying anywhere in the article gets the chip.
- **Asker close-thread:** thread originator clicks "close thread" → `expert_thread_closed_at` set. Closed threads accept no new replies. Permission: `comments.thread.close.own`.
  - **60-second cooldown** computed as `GREATEST(last_expert_reply_at, last_reopen_at)` + `settings.expert_thread.close_cooldown_seconds`. Server-side `close_expert_thread` rejects with `wait_for_cooldown` + `seconds_remaining`. Mod reopens force a fresh cooldown — asker can't immediately re-muzzle.
  - Tunable (`settings.expert_thread.close_cooldown_seconds`, default 60).
- **Mod hide / reopen:** `comments.moderate` permission gates per-comment hide AND `clear expert_thread_closed_at`.
- **Delete-reply behavior:** chain count does NOT decrement. UI: "(deleted reply still counts)."
- **Asker-side reply count affordance:** "1 reply left" inline beside asker's posted replies; on cap-hit, button disables with "Conversation complete with @maria — they can grant another reply if you have a follow-up."

### Adversary mitigations baked in

1. **Edit re-extracts mentions but skips the cap.** Cap fires inside `edit_comment` RPC, computing `newly-added - newly-removed` clamped >= 0.
2. **`users.timezone` nullable → quiet-hours mis-fires.** Auto-populate from browser at first quiet-hours editor render; refuse to save until non-null. Subsequent renders show confirm banner if browser TZ ≠ stored. Live: 14/14 users have NULL today.
3. **Owner-mode short-circuit per §8.4 Lock #10.** Every new RPC short-circuits on `is_owner_mode_user(uid)`. Owner-mode user as ASKER bypasses all caps including cross-expert chains in the same thread.
4. **Two-tab race on chain reply count.** `post_expert_thread_reply` `SELECT … FOR UPDATE` on `expert_thread_chains` row.
5. **Daily counter race.** `commit_expert_mentions` upserts.
6. **Audit-log marker for owner-mode bypass writes.** `grant_expert_thread_free_pass` writes `via=owner_mode`.
7. **Free-pass grantor account deletion.** `expert_thread_chains.free_pass_granted_by` FK uses `ON DELETE SET NULL`.
8. **`SELECT FOR UPDATE` deadlock prevention.** Multi-target chain locks acquired in deterministic `ORDER BY (asker_user_id, expert_user_id)`.
9. **Empty `plan_features` fallback.** `expertConfig.ts` returns hard-coded seed defaults on NULL + warns.
10. **Cache invalidation across instances.** `settings.expert.config.version` auto-bumped on admin save; `expertConfig.ts` reads version on every lookup.
11. **Multi-region cron dedup.** `send-push` digest path uses `SELECT … FOR UPDATE SKIP LOCKED` on candidate row before sending + updating `last_quiet_hours_digest_at`.
12. **Kill-switch read-once-per-TXN.** RPC entry reads `features.expert_threads_enabled` + `expert.config.version` once, threads through. No mid-request orphan thread roots.
13. **Mod-reopen cooldown reset.** Cooldown predicate uses `GREATEST(last_expert_reply_at, last_reopen_at)`.

## 2.5. Tunability surface

Read-path code reads through `web/src/lib/expertConfig.ts`.

### `plan_features` rows (per-plan, edited via `/admin/plans`)

| feature_key | limit_type | Free | Pro | Family |
|---|---|---|---|---|
| `comments.expert_mention.per_hour` | `per_hour` | 2 | 10 | 15 |
| `comments.expert_mention.per_day` | `per_day` | 5 | 30 | 50 |
| `comments.expert_mention.broadcast_cost` | `count` | 3 | 3 | 3 |
| `comments.expert_thread.asker_replies_per_chain` | `count` | 2 | 2 | 2 |

`per_day` is existing (D14). `per_hour` and `count` are new strings; column has no CHECK constraint.

### `settings` rows (global, edited via `/admin/system`)

| key | value_type | category | default | meaning |
|---|---|---|---|---|
| `features.expert_threads_enabled` | `boolean` | `general` | `false` | Master kill switch. Wave 4b flips per environment. |
| `plan_features.cache_seconds` | `number` | `expert` | `300` | TTL on `plan_features` cache. |
| `expert.default_per_post_quota` | `number` | `expert` | `3` | Seed for new experts' per-article cap. |
| `expert.default_per_day_quota` | `number` | `expert` | `25` | Seed for new experts' per-day cap. |
| `expert.mentions.edit_refunds_removed` | `boolean` | `expert` | `true` | If true, edit-swap nets new vs removed. |
| `expert.inert_mention.visual_giveaway` | `boolean` | `expert` | `false` | If true, inert `@expert_<name>` renders grayed/struck. |
| `expert_thread.close_cooldown_seconds` | `number` | `expert` | `60` | Cooldown after expert reply / mod reopen before close enables. |
| `expert.config.version` | `number` | `expert` | `1` | Auto-bumped on admin save touching tunables. Drives cache invalidation. |

### Permission keys

| permission_key | default grant | gates |
|---|---|---|
| `comments.expert_mention.broadcast` | `free`, `pro`, `family` | Whether user can use broadcast. |
| `comments.expert_thread.allow_followup` | `expert` | Expert sees "allow another reply" button. |
| `comments.thread.close.own` | `free`, `pro`, `family` | Thread originator can close. |
| `comments.moderate` (existing) | `moderator`, `editor`, `admin`, `owner` | Mod hide + reopen of closed threads. |

### `expert_applications` columns (per-expert, edited in Expert profile settings)

| column | default | meaning |
|---|---|---|
| `vacation_until` | NULL | "Until a date" pause state (existing). |
| `pause_until_indefinite` | `false` | "Until I turn it back on" pause state. |
| `mention_quiet_hours_start` | NULL | Quiet hours window start time. |
| `mention_quiet_hours_end` | NULL | End time. |
| `mention_quiet_hours_days` | NULL | Day-of-week int[] (0=Sun..6=Sat). |
| `mention_quota_per_post` | seed from settings | Per-article cap. |
| `mention_quota_per_day` | seed from settings | Per-day cap. |
| `notify_push_on_mention` | `false` | iOS push opt-in for direct mentions. |
| `notify_push_on_category_arrival` | `false` | iOS push opt-in for category arrivals. |
| `last_quiet_hours_digest_at` | NULL | Cron-managed timestamp of last digest send. |

## 3. Open questions

- **Q1.** Family seat caps: per-seat or pooled?
- **Q2.** When asker tries `@expert_<name>` and that expert has hit daily quota, does picker suggest other in-category experts as alternates?

## 4. Data model

### Existing — reuse

- `expert_applications.vacation_until` → "Until a date" state.
- `_is_in_quiet_hours()` RPC → wrapped by `_is_in_quiet_hours_v2`.
- `plan_features` table → asker caps + broadcast cost + asker thread reply cap.
- `check_rate_limit(p_key text, p_max integer, p_window_sec integer) → jsonb` → asker counter + picker rate-limit. Writes to `rate_limit_events`.
- `comments.mentions` jsonb → already populated.
- `expert_application_categories` → drives picker query.
- `users.timezone` (varchar nullable; **NULL on 14/14 users**).
- `settings` table → global config.

### Schema additions

```sql
ALTER TABLE expert_applications
  ADD COLUMN pause_until_indefinite boolean NOT NULL DEFAULT false,
  ADD COLUMN mention_quiet_hours_start time NULL,
  ADD COLUMN mention_quiet_hours_end time NULL,
  ADD COLUMN mention_quiet_hours_days int[] NULL,
  ADD COLUMN mention_quota_per_post int NOT NULL DEFAULT 3,
  ADD COLUMN mention_quota_per_day int NOT NULL DEFAULT 25,
  ADD COLUMN notify_push_on_mention boolean NOT NULL DEFAULT false,
  ADD COLUMN notify_push_on_category_arrival boolean NOT NULL DEFAULT false,
  ADD COLUMN last_quiet_hours_digest_at timestamptz NULL;

ALTER TABLE comments
  ADD COLUMN is_expert_thread_root boolean NOT NULL DEFAULT false,
  ADD COLUMN expert_thread_root_id uuid NULL REFERENCES comments(id),
  ADD COLUMN expert_thread_closed_at timestamptz NULL,
  ADD COLUMN expert_thread_closed_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN last_reopen_at timestamptz NULL;
CREATE INDEX comments_expert_thread_root_idx ON comments(expert_thread_root_id) WHERE expert_thread_root_id IS NOT NULL;

CREATE TABLE expert_thread_chains (
  thread_root_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  asker_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expert_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asker_reply_count int NOT NULL DEFAULT 0,
  free_pass_granted_at timestamptz NULL,
  free_pass_granted_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (thread_root_id, asker_user_id, expert_user_id)
);

CREATE TABLE expert_mention_quota_counters (
  expert_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_utc date NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (expert_user_id, day_utc)
);

CREATE TABLE expert_mention_post_counters (
  expert_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (expert_user_id, article_id)
);

-- Auto-bump version on any direct settings/plan_features write
-- (catches SQL-editor edits + seed migrations the app handler misses).
CREATE OR REPLACE FUNCTION trg_bump_expert_config_version() RETURNS trigger AS $$
BEGIN
  PERFORM bump_expert_config_version();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER settings_bump_expert_version
  AFTER INSERT OR UPDATE OR DELETE ON settings
  FOR EACH STATEMENT EXECUTE FUNCTION trg_bump_expert_config_version();

CREATE TRIGGER plan_features_bump_expert_version
  AFTER INSERT OR UPDATE OR DELETE ON plan_features
  FOR EACH STATEMENT EXECUTE FUNCTION trg_bump_expert_config_version();
```

### Username reservation

Wave 0 sweep: `SELECT username FROM users WHERE username ILIKE 'expert\_%' ESCAPE '\'`. **Live count: 0 — no rename needed.** Username-set path validation rejects new `expert_*` usernames.

## 5. Enforcement points

| Concern | File / route | Notes |
|---|---|---|
| Asker per-hour/day cap | `web/src/app/api/comments/can-mention/route.js:99` | Two `check_rate_limit` calls — keys `mentions:hr:<asker_id>` and `mentions:day:<asker_id>`. |
| Asker cap on edit | `web/src/app/api/comments/[id]/route.js:34-44, 192-196` | New RPC `edit_comment_with_mention_cap` evaluates `newly-added - newly-removed` clamped >= 0. |
| Broadcast cost | Same | Each broadcast costs `comments.expert_mention.broadcast_cost` (default 3). |
| Expert per-day quota | Same `can-mention` route + `post_comment` | Filters at-quota experts from picker; no-ops manually-typed at-quota mentions. |
| Expert per-post quota | Same | Per (expert_user_id, article_id) — `expert_mention_post_counters`. |
| Pause / quiet hours | Same | Treats unmentionable expert as filtered. |
| Mention parser | `web/src/lib/mentions.js:1` | Extract `@expert(_[a-zA-Z0-9_]{2,30})?` first, strip, then bare-mention regex. |
| Duplicate-@-same-expert reject | `post_comment` RPC | Reject with `you've already @'d this expert in this comment.` |
| Picker rate-limit | `list_active_experts_for_category` RPC + composer | Server: `check_rate_limit` key `picker:<asker_id>`, max 10/min. Composer: 60-sec client cache + toast on rate-limit hit. |
| Thread mode reply cap | `post_expert_thread_reply` RPC | `SELECT … FOR UPDATE` on chain row in `ORDER BY (asker_user_id, expert_user_id)`. **Rejects if `expert_thread_closed_at IS NOT NULL` on root** (under same lock). Owner-mode bypass. |
| Allow another reply | `POST /api/expert/threads/[root_id]/grant` | Sets `free_pass_granted_at`. Auth: caller holds `comments.expert_thread.allow_followup` AND has posted in thread. Owner-mode writes `via=owner_mode` to audit log. |
| Close thread | `POST /api/comments/[id]/close` | Sets `expert_thread_closed_at`. Auth: caller holds `comments.thread.close.own` AND is thread originator (or owner-mode). Rejects when `now() < GREATEST(last_expert_reply_at, last_reopen_at) + settings.expert_thread.close_cooldown_seconds`. |
| Reopen thread | `POST /api/comments/[id]/close?action=reopen` | Auth: `comments.moderate` only. Clears `expert_thread_closed_at`; sets `last_reopen_at`. |
| Delete-reply count | `comments DELETE` (existing) | Chain count does NOT decrement. UI surfaces "(deleted reply still counts)." |
| Notification trigger | `post_comment` RPC body | Inserts one `notifications` row per resolved directed mention with `type='mention'`, `alert_type='mention'`. Broadcasts insert one row per opted-in expert with `alert_type='category_arrival'`. Push opt-in check: `alert_preferences.is_enabled = true AND channel_push = true` for the relevant alert_type row. |
| Push delivery filter | `web/src/app/api/cron/send-push/route.js` | Add `mention` + `category_arrival` to alert-type allow-list. Bundle quiet-hours-deferred mentions per user into one summary push using `SELECT … FOR UPDATE SKIP LOCKED` on candidate `expert_applications` row to prevent multi-region triple-fire. Updates `last_quiet_hours_digest_at`. |
| Quiet-hours timezone | `ensure_user_timezone(p_uid, p_tz)` RPC | Called from web Wave 4a + iOS Wave 5. |
| Owner-mode short-circuit | All new RPCs | `IF is_owner_mode_user(p_user_id) THEN RETURN <bypass>;` first line. |
| Kill switch | `web/src/lib/expertConfig.ts` | Read once at RPC entry; threaded through downstream calls. No re-read mid-TXN. |
| Cache invalidation | `web/src/lib/expertConfig.ts` reads `settings.expert.config.version` on every lookup | Bypasses 5-min TTL on version mismatch. Admin save bumps once per TXN. DB trigger on settings/plan_features auto-bumps for direct edits. |

## 6. New RPCs

All have owner-mode short-circuit unless explicitly noted.

- `check_and_reserve_asker_mention_cap(p_user_id, p_n_targets, p_is_broadcast) → jsonb` — calls `check_rate_limit` twice (hr + day). Broadcasts multiply n_targets by `broadcast_cost`. Returns `{allowed, hour_count, day_count, reset_at}`.
- `check_expert_mention_quota(p_target_user_ids, p_article_id) → jsonb` — returns `{at_quota, available}`.
- `commit_expert_mentions(p_asker_id, p_target_user_ids, p_article_id) → void` — upserts per-day + per-(expert, article) counters atomically.
- `post_expert_thread_reply(p_user_id, p_thread_root_id, p_expert_user_id, p_body) → uuid` — `SELECT … FOR UPDATE` on chain in `ORDER BY (asker_user_id, expert_user_id)`. Checks `asker_reply_count < 2` unless `free_pass_granted_at IS NOT NULL`. Rejects if `expert_thread_closed_at IS NOT NULL`. Owner-mode bypasses cap entirely.
- `grant_expert_thread_free_pass(p_granting_expert_id, p_thread_root_id, p_asker_user_id) → void` — sets `free_pass_granted_at`. Owner-mode writes `via=owner_mode` to audit log.
- `close_expert_thread(p_user_id, p_root_id) → jsonb` — sets `expert_thread_closed_at`. Rejects if `now() < GREATEST(last_expert_reply_at, last_reopen_at) + settings.expert_thread.close_cooldown_seconds`.
- `reopen_expert_thread(p_user_id, p_root_id) → void` — clears `expert_thread_closed_at`; sets `last_reopen_at = now()`. Auth: `comments.moderate` (or owner-mode).
- `list_active_experts_for_category(p_category_id, p_article_id, p_asker_id) → uuid[]` — drives picker. Calls `check_rate_limit` first (key `picker:<p_asker_id>`, max 10/min). Filters: NOT paused, NOT in quiet hours (`_is_in_quiet_hours_v2`), NOT at per-day quota, NOT at per-post quota for `p_article_id`.
- `_is_in_quiet_hours_v2(p_user_id, p_at) → boolean` — wraps `users.timezone` + `expert_applications.mention_quiet_hours_*` resolution, calls existing `_is_in_quiet_hours` with TZ-converted time.
- `ensure_user_timezone(p_uid, p_tz) → void` — sets `users.timezone` if currently NULL.
- `set_expert_availability(p_expert_app_id, p_pause, p_until, p_qh_start, p_qh_end, p_qh_days) → void` — SECURITY DEFINER. Kill-switch-bypassing (settings persist always; only enforcement RPCs short-circuit on kill switch).
- `set_expert_mention_quotas(p_expert_app_id, p_per_post, p_per_day) → void` — SECURITY DEFINER. Kill-switch-bypassing.
- `bump_expert_config_version() → void` — SECURITY DEFINER with internal `is_admin_or_above()` guard. Increments `settings.expert.config.version` atomically. Called from `/admin/system` and `/admin/plans` save handlers (once per save TXN, not per field) AND from DB triggers on direct `settings`/`plan_features` writes.

## 7. Admin surface

- `/admin/plans` editor surfaces 4 new editable fields per plan. Permission: `admin.plans.write`.
- `/admin/system` row block for kill switch + 7 `expert.*` defaults. Same permission gate.
- **Both surfaces call `bump_expert_config_version()` once per save TXN**, after all field UPDATEs commit. DB triggers also auto-bump on direct settings/plan_features writes (catches SQL-editor edits + seed migrations).
- Cache invalidation latency: ~1-5 sec across instances (single-row version check + cache reload), well under 5-min TTL.

## 8. UI surfaces

### Web

| Surface | File | Wave |
|---|---|---|
| `/admin/plans` editor — 4 new fields | `web/src/app/admin/plans/page.tsx` | 1 |
| `/admin/system` — kill switch + 7 `expert.*` defaults | `web/src/app/admin/system/page.tsx` | 1 |
| Expert profile settings — Pause / Quiet hours / Mention caps / Push (read-only-or-hidden) | `web/src/app/profile/_sections/ExpertProfileSection.tsx` | 4a |
| `@expert` picker in comment composer + 60-sec client cache + rate-limit toast | `web/src/components/CommentComposer.tsx` | 4b |
| Thread mode reply UI + cap affordances + grant + close + reopen | `web/src/components/CommentThread.tsx` | 4b |
| Expert reply chrome — attaches to author.is_expert AND article.category ∈ author.verified_categories (NOT thread mode) | Same | 4b |
| Cap-hit / duplicate-@ / inert-mention render | Same | 4b |

### iOS adult

| Surface | File | Wave |
|---|---|---|
| Expert profile settings | `VerityPost/VerityPost/SettingsView.swift:2647-2843` (extend) | 5 |
| `@expert` picker | iOS comment composer | 5 |
| Thread mode reply UI + buttons | iOS comment thread view | 5 |
| Push prefs (iOS-exclusive UI) | Same `ExpertProfileView` | 5 |
| `Models.swift` — extend `ExpertApplication` | `VerityPost/VerityPost/Models.swift` | 5 |

### iOS kids

N/A.

## 9. Cross-platform parity matrix

| Feature | Web | iOS adult | iOS kids |
|---|---|---|---|
| Asker rate caps | ✓ | ✓ | N/A |
| Expert profile settings | ✓ | ✓ | N/A |
| `@expert` picker | ✓ | ✓ | N/A |
| Thread mode reply UI + caps | ✓ | ✓ | N/A |
| Distinctive expert reply chrome | ✓ | ✓ | N/A |
| Allow another reply | ✓ | ✓ | N/A |
| Close thread (60s cooldown + reopen reset) | ✓ | ✓ | N/A |
| Mod reopen | ✓ | ✓ | N/A |
| Push prefs UI | read-only-or-hidden | ✓ | N/A |
| Push delivery | n/a | ✓ via APNs | N/A |
| Quiet-hours TZ auto-populate | ✓ | ✓ | N/A |

## 10. Migration waves

Seven waves.

- **Wave 0 — Pre-flight.**
  - Audit: `SELECT username FROM users WHERE username ILIKE 'expert\_%' ESCAPE '\'` (live: 0); `SELECT COUNT(*) FROM expert_applications` (live: 1); `SELECT COUNT(*) FROM comments` (live: 1).
  - `pg_dump -t expert_applications` snapshot before Wave 1 runs.
  - Update `web/scripts/seed-test-accounts.mjs` to add `expert2@veritypost.com` (Politics + Tech).

- **Wave 1 — Schema + admin editor + settings rows + bump RPC.**
  - Apply schema additions including DB triggers on `settings`/`plan_features`.
  - Seed `plan_features` rows + `settings` rows (with `value_type` + `category`).
  - Create `bump_expert_config_version()` RPC (SECURITY DEFINER + admin guard).
  - Extend `/admin/plans` editor + `/admin/system` row block. Both call `bump_expert_config_version()` once per save TXN.
  - Kill switch defaults `false`. Schema is live; nothing user-visible changes.

- **Wave 2 — Other RPCs + tz helper + config helper.**
  - All other RPCs in §6, with owner-mode short-circuits + kill-switch fall-through (read-once-per-TXN).
  - `web/src/lib/expertConfig.ts` exports `getPlanFeature(planId, key)`, `getSetting(key)`, `isExpertThreadsEnabled()`, internal version-check + 5-min TTL with bypass-on-version-bump.
  - Empty `plan_features` fallback returns hard-coded seed defaults + warns.

- **Wave 3 — Server enforcement.**
  - Wire `can-mention`, `post_comment`, `edit_comment` to RPCs. Add `mention` + `category_arrival` to `send-push` cron alert-type allow-list (immediate-mode only; bundling is Wave 3.5).
  - Server-side caps live ONLY when kill switch true.

- **Wave 3.5 — Quiet-hours-end digest cron.**
  - Extend `send-push` cron with TZ-aware quiet-hours-end detection per user. Dispatch one summary push using `SELECT … FOR UPDATE SKIP LOCKED` on candidate `expert_applications` row (multi-region dedup). Update `last_quiet_hours_digest_at`.

- **Wave 4a — Web expert profile settings UI.**
  - Extend `ExpertProfileSection.tsx` with Pause / Quiet hours / Mention caps blocks. Push block: read-only "Push managed in iOS app" when iOS prefs exist; otherwise hidden. Quiet-hours editor calls `ensure_user_timezone` on first render.
  - Settings page persists regardless of kill switch (so owner can pre-configure); inline banner when `features.expert_threads_enabled = false`: "Mention threads are not yet active for users — these settings will take effect when launched." Owner reviews banner copy before merge.

- **Wave 4b — Web picker + thread mode UI.**
  - `@expert` picker (60-sec client cache + rate-limit toast). Thread mode reply UI + cap affordances + "allow another reply" + "close thread" (60s cooldown disable). Distinctive expert reply chrome (author-attribute-driven, not thread-mode-driven). Cap-hit + duplicate-@ + inert-mention render.
  - Owner reviews visual chrome before merge.
  - **Wave 4b does NOT flip kill switch** — waits for Wave 5 to be in TestFlight first.

- **Wave 5 — iOS adult parity.**
  - Mirror Waves 4a + 4b on iOS. Push prefs visible on iOS only.
  - **Once Wave 5 is in TestFlight, kill switch flips per environment** via `UPDATE settings SET value='true' WHERE key='features.expert_threads_enabled'`. Rollback: same UPDATE with `value='false'`.

- **Verification pass.**
  - End-to-end smoke as free@, pro@, family@, expert@, expert2@, mod@, admin@ via `/dev/login`.
  - Verify: cap-hit on free@; broadcast costs 3x; expert@ paused → not in picker but queue gets item; quiet hours filter; quota filter; allow-another-reply; close-thread cooldown (try close immediately after expert reply → cooldown error); reopen by mod (try immediate re-close after reopen → cooldown error); cross-expert collaboration in one Politics thread; duplicate-@ rejected; edit-swap nets correctly; deleted reply still counts.
  - **New v4 verification cases:**
    - **Cache version-bump invalidation:** write a setting via `/admin/system`, confirm `expertConfig.ts` cache reloads within ~5s on a separate Vercel instance.
    - **Picker rate-limit burst:** burst 11 picker opens in one minute, confirm 11th rejects with toast.
    - **Deadlock prevention under load:** concurrent `post_expert_thread_reply` to overlapping (asker_id, expert_id) chain pairs from two clients; confirm one waits, neither errors.
  - iOS parity smoke with same accounts.

## 11. §7 pre-impl review status

**Three panels run** (v1, v2, v3); each returned pass-with-fixes; v4 (this doc) folds in:
- v3 investigator: 4 doc-precision tightens (settings `category` column, `value_type` consistency, SECURITY DEFINER on bump RPC, ref example). All landed.
- v3 planner: 8 procedural items + 1 owner Q (iOS gap). All landed; iOS-wait locked.
- v3 big-picture: 3 silent-spec gaps (expert chrome scope, picker UX, web push visibility) + still-open pre-cap-hit affordance (parked). 3 landed; affordance parked.
- v3 adversary: 3 critical (cron dedup, kill-switch read-once, mod-reopen cooldown reset) + 7 smaller. Critical landed.

**Parked** (documented, not blocking launch): pre-cap-hit composer affordance, mod-reopen ping-pong, deep-reply `@expert` as separate @-spam vector, push-prefs absence precedence, mid-session plan upgrade, grant revocation.

v4 ships without re-running the panel — remaining items are doc-precision-only and well-bounded; further panel iteration is diminishing returns. Wave 0 active.

## 12. References

- §8.4 Lock #10 — owner-mode backstage. `QA.md:1146`. Bind on every new RPC.
- §8.4 Finding #11 — privilege escalation on `/api/admin/users/[id]/permissions/route.js:77,98`. Should ship before granting owner-mode to a second user.
- §8.4 Finding #13 — no audit-log marker on owner-mode bypass writes. `grant_expert_thread_free_pass` writes `via=owner_mode`.
- Existing rate-limit infra: `web/src/lib/rateLimit.js:25-41`. RPC: `check_rate_limit(p_key text, p_max integer, p_window_sec integer) → jsonb`. Writes to `rate_limit_events`.
- Existing pre-submit mention gate: `web/src/app/api/comments/can-mention/route.js:99`.
- Existing `_is_in_quiet_hours` RPC: `(p_start time, p_end time, p_at time)`. Wrap, don't call directly.
- Push pipeline: `web/src/lib/apns.js`, `web/src/app/api/cron/send-push/route.js`, `user_push_tokens` table, iOS `VerityPost/VerityPost/PushRegistration.swift:38-51`.
- `plan_features` D14 precedent: free user breaking_news per-day cap.
- Vacation toggle (legacy, replaced by Pause my queue UI): `web/src/app/profile/_sections/ExpertProfileSection.tsx:111-137` + `VerityPost/VerityPost/SettingsView.swift:2795-2815`. Backing column `vacation_until` stays.
- Existing queue scope (shared-by-category): `web/src/app/api/expert/queue/route.js:47-54`.
- Mention parser: `web/src/lib/mentions.js:1` (regex `/@([a-zA-Z0-9_]{2,30})/g`).
- `expert_applications` RLS update policy: admin-only — service-role precedent at `/api/expert/vacation/route.js`.
- `settings` table value_type pattern: `boolean`, `number`, `string`, `integer`, `text`, `json`. Categories include `ai`, `general`, `kids`, `pipeline`, etc.
