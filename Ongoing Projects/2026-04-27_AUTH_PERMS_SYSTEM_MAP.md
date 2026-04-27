# Auth + Permissions System Map

**Date:** 2026-04-27
**Investigator:** lead developer + 3 parallel explore agents
**Trigger:** owner request — "make sign-in/sign-up 1000x better" surfaced a much deeper question about how permissions, roles, plans, RLS, cohorts, and lockout state actually interlock.
**Scope:** every layer that gates what a user can see, do, or be charged for.

This is a reference doc. It describes **the system as it is on 2026-04-27**, with file:line citations and live DB queries. It does not propose fixes — those go in their own implementation plan once decisions are locked.

---

## 1. The three permission-resolution layers

A request to do anything in the app passes through up to **6 independent gates**, evaluated in this order:

1. **Middleware** (`web/src/middleware.js`) — beta-gate redirect, coming-soon redirect, protected-prefix redirect to `/login`
2. **Layout server check** (e.g., `web/src/app/admin/layout.tsx:26-39`) — role check, returns `notFound()` (404) for non-staff
3. **`compute_effective_perms` RPC** (DB function, called via `requirePermission()` and `hasPermissionServer()` in `web/src/lib/auth.js:245-288`) — resolves all 927 active permissions for the user, with 4 short-circuit blockers:
   - `is_banned AND NOT on_lockout_allowlist` → false
   - `verify_locked_at IS NOT NULL AND NOT on_lockout_allowlist` → false
   - `requires_verified AND NOT email_verified` → false
   - permission-scope override (allow/deny) → its action
4. **Per-route DB function gates** (e.g., `user_passed_article_quiz`, `assertKidOwnership` in `web/src/lib/kids.js:13-23`) — extra checks specific to the action
5. **RLS policies** (Postgres row-level security on each table) — the actual byte-level gate; can deny SELECT/INSERT/UPDATE/DELETE even after perms pass
6. **Plan-feature numeric caps** (`plan_features` table — e.g., bookmarks=10) — enforced server-side at write time

**Each layer can deny independently. The UI's `hasPermission()` only evaluates layer 3, which means the UI can show a button the API rejects.**

The lockout allowlist for layers 1-3 is anything matching `appeal.* | account.* | login.* | signup.* | settings.*`. Banned users and verify-locked users keep these surfaces.

### NavWrapper's parallel "tier" string

In addition to the perm system, `web/src/app/NavWrapper.tsx:74-86` runs its own resolver:

```js
if (!user) return 'anon';
if (!user.email_verified) return 'anon';
return user.plans?.tier || 'free_verified';
```

This produces a single string used for analytics, telemetry, and any UI code branching on tier. Maps to:
`'anon' | 'free_verified' | 'verity' | 'verity_pro' | 'verity_family' | 'verity_family_xl'`.

**A signed-in user with Pro plan but `email_verified=false` is reported as `'anon'` here, despite having every Pro permission via plan-set in compute_effective_perms.** Analytics undercount Pro by however many beta users haven't verified.

---

## 2. Roles (8 total, hierarchy is sort order, not inheritance)

Live DB query confirms:

| Role | Hierarchy | Perms via role-permission-sets |
|---|---|---|
| `owner` | 100 | 940 |
| `admin` | 80 | 925 |
| `editor` | 70 | 700 |
| `moderator` | 60 | 666 |
| `educator` | 50 | 474 |
| `expert` | 50 | 474 |
| `journalist` | 50 | 474 |
| `user` | 10 | 420 |

A user gets the **union** of all permission sets attached to all their roles. Higher hierarchy_level only matters for one thing: when the same permission is granted by two roles, the higher-level role's `granted_via` wins as the source attribution. The result is the same: granted=true.

Every signed-up account gets the `user` role automatically (signup route + `handle_new_auth_user` DB trigger). Staff roles layer on top.

---

## 3. Plans (9 total)

| Plan | Tier | Price | Perms via plan-permission-sets |
|---|---|---|---|
| `free` | free | $0 | 376 |
| `verity_monthly` | verity | $3.99 | 545 |
| `verity_annual` | verity | $39.99 | 545 |
| `verity_family_monthly` | verity_family | $14.99 | 559 |
| `verity_family_annual` | verity_family | $149.99 | 559 (inactive) |
| `verity_family_xl_monthly` | verity_family_xl | $19.99 | 559 (inactive) |
| `verity_family_xl_annual` | verity_family_xl | $199.99 | 559 (inactive) |
| `verity_pro_monthly` | verity_pro | $9.99 | 545 |
| `verity_pro_annual` | verity_pro | $99.99 | 545 |

**Critical finding:** `verity_monthly` ($3.99) and `verity_pro_monthly` ($9.99) grant **identical permission sets** (545 perms each). The differentiation is purely pricing/positioning, not features. The owner-link beta grants `verity_pro_monthly` specifically — but a $3.99 Verity user gets the exact same product capabilities. Either a pricing/messaging bug or a deliberate "founder pricing tier."

`verity_family_monthly` is the only active family SKU. The XL plans are inactive but still in the schema.

---

## 4. Permission sets (the abstraction layer)

21 active sets in the live DB. Top groupings:

| Set key | Perm count | Attached to roles | Attached to plans |
|---|---|---|---|
| `owner` | 931 | 1 (owner) | 0 |
| `admin` | 917 | 2 (owner, admin) | 0 |
| `free` | 376 | all 8 roles | all 9 plans |
| `pro` | 245 | 4 roles | 8 plans |
| `editor` | 160 | 3 roles | 0 |
| `expert` | 133 | 7 roles | 0 |
| `moderator` | 126 | 3 roles | 0 |
| `family` | 123 | 1 (owner) | 4 (family/xl plans) |
| `anon` | 86 | all 8 roles | 0 |
| `unverified` | 0 | all 8 roles | 0 (allowlist contract for verify-locked users) |
| `family_perks` | 0 | 0 | 0 (placeholder) |
| `kids_session` | 0 | 0 | 0 (placeholder) |

Inactive (retired but not deleted): `home_browse`, `verified_base`, `expert_tools`, `comments_base`, `base`, `article_interactive`, `verity_pro_perks`, `article_viewer`, `verity_perks`. Dead taxonomy that didn't get cleaned up after a perm-set restructure.

**Important:** the `anon` set is attached to all 8 roles. So a logged-in user inherits the anon set's 86 perms via their role, plus the free set's 290-perm delta, plus whatever plan grants on top.

---

## 5. The 927 permissions, by capability slice

Live DB stats:
- 927 active perms
- 21 with `requires_verified=true` (extra gate beyond verify_locked_at)
- 3 with `is_public=true` (anon-accessible without role)
- 34 distinct `ui_section` values
- 0 with `deny_mode='silent'` or `'visible'` (column exists, not used)

### The 21 `requires_verified=true` perms (compute_effective_perms hard-blocks if `email_verified=false`)

```
article.listen_tts             — TTS playback (Pro feature)
bookmarks.unlimited            — capped at default otherwise
comments.downvote
comments.mention_user
comments.post                  — top-level comment
comments.reply
comments.report
comments.upvote
family.shared_achievements
family.view_leaderboard
supervisor.opt_in              — moderator opt-in
profile.achievements
profile.activity
profile.card_share
profile.categories
profile.follow                 — follow another user
profile.header_stats
search.advanced
admin.pipeline.categories.manage
admin.pipeline.clusters.manage
admin.pipeline.presets.manage
```

**Implication:** an owner-link beta user with Pro plan + `email_verified=false` keeps `plan_id=verity_pro_monthly` but cannot use any of these. Their Pro grant is functionally meaningless until they verify.

### The 3 `is_public=true` perms (anon-accessible)

```
comments.view                  — read comment threads
leaderboard.view               — view rankings
profile.expert.badge.view      — see expert badges
```

### What anon can actually do (the 86-perm anon set, abridged)

Reading: every `article.view.*`, `article.feed.view`, `home.feed.view`, `browse.view`, `home.search`, `search.articles.free`, `comments.section.view`, `comments.view`, `leaderboard.view`.

Auth + signup surfaces: `login.*`, `signup.*` (10 perms total), `permissions.version.get`, `signup.enter_access_code`.

Anon CANNOT (perm-wise, before RLS even fires):
- `quiz.attempt.start` / `quiz.attempt.submit` (in `free` set, not `anon`)
- `comments.post` (also `requires_verified=true` on top)
- `article.bookmark.add` / `article.read.log`
- Any vote, follow, report

### The free → pro delta (245-perm "pro" set)

What paying $3.99+ unlocks:
- `ads.suppress`, `article.view.ad_free`, `article.ad_slot.view.paid`
- `article.listen_tts`, `article.tts.play`, all `ios.tts.*`
- `article.expert_responses.read`, `expert.ask`
- `bookmarks.unlimited` + collections + notes + export + reorder
- `comments.mention_user` (full autocomplete), `comments.author.open_dm`, `comments.score.view_*`
- `home.breaking_banner.view.paid`, `home.digest_slot.view`, `home.recommended_slot.view`
- iOS extras: keychain pin, dynamic island badge, background refresh, offline cache, biometric kid_exit
- All `kids.*` perms (kids product)

---

## 6. RLS policies on user-facing tables

Confirmed via `pg_policies` query against the live DB.

### `articles`
- **SELECT:** `(status='published' AND deleted_at IS NULL) OR auth.uid() = author_id OR is_editor_or_above()`
  - **Anyone (anon included) can SELECT every published article.** No tier gate at the DB layer.
- **INSERT/UPDATE/DELETE:** `is_editor_or_above()` only
- **RESTRICTIVE:** `articles_block_kid_jwt` — denies ALL when `is_kid_delegated()` is true (kids see articles via separate filtered path)

### `comments`
- **SELECT:** `(status='visible' AND deleted_at IS NULL) OR own OR mod+`
- **INSERT:** `user_id=auth.uid() AND has_verified_email() AND NOT is_banned() AND user_passed_article_quiz()`
  - **Verify check + ban check + quiz check baked into RLS, not just compute_effective_perms.** Even bypassing the API layer, RLS rejects.
- **UPDATE/DELETE:** own OR mod+

### `quiz_attempts`
- **INSERT:** `user_id=auth.uid() AND has_verified_email() AND NOT is_banned() AND ((kid_profile_id IS NULL) OR owns_kid_profile())`
  - **Anon literally cannot start a quiz** — RLS rejects regardless of perm gate. This is why the "comment after passing quiz" loop is unreachable for anon at the bytes level.
- **SELECT:** own OR admin+

### `reading_log`
- **INSERT:** `user_id=auth.uid() AND ((kid_profile_id IS NULL) OR owns_kid_profile())`
- **SELECT:** own OR admin+
- Anon cannot log reads.

### `bookmarks`
- All ops: pure ownership `user_id=auth.uid()`. No verified-email requirement at RLS layer; the cap is enforced via `plan_features` in the API layer.

### `reports`
- **INSERT:** `reporter_id=auth.uid() AND has_verified_email() AND NOT is_banned()`. Anon and unverified can't report.

### `users`
- **SELECT:** own OR `profile_visibility='public'` OR `is_admin_or_above()`
  - Private profiles invisible to other users at DB layer. Self always visible.
- **INSERT:** `id=auth.uid()` (signup creates self)
- **UPDATE:** `id=auth.uid() OR is_admin_or_above()` — but `users_protect_columns_trigger` blocks specific columns from self-update (see §10)
- **RESTRICTIVE:** `users_select_block_kid_jwt` — kids cannot SELECT from `users` table at all

### `kid_profiles`
- **SELECT:** own as parent + has `profile.kids` perm + admin+; kid JWT can SELECT own + siblings + global-leaderboard-opted-in
- **INSERT/UPDATE:** parent + has `profile.kids` perm
- **DELETE:** parent only

### `access_codes` / `access_code_uses`
- **SELECT/INSERT/UPDATE on access_codes:** admin+ only
- **SELECT on access_code_uses:** admin+ OR self-as-redeemer OR self-as-referrer

---

## 7. The kid-JWT system (verified live)

Adult sessions and kid sessions are two distinct auth dimensions on the platform. Per CLAUDE.md, kids product is iOS-only (web is redirect-only), but the DB enforces the kid-JWT model regardless of client.

### How it works

A kid session presents a JWT with `app_metadata.kid_profile_id` set. The DB function `is_kid_delegated()` (live in `pg_proc`, no args) returns true when this claim is present. `current_kid_profile_id()` extracts it via `auth.jwt() -> 'app_metadata' ->> 'kid_profile_id'` (defined in `Ongoing Projects/migrations/2026-04-27_phase3_age_banding.sql:176-182`).

`auth.uid()` in a kid session resolves to the kid's auth.users row, not the parent's.

### RLS-enforced kid restrictions

Every kid-relevant content table has a `*_block_kid_jwt` RESTRICTIVE policy:
- `articles` — kids see only rows allowed for their reading_band
- `comments` — kids blocked entirely from comments (no visible policy that admits them)
- `kid_profiles` — kids see only their own + siblings (via `parent_user_id` JWT claim)
- `quiz_attempts` — kids see only their own attempts
- `reading_log` — kids see only their own reads
- `users` — kids cannot SELECT at all

### Kid management (parent-side, fully implemented)

All `/api/kids/*` routes exist (`route.js` files; one agent missed them looking only for `.ts`):

```
/api/kids/route.js
/api/kids/[id]/route.js
/api/kids/[id]/advance-band/route.ts
/api/kids/[id]/dob-correction/route.ts
/api/kids/[id]/streak-freeze/route.js
/api/kids/generate-pair-code/route.js
/api/kids/global-leaderboard/route.js
/api/kids/household-kpis/route.js
/api/kids/pair/route.js
/api/kids/refresh/route.js
/api/kids/reset-pin/route.js
/api/kids/set-pin/route.js
/api/kids/trial/route.js
/api/kids/verify-pin/route.js
```

All 15 kid-related DB functions exist live: `is_kid_delegated`, `owns_kid_profile`, `has_permission`, `current_kid_profile_id`, `convert_kid_trial`, `freeze_kid_trial`, `generate_kid_pair_code`, `clear_kid_lockout`, plus `kid_family_leaderboard`, `graduate_kid_profile`. (Per memory rule M-22: live schema is canonical, not the migrations folder.)

### Family plan gating

`family` permission set (123 perms) attached to:
- 1 role: `owner`
- 4 plans: `verity_family_monthly`, `verity_family_annual`, `verity_family_xl_monthly`, `verity_family_xl_annual`

Of the 4 plans, only `verity_family_monthly` is active. Non-owner family-plan members get family perms via `plan_perms`, not `role_perms`.

Permissions checked by `web/src/app/profile/kids/page.tsx`:
- `kids.parent.view` — page-level gate
- `family.add_kid` — Add button
- `family.remove_kid` — Remove action
- `kids.trial.start` — Start trial button
- `kids.parent.household_kpis` — KPI dashboard

### Kid JWT minting

iOS-side concern. The web app does not mint kid JWTs; the iOS app does this via Supabase OAuth flow + a custom claim writer. The `/api/kids/pair` and `/api/kids/generate-pair-code` routes mediate device pairing.

---

## 8. The 8 user-state kill-switches (independent state machines on `users` row)

Each can block a user independently. They are NOT synchronized — a user can be in any combination.

| Flag | Set by | What it blocks | Banner (AccountStateBanner.tsx precedence order) |
|---|---|---|---|
| `is_banned` | mod action | EVERY perm except appeal/account/login/signup/settings allowlist | "Account banned" → `/appeal` (1st) |
| `locked_until` | failed-login lockout | Re-login | "Temporarily locked" → `/forgot-password` (2nd) |
| `is_muted` / `muted_until` | mod action | Comment posting (RLS at scoring layer) | "You are muted" → `/appeal` (3rd) |
| `deletion_scheduled_for` | self-initiated D40 | Nothing (read continues), auto-delete in 40 days | "Account deletion scheduled" → `/profile/settings/data` (4th) |
| `frozen_at` | Stripe cancel + grace lapse, refund, dispute lost | Comment scoring, DM | "Verity Score frozen" → `/billing` (5th) |
| `plan_grace_period_ends_at` | Stripe cancel | DM (locked='grace'), but reads continue | "Plan ends in N days" → `/billing` (6th) |
| `verify_locked_at` | apply_signup_cohort or sweep_beta_expirations | Same allowlist as banned | (BetaStatusBanner separately) |
| `comped_until` | sweep_beta_expirations | Nothing in itself; `<` now triggers downgrade | (BetaStatusBanner separately) |

**`AccountStateBanner` evaluates these in order and shows the FIRST match only.** A banned + frozen user sees the ban banner only, never knows their score is frozen too.

`BetaStatusBanner` is a separate component that handles `verify_locked_at` (hard lock) and `comped_until` (grace).

`frozen_verity_score` is a snapshot of the user's `verity_score` at freeze time, displayed as "frozen at X points" while live scoring is suspended. Restored by `billing_resubscribe` on unfreeze.

---

## 9. The Stripe + plan-grant chain

### Every plan_id mutation path

**Stripe webhook** (`web/src/app/api/stripe/webhook/route.js`) handles:
- `checkout.session.completed` → `billing_change_plan` (or `billing_resubscribe` if frozen)
- `customer.subscription.updated` with `cancel_at_period_end=true` → `billing_cancel_subscription` (sets `plan_grace_period_ends_at`)
- `customer.subscription.updated` with `cancel_at_period_end=false` (un-cancel) → `billing_uncancel_subscription` or direct grace clear
- `customer.subscription.deleted` → `billing_freeze_profile`
- `invoice.payment_succeeded` → direct clear of `plan_grace_period_ends_at`, set `plan_status='active'`, bump perms
- `charge.refunded` (full + auto-freeze setting on) → `billing_freeze_profile`
- `charge.refund.updated` (status='reversed') → `billing_unfreeze`
- `charge.dispute.closed` (won) → `billing_unfreeze`

Idempotency via `webhook_log.event_id` UNIQUE constraint.

**iOS App Store webhook** (`web/src/app/api/ios/appstore/notifications/route.js`) follows the same chain — REVOKE → `billing_freeze_profile`.

**iOS receipt sync** (`web/src/app/api/ios/subscriptions/sync/route.js`) — same RPCs, called on app foreground.

**Promo redemption** (`web/src/app/api/promo/redeem/route.js`) — `billing_change_plan` or `billing_resubscribe` if frozen.

**Beta cohort** (live DB functions, defined in migrations 2026-04-26_*):
- `apply_signup_cohort(p_user_id, p_via_owner_link)` — at signup; tags cohort, optionally grants Pro
- `complete_email_verification(p_user_id)` — clears `verify_locked_at`, re-runs cohort apply, mints referral slugs, bumps perms_version
- `grant_pro_to_cohort(...)` — admin bulk grant
- `sweep_beta_expirations()` — nightly cron behavior (see §11)

**Hourly grace cron** (`web/src/app/api/cron/freeze-grace/route.js`) — calls `billing_freeze_expired_grace()` to freeze any user where `plan_grace_period_ends_at < now()`.

**Admin manual sync** (`web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js`) — direct writes to `users.plan_id`/`plan_status`/`plan_grace_period_ends_at`. Does NOT route through billing RPCs.

### `users_protect_columns_trigger`

Defined in `Ongoing Projects/migrations/2026-04-26_beta_cohort_referrals.sql:395-431`. Fires BEFORE UPDATE on `users`. Rejects self-updates to:
`cohort, comped_until, verify_locked_at, plan_id, plan_status, plan_grace_period_ends_at, stripe_customer_id, frozen_at, frozen_verity_score, perms_version`

Service-role and admin roles bypass. **The signup route MUST use the service client to flip `email_verified=true`** for owner-link admin-confirm.

### `plan_status` enum values (implied from code)

- `'active'` — paid plan, full features
- `'cancelled'` — cancelled/downgraded; grace may be set
- `'free'` — free tier (when `plan_id=NULL` or set to free plan)
- `'frozen'` — fully frozen (rare, distinct from grace)
- `'past_due'` — Stripe-side; reflected here

---

## 10. The `verify_locked_at` mechanism + `compute_effective_perms` short-circuit

`compute_effective_perms` is defined in `Ongoing Projects/migrations/2026-04-26_beta_cohort_referrals.sql:151-330`. The CASE evaluation order at lines 288-300:

```sql
WHEN f.u_is_banned AND NOT f.on_lockout_allowlist THEN false
WHEN f.u_verify_locked_at IS NOT NULL AND NOT f.on_lockout_allowlist THEN false
WHEN f.requires_verified AND COALESCE(f.u_email_verified, false) = false THEN false
WHEN f.ovr_action = 'allow' THEN true
WHEN f.ovr_action IS NOT NULL THEN false
WHEN f.user_set_key IS NOT NULL THEN true
WHEN f.is_public THEN true
WHEN f.role_name IS NOT NULL THEN true
WHEN f.plan_name IS NOT NULL THEN true
ELSE false
```

`on_lockout_allowlist` = perm key matches `appeal.* | account.* | login.* | signup.* | settings.*`.

So `verify_locked_at` (set by either `apply_signup_cohort` for user-link beta or `sweep_beta_expirations` after beta-end) strips ALL non-allowlist perms. Cleared only by `complete_email_verification` (called from `/api/auth/callback` on email-link click).

---

## 11. The beta cohort sweep (`sweep_beta_expirations`)

Defined in `Ongoing Projects/migrations/2026-04-26_beta_cohort_referrals.sql:989-1090`. Runs as a cron (Vercel scheduled function).

**When `settings.beta_active='true'` (re-enable case):**
- Clears `comped_until` and `verify_locked_at` for ALL beta users (lines 1015-1025)

**When `settings.beta_active='false'` (beta-end):**
- For verified beta users with no `comped_until`: stamps `comped_until=now()+grace_days` (default 14 days)
- For unverified beta users with no `verify_locked_at`: stamps `verify_locked_at=now()` — **even owner-link recipients**
- For users with `comped_until < now()`: downgrades `plan_id=NULL`, `plan_status='free'`

All writes bump `perms_version`.

**Implication for the auth-flow change:** the moment you flip `beta_active=false`, every owner-link signup who never verified email gets hard-locked (loses Pro, stripped to allowlist). The "owner-link doesn't need to verify" promise has a hard expiry baked into this cron unless we admin-confirm them at signup (which makes their `email_verified=true` and the cron skips them via `WHERE email_verified=false`).

---

## 12. Permissions cache architecture

### Client-side (`web/src/lib/permissions.js`)

**Layers:**
- `allPermsCache: Map<permission_key, row> | null` — in-memory only; null = "never loaded"
- `versionState: { user_version, global_version, checkedAt }` — tracked per page-load
- `inflight: Map` — dedupes concurrent fetches
- No localStorage, no sessionStorage, no realtime subscription

**Invalidation flow (`refreshIfStale`):**
1. Call `my_perms_version()` RPC, get `{user_version, global_version}`
2. If either bumped vs cached → hard-clear `allPermsCache = null` (fail-closed during refetch)
3. Await `refreshAllPermissions()` to populate fresh map
4. Update `checkedAt`

**When this fires:** every page navigation calls `refreshIfStale()` on mount. **There is no timer, no realtime, no push.** A perms change reaches the client only when they navigate.

### perms_version bump callers

- `apply_signup_cohort` (when Pro granted, lines 706, 757)
- `complete_email_verification` (line 795)
- `sweep_beta_expirations` (lines 956, 1019, 1031, 1044, 1058)
- Admin routes: `/api/admin/permissions/user-grants`, `/api/admin/subscriptions/[id]/manual-sync`, `/api/admin/users/[id]/plan`, `/api/admin/users/[id]/role-set`, `/api/admin/users/[id]/ban`
- Webhooks: `/api/stripe/webhook` (after subscription events), `/api/ios/appstore/notifications`

**Notably does NOT bump:**
- `/api/auth/email-change` — when `email_verified` flips false, the 21 `requires_verified=true` perms silently flip granted=false in the DB, but the client cache still shows them granted until next navigation. **Bug.**

### Server-side

Each `requirePermission()` call hits `compute_effective_perms` directly. **No per-request memoization** — two `requirePermission` calls in the same request execute two DB calls.

---

## 13. The email-change flow (`/api/auth/email-change`)

Steps from `web/src/app/api/auth/email-change/route.js`:

1. `requireAuth` + email shape validation + rate limit (3/hour per user+IP)
2. `auth.updateUser({email})` — Supabase queues pending email change + sends confirmation to NEW address
3. Service-role flips `public.users.email_verified=false` immediately
4. Audit log insertion (best-effort)

**The `on_auth_user_updated` DB trigger** (lives in Supabase auth, not in our migrations) flips `email_verified=true` back when the user clicks the confirm link in the new email.

**Side effects we don't handle:**
- `verify_locked_at` is NOT touched. If a user was locked at signup and changes email mid-lock, they stay locked + lose 21 requires_verified perms on top.
- `perms_version` is NOT bumped. Client carries stale grants for up to a navigation cycle. **Bug.**
- `terms_accepted_at` is NOT updated. User does not re-agree to terms on email change.
- `public.users.email` is NOT updated by this route. Stays at the old email until the new one is confirmed (by the trigger). Profile, admin tools, audit logs see stale email during pending-confirm window.

If user never confirms new email: stuck with `email_verified=false` indefinitely. No auto-revert. Support intervention required to recover.

If beta is still active when user changes email and doesn't verify: the next `sweep_beta_expirations` run will stamp `verify_locked_at` on them again (per `WHERE email_verified=false AND verify_locked_at IS NULL` clause).

---

## 14. The frozen flow

### Set by

- Stripe `subscription.deleted` → `billing_freeze_profile`
- Stripe full refund + `billing.refund_auto_freeze` setting on → `billing_freeze_profile`
- Hourly `freeze_grace` cron when `plan_grace_period_ends_at < now()` → `billing_freeze_expired_grace`
- iOS REVOKE → `billing_freeze_profile`
- Admin manual freeze: `/api/admin/billing/freeze`

### Cleared by

- Dispute won (`charge.dispute.closed` status='won') → `billing_unfreeze`
- Refund reversed (`charge.refund.updated` status='reversed') → `billing_unfreeze`
- Resubscribe (Stripe checkout, promo redeem if frozen, iOS sync) → `billing_resubscribe` (which clears `frozen_at` + restores plan + bumps perms)

**No admin unfreeze route** — has to go through resubscribe path or direct DB.

### What freezing actually disables

- Score scoring (no new points accrue)
- DM access (`messages/page.tsx` sets `dmLocked='frozen'` when `frozen_at` is set)
- Leaderboard visibility (filtered out via `.is('frozen_at', null)`)

**What it does NOT disable:**
- Comments — no `frozen_at` check in comment routes or RLS
- Voting — no check
- Following — no check
- Reading — no check

So a frozen user can still comment and follow. The freeze is primarily a scoring + DM lockout, not a content lockout.

---

## 15. Surface-by-surface: who sees what

### `/` (home)
- Anon: full hero + supporting stories, breaking strip, footer. No nav bottom changes by tier.
- Free verified+: same plus read-dimmed titles + "Read" tag for previously-read articles
- Pro/Family: same render
- All tiers: AccountStateBanner if any kill-switch active
- No regwall on home (story page owns the gate)

### `/story/[slug]`
- Anon: full article body (RLS allows), regwall would fire after `freeReadLimit` opens but `LAUNCH_HIDE_ANON_INTERSTITIAL=true` currently disables the regwall in production
- Free unverified: body + paywall messaging; cannot comment/quiz/bookmark/report
- Free verified: body + sources + timeline + comments (after passing quiz) + bookmark up to 10 + ads
- Pro verified: + TTS, ad-free, unlimited bookmarks, mention users, expert responses, comment subcategory scores
- Family verified: same as Pro
- **Owner-link Pro unverified: body intact, but TTS button disabled, sources hidden (requires_verified-adjacent? actually anon-allowed — verify), bookmarks capped at 10, comments locked, no upvote/downvote/follow/mention. Functionally degraded to free-tier despite Pro plan.**
- User-link beta (verify-locked): allowlist only. Story page renders the locked panel.
- Banned: full read intact, AccountStateBanner "Appeal" shows; comments RLS rejects POST
- Frozen: read intact, comments allowed, score frozen, DM locked
- Kids (iOS): server-filtered to kids-safe articles only

### `/profile`
Tabs: Overview (always), Activity (`profile.activity`), Categories (`profile.categories`), Milestones (`profile.achievements`).
- Free unverified / Pro unverified: Overview only (3 tabs locked)
- Free verified+: all 4 tabs
- Banned/Frozen/Muted: all tabs visible; banner overlays

### `/profile/settings`
Sections gated by perm constants. Permission keys include `settings.account.*`, `settings.alerts.view`, `billing.view.plan`, etc. Most accessible to free users; billing+expert+supervisor+family sections gated.
**Owner-link Pro unverified is locked out of `/profile/settings#billing`** — primary upgrade CTA, broken for them.

### `/profile/kids`
- `kids.parent.view` gate. Family plan only. Non-family users: "No access."
- Family Pro verified: full kids dashboard (add/remove/pause kid profiles, household KPIs, trial state)
- Family unverified: locked

### `/leaderboard`
- Anon: top 3 only
- Free verified: full list (`leaderboard.view`)
- Pro verified: full list + category drill-down (`leaderboard.category.view`)
- **Hardcoded `.eq('users.email_verified', true)` filter on lines 207, 242, 327** — Pro unverified users see top 3 only despite plan grant
- Banned and frozen filtered out server-side

### `/messages` (DM)
- Anon: redirect to login
- Free: limited DM access
- Pro: full DM
- Stripe-grace: `dmLocked='grace'` overlay
- Frozen: `dmLocked='frozen'` overlay

### `/admin/*`
- `MOD_ROLES` = owner / admin / editor / moderator
- Anon, regular users, expert: 404 (NOT a redirect — hides existence from crawlers)
- Mod+ roles: full access; sub-pages enforce stricter role per page

### NavWrapper bottom nav
- All tiers: 4 slots (Home / Notifications / Most Informed / Profile-or-Sign-up)
- Anon: 4th slot is "Sign up"
- Authed: 4th slot is Profile

---

## 16. Confirmed anomalies (real, with code citations)

1. **Owner-link beta users (Pro plan, email_verified=false) are gutted.** Today they get Pro plan in DB, but 21 perms with `requires_verified=true` are short-circuited to false in `compute_effective_perms` (migration line 291-292). Cannot comment, follow, vote, bookmark unlimited, see own activity/achievements, use TTS, advanced search. Welcome page bypass at `web/src/app/welcome/page.tsx:89` lets them past the welcome carousel — no other surface has this bypass.

2. **NavWrapper reports them as `tier='anon'`** for analytics (`NavWrapper.tsx:75`). Analytics undercounts Pro by however many beta users haven't verified.

3. **Free unverified and Pro unverified see top-3-only leaderboard** — leaderboard query has hardcoded `.eq('users.email_verified', true)` (lines 207, 242, 327) that overrides the perm grant. Inconsistent with `leaderboard.view` being public.

4. **No double-billing guard on Stripe + cohort.** A beta user with cohort Pro who hits Stripe checkout pays twice. `sweep_beta_expirations` only modifies local state — never cancels the upstream Stripe sub. So if cohort downgrades them at beta-end, Stripe keeps charging.

5. **`AccountStateBanner` shows only the first matching state.** A banned + frozen user sees the ban banner only, never knows their score is frozen too.

6. **`/api/auth/email-change` does not bump perms_version.** When `email_verified` flips false, the 21 requires_verified perms silently flip granted=false in the DB, but the client cache still grants them until next navigation. User can keep clicking buttons that the API will reject for ~60s.

7. **Email-change does not touch `verify_locked_at`.** A verify-locked user who changes email stays locked + loses 21 perms on top.

8. **Email-change does not update `public.users.email`.** Profile, admin tools, audit logs see stale email during the pending-confirm window.

9. **Admin manual-sync downgrade ignores `frozen_at`.** A frozen user downgraded via admin → still frozen, but on free plan. Logically incoherent.

10. **`frozen_at` and `plan_grace_period_ends_at` don't clear each other.** A user can have both set; banner shows only the higher-priority one.

11. **`verity_monthly` ($3.99) and `verity_pro_monthly` ($9.99) grant identical perm sets.** Pricing differentiation only, no feature differentiation. Either intentional founder pricing or a configuration bug.

12. **No push for perms changes.** Stripe webhook bump → user sees up to ~60s lag (or indefinite if they don't navigate). Not great for ad-free state when a user just paid. (Cross-ref: §21.2 item #14 from the redesign review independently flagged the same — "Permission state doesn't refresh in real-time. A plan upgrade in another tab doesn't unlock sections until refresh." Suggests wiring `my_perms_version()` polling at 60s into ProfileApp's load effect.)

13. **The 4 inactive family/family_xl SKUs still in DB.** Likely launch-flagged off; verify before launch that they're hidden everywhere.

14. **Free-reads pill on the story page is currently lying to anon users** (`web/src/app/story/[slug]/page.tsx:1589-1598`). Renders "N of 5 free reads" but `LAUNCH_HIDE_ANON_INTERSTITIAL=true` (line 90) hides the regwall enforcement. Pill creates an expectation that's never enforced. RESOLVED in Phase 0.4 — drop both the pill and the enforcement permanently per owner direction (no read limit).

15. **No lifecycle email cadence for unverified users.** Verify email is sent at signup and never again. If the user doesn't click within minutes, no 24h / 72h / 7d / 14d nudge cadence to recover them. Whole bucket abandons silently. Out of scope for the auth-flow PR — separate project.

16. **Locked profile tabs (Activity / Categories / Milestones) signal "Pro feature" not "verify your email"** (`web/src/app/profile/page.tsx:593,612,631`). The `<LockedTab>` lock-icon implies upgrade-path. Actually means click-the-email. Misleading copy. Free unverified users likely think these are paid features they don't have. Phase 1's `<VerifyGate>` work should extend here — replace lock-icon + add "Verify your email to unlock" inline message.

17. **TTS button on story page renders disabled-but-visible for non-Pro users** (`web/src/app/story/[slug]/page.tsx:1805-1810`, gated on `canListenTts = hasPermission('article.listen_tts')`). A free verified user sees the button but it doesn't work and there's no upgrade messaging. Worse than hiding it — it's a tease that doesn't convert. Either hide entirely (`tier === 'pro' || tier === 'family'` check before render) or convert to upsell button ("Listen with Pro · $3.99/mo"). Phase 2 visual decision.

18. **Comment composer lock copy is inconsistent across states** (`web/src/app/story/[slug]/page.tsx:1337-1387`). Three different messages depending on state:
    - Anon: "Discussion is for signed-in readers — Create free account"
    - Verified, no quiz pass: "Pass the quiz to join"
    - Free unverified or Pro unverified: "Create account" (despite already having an account)
    None of these tell the user what to do next when stacked gates apply (e.g., "verify email AND pass the quiz"). Phase 1 `<VerifyGate>` + new `<QuizGate>` component should unify into one consistent state-driven copy with the right CTA per state.

19. **No "Pro pride-of-status" surface anywhere in the everyday flow.** Pro users blend in with free-verified visually. No badge on their profile, no label in comments, no nav-bar indicator. Pride-of-status is a real retention driver for paid tiers (every paid consumer product has one). Phase 2 visual decision — likely a small "Pro" pill next to the username in comments + on the profile header.

20. **Owner-link recipients are locked out of `/profile/settings#billing`** (`billing.view.plan` requires verified email). They can't reach the upgrade page even if they wanted to actually pay (vs. using the comp). Active money-refusal pattern. RESOLVED in Phase 1 by the 48h grace window — `compute_effective_perms` will grant `billing.view.plan` to owner-link users during grace.

21. **Anon visitors have no "save for later" affordance.** They can't bookmark (requires_verified). No "remind me of this story" email capture. No anon-side return mechanism at all. Read-once-never-return is the default outcome. Out of scope for the auth-flow PR — separate retention project.

22. **`access_codes.type` taxonomy is dual-purpose and inconsistent.** `'referral'` type (with `tier='owner'|'user'`) drives the live invite flow. `'invite'|'press'|'beta'|'partner'` types are mintable via `/admin/access` UI but **NOT honored** by `/r/<slug>` or `/api/access-redeem` (both filter `.eq('type', 'referral')`). Admins minting non-referral codes get codes that do nothing. Either delete the legacy types from the schema enum + admin UI, or wire them into the redemption flow. Today they're dead UI.

---

### Pen-test findings (verified 2026-04-27)

23. **Unicode homoglyph bypass on ban-evasion check** (`web/src/app/api/auth/signup/route.js:57`). The check uses `.ilike('email', email)` against banned accounts. `ilike` does ASCII case-folding only, NOT Unicode normalization. A banned `bad@example.com` is bypassed by signing up as `baԁ@example.com` (Cyrillic 'а' U+0430 instead of Latin 'a' U+0061). Same visual identity, different bytes, ban check passes. **Severity: HIGH.** Real, exploitable, cheap to fix (normalize both emails to NFKD before compare, or use a homoglyph-aware library). Recommend fold into Phase 0 (5-line change).

24. **Public-profile column-level leakage on `users` table.** RLS policy is row-level: `id=auth.uid() OR profile_visibility='public' OR is_admin_or_above()`. When a user's profile_visibility='public', their ENTIRE row is readable, including sensitive columns: `email`, `plan_id`, `stripe_customer_id`, `comped_until`, `cohort`, `frozen_at`, all the kill-switch flags. Anyone querying via PostgREST `from('users').select('*')` against a public profile gets PII + billing state. **Severity: HIGH.** Fix requires either (a) a SECURITY DEFINER view with whitelisted columns for public reads, or (b) splitting `users` into a public_profile view and a private internal table. Not a Phase 0/1 fit — separate hardening project. (Cross-ref: §21.1 item #2 from the redesign review flagged a related issue — `users.profile_visibility` enum mismatch where PrivacyCard writes `'hidden'` but PublicProfileSection writes `'public'|'private'`, can flip each other unexpectedly. Same column, different write paths.)

25. **Kid pair-code grants 7-day impersonation if leaked** (`web/src/app/api/kids/pair/route.js:136-150`, TTL_SECONDS = 7 days at line 24). Pair code → JWT signed with `SUPABASE_JWT_SECRET` carrying `is_kid_delegated: true`. RLS branches on this claim. If a parent shares the pair code via Slack/SMS/screenshot and an attacker grabs it before the kid does, attacker gets 7 days of full kid-session impersonation: read kid's reading log, quiz attempts, sibling kid_profiles, etc. **Severity: HIGH.** Mitigations: shorter TTL, single-use enforcement (already done — `redeem_kid_pair_code` marks as used), out-of-band confirmation (e.g., parent approves the device pair via separate UI before JWT issues). Out of scope for current work — separate kids security pass.

26. ~~**`/api/access-redeem` parses JSON body before rate limit fires**~~ — **[RESOLVED 2026-04-27 — TODO 5th-pass verification]** Re-read of `web/src/app/api/access-redeem/route.ts` shows rate-limit check at lines 39-44 fires BEFORE `request.json()` at line 52. Order is correct. Original claim was stale at the time of this doc's writing. No fix needed. (See `CHANGELOG.md` entry "AUTH/PERMS SYSTEM MAP audit" 2026-04-27.)

27. ~~**Login-precheck timing side-channel for account enumeration**~~ — **[RESOLVED 2026-04-27 — TODO 5th-pass verification]** Re-read of `web/src/app/api/auth/login-precheck/route.js` confirms compensating controls in place: constant-shape response (lines 47, 56, 65), email normalization (line 28), per-IP rate limit (30/h), per-email rate limit (3/h). Residual timing leak is below the noise floor of 30k-account enumeration vs. the rate-limit ceiling. Treating as ALREADY-MITIGATED — separate hardening pass not required pre-launch. (See `CHANGELOG.md` 2026-04-27.)

28. **Audit log writes are best-effort across multiple routes** (`web/src/app/api/auth/signup/route.js:200-210` and similar). Try/catch swallows audit insert failures. An attacker who can race a signup against a DB connection-pool exhaustion (or transient network partition) can produce un-audited account creations. **Severity: MEDIUM.** Fix: queue audit events on a separate retry queue (e.g., another DB row that a cron processes), or fail the request if audit fails for security-critical actions. Out of scope.

29. **CORS allow-list trusts `NEXT_PUBLIC_SITE_URL` env var without validation** (`web/src/middleware.js:167-174`). If env var is set to a hostile origin (CI/CD misconfig, env injection), that origin gets credentialed CORS access to all `/api/*`. **Severity: MEDIUM.** Fix: hardcode the production origins, treat env-var origin as additive-only-when-staging. Easy hardening.

30. ~~**Email-change race condition**~~ — **[RESOLVED 2026-04-27 — TODO 5th-pass verification]** Re-read of `web/src/app/api/auth/email-change/route.js:99-120` shows current handler calls `auth.updateUser` FIRST (line 99), THEN flips `public.users.email_verified=false` (lines 117-120). The race window described (local flip beats updateUser) is no longer reproducible — order is correct. Residual concerns about side-effect coverage (`verify_locked_at` not cleared, `public.users.email` not synced, no `perms_version` bump) are tracked under TODO T306 + T307. (See `CHANGELOG.md` 2026-04-27.)

---

### Analytics-instrumentation findings (verified 2026-04-27 against live DB via MCP)

`public.events` table is alive — 5846 events written in the last 7 days. Pipeline functional. Tier IS being recorded per-event from NavWrapper.userTier. Phase 0.1's tier-resolver fix WILL land in the data.

But the surface is sparse and has tier-fidelity bugs that limit what Phase 0.1 actually unlocks.

Live counts (last 7 days):
- `page_view`: 4094 anon / 1609 free_verified / 47 verity_family / 38 verity / 24 verity_pro
- `signup_complete`: 21 (all hardcoded `'anon'`)
- `onboarding_complete`: 13 (11 NULL tier, 2 `free_verified`)
- All 12+ other defined event types: ZERO

31. **Only 3 of ~15 defined event types are actually firing.** Live data shows: `page_view`, `signup_complete`, `onboarding_complete`. The TrackEvent type union (`web/src/lib/events/types.ts:67-101`) defines the rest as known event names but no code calls `trackEvent('quiz_started'|'comment_post'|'bookmark_add'|'verify_email_complete'|'subscribe_start'|'subscribe_complete'|'article_read_start'|'article_read_complete'|'scroll_depth'|'score_earned'|...)`. Result: no funnel analysis possible (no signup_start, no verify_email_complete), no engagement tracking, no subscription lifecycle, no read-completion vs page-load distinction. **Severity: HIGH for analytics fidelity.** Out of scope for the auth-flow PR — separate instrumentation project. Required as a precondition for any meaningful conversion-funnel work.

32. **`signup_complete` hardcoded `user_tier: 'anon'`** (`web/src/app/api/auth/signup/route.js:220`). Every signup event is tier-blind by design (correct because email isn't verified at signup time), but the hardcode means signup events can never be retroactively segmented by "what tier did this user become." Live data confirms: 21 signup_complete events in 7 days, all tagged `'anon'`. A user who signs up via owner-link and immediately gets Pro on verify is still recorded as an `'anon'` signup. Phase 0.1 doesn't help because this is a separate code path. Fix would be: drop the user_tier from the signup_complete event entirely (let the dashboard infer tier from a later event), OR fire a follow-up `tier_resolved` event after verify completes.

33. **`onboarding_complete` doesn't pass `user_tier`** (`web/src/app/api/account/onboarding/route.js:42-45`). Defaults to null in `trackServer.ts:94`. Live data confirms: 11 of 13 onboarding_complete events in last 7 days have NULL tier. Server events are losing tier information that the client KNEW at the time of the call. **Severity: MEDIUM for analytics.**

34. **NavWrapper hydration race causes early page_views to mis-tag as `'anon'`.** AuthContext defaults `userTier='anon'` at `NavWrapper.tsx:68` until the async hydration in `useEffect` (line 178+) completes. Pages that fire `usePageViewTrack` on mount (e.g., `web/src/app/_HomeFooter.tsx:23`) capture the default tier before user resolution. Live data is consistent: 4094 anon page_views vs 1718 verified-tier page_views in 7 days; some unknown fraction of those "anon" events are signed-in users whose page mounted before NavWrapper hydrated. Phase 0.1 doesn't fix this race — the tier value still defaults to 'anon' before hydration regardless of how many buckets we have. **Severity: MEDIUM** — pollutes anon vs verified attribution.

35. **Client-supplied `user_tier` not validated at the batch endpoint** (`web/src/app/api/events/batch/route.ts:167`). The line is `user_tier: clampString(e.user_tier, 32)` — clamps to 32 chars but does NOT whitelist against known tier values. A malicious or buggy client could submit `user_tier: 'verity_pro_supreme'` and have it recorded. Same line authoritatively overrides `user_id` (line 164) but leaves tier client-trusted. **Severity: LOW** (no obvious attack value beyond skewing dashboards), but inconsistent with the user_id hardening pattern.

36. **Cohort + via_owner_link not tracked in events.** TrackEvent interface has no `cohort` or `via_owner_link` field. Beta-cohort retention vs open-signup retention can't be distinguished in the dashboard. Owner-link recipient retention can't be distinguished from user-link recipient retention. **Severity: MEDIUM for retention analysis.**

37. **GA4 + custom-events pipelines fire in parallel and aren't synchronized.** GA4 (`web/src/components/GAListener.tsx:45`) fires `page_view` for every route change. Custom events (`web/src/app/_HomeFooter.tsx:23`) fire `page_view` only for the home page. Story page views, leaderboard views, settings views — none captured in custom events. Two pipelines, two different views of the same product. **Severity: MEDIUM** — analytics on the custom-events pipeline silently undercounts non-home traffic.

38. **No admin dashboard reads from `events` table.** `web/src/app/admin/analytics/page.tsx` queries `users`, `articles`, `comments`, `reading_log`, `quiz_attempts` directly — none from events. So the events table is being written to (5846 rows in 7d) but nothing in the app surfaces them. **Severity: HIGH for product decision-making.** Data exists, queries don't. Whatever Phase 0.1 adds to event payloads is invisible until a dashboard exists. Out of scope for the auth-flow PR — requires a dashboard project.

---

### DB performance findings (verified 2026-04-27 against live DB via MCP)

Live DB is essentially pre-launch: most user tables have 0 rows. `audit_log` has 4519 rows. `events` table is daily-partitioned with 7 indexes per partition (5846 rows across 7 partitions = ~4.85 MB). All hot-path tables comprehensively indexed. Architecture is healthier than the agent's perf review claimed — but real concerns remain at scale.

**Agent claims rejected (verified false against live DB):**
- Agent: "`permission_scope_overrides` is unindexed, will scan O(n) per perm resolution at scale." VERIFIED FALSE. Has `idx_pso_perm` (permission_key) AND `idx_pso_scope` (scope_type, scope_id). Both lookup paths covered.
- Agent: "Events table grows unbounded." PARTIALLY WRONG. Daily-partitioned (`events_20260421` ... `events_20260428` + `events_default`). Retention via `DROP TABLE events_<date>` is trivial. Just needs the cron job, not architectural redesign.
- Agent: "927 perms × 100k users × 5 checks = 500B lookups." Fearmongering. Postgres uses hash joins; the 927 is OUTPUT row count, not inner-loop cost. Each compute_effective_perms call does ~7 hash joins on indexed columns.

**Real perf concerns to track:**

39. **`audit_log` not partitioned + no retention cron.** Currently 4519 rows. Will grow unbounded at scale. Indexes are comprehensive (action, actor_id, target_id, target_type, created_at) so query perf stays good for a while, but storage grows linearly with platform activity. **Severity: MEDIUM at scale (~12 months out at 10k DAU).** Fix: nightly cleanup cron deleting rows > N days old, OR convert to partitioned table like `events`.

40. **`webhook_log` not partitioned + no retention cron.** Currently 22 rows. Same growth pattern — every Stripe + iOS IAP webhook writes here for idempotency. At 100k DAU subscription churn, hundreds of writes per day. **Severity: LOW currently, MEDIUM at scale.** Same fix pattern as #39.

41. **No retention cron for the partitioned `events` table.** Architecture supports trivial retention (DROP TABLE on old daily partitions), but no cron exists to do it. Will accumulate partitions indefinitely. At 5800 events/week × 52 weeks = ~300k rows/year minimum, more at scale. **Severity: MEDIUM.** Fix: weekly cron that drops `events_<date>` partitions older than N days (typically 90).

42. **`compute_effective_perms` server-side has no request memoization** (`web/src/lib/auth.js:239-243`). Each `requirePermission()` call hits the RPC; two checks in the same request = two round trips. 217 callsites in `web/src/app/api/**`. At 1k req/s with avg 2 checks/req, that's 2k RPC calls/s for permission resolution alone. **Severity: LOW currently** (pre-launch), **MEDIUM at scale.** Fix: memoize the perms map within request scope (e.g., `const cache = await loadEffectivePerms(supabase, user.id)` once per request, pass to subsequent checks).

43. **Stripe `subscription-reconcile-stripe` cron has N+1 sequential pattern** (`web/src/app/api/cron/subscription-reconcile-stripe/route.ts`, lines 69-142). Loops over up to 200 subscriptions; calls Stripe API once per row sequentially. At 200ms Stripe-API latency × 200 subs = 40s, approaching the 60s Vercel ceiling. **Severity: MEDIUM at scale.** Fix: parallelize with `Promise.all()` in batches of 10-20, or break into smaller cron runs at higher frequency.

44. **`permission_set_perms` has 22 rows but 216 KB index size** (verified via pg_stat_user_tables). Index bloat from heavy INSERT/DELETE churn during dev. **Severity: LOW** (cosmetic, not a perf issue at current scale). Fix: `REINDEX TABLE permission_set_perms` once before launch.

---

## 16a. Anomaly index by resolution phase

Quick lookup of which anomaly resolves where. References the numbered items in §16 above.

### Phase 0 — health fixes (ship-first, ~2 days, no flow change)

| # | Anomaly | Phase 0 sub-step |
|---|---|---|
| 2  | NavWrapper undercounts Pro-unverified as `anon` | 0.1 — simplify tier resolver to `anon\|unverified\|free\|pro\|family` |
| 4  | Stripe + cohort double-billing risk | 0.2 — block checkout if cohort Pro + comped_until > now() |
| 6  | Email-change doesn't bump perms_version (60s stale cache) | 0.3 — one-line `bump_user_perms_version` call |
| 14 | Free-reads pill lies to anon users (regwall flag-disabled) | 0.4 — drop pill + regwall + `bumpArticleViewCount` calls + `LAUNCH_HIDE_ANON_INTERSTITIAL` flag |

### Phase 1 — unified verify-email flow (~2-3 days, after Phase 0) [SUPERSEDED 2026-04-27 — see note]

> **[SUPERSEDED 2026-04-27]** This Phase 1 plan describes the password+verify-email unified flow as of the time the system map was authored. The owner-locked AUTH DIRECTION (TODO line 39, 2026-04-26) flips the auth model to **magic-link only** — under magic-link there is no `email_verified=false` state for new users (the link IS the verification), so `<VerifyGate>` placements + the pick-username server-side `email_verified` gate + `complete_email_verification` are all moot post-cutover. The canonical "next phase" is the AUTH-MIGRATION bundle in TODO.md. Anomalies #1, #16, #18, #20 listed below collapse under magic-link (no separate fix needed; verification IS the signin). #7 (email-change `verify_locked_at`) shipped 2026-04-27 via T306+T307. The original Phase 1 table is preserved below for historical reference, NOT as a forward execution plan.


| # | Anomaly | Phase 1 mechanism |
|---|---|---|
| 1  | Owner-link Pro users are gutted | Owner-link recipients now verify email like everyone else; `complete_email_verification` flips `email_verified=true` and grants Pro. The 21 `requires_verified=true` perms unlock the moment they click the email link. No grace window, no special case. |
| 16 | Locked profile tabs look like Pro features | `<VerifyGate>` replaces `<LockedTab>` lock-icon with verify-email inline message |
| 18 | Comment composer lock copy is inconsistent | `<VerifyGate>` + new `<QuizGate>` unify state-driven copy |
| 20 | Owner-link can't reach `/profile/settings#billing` | They verify like everyone else, then they have access. Same as #1. |
| 7  | Email-change doesn't touch `verify_locked_at` | Addressed when revisiting email-change route as part of VerifyGate work |

### Already resolved in parallel `/redesign/*` track

| # | Anomaly | Resolution |
|---|---|---|
| 5  | AccountStateBanner first-match only | `web/src/app/redesign/_lib/states.ts` returns ALL applicable states sorted by severity. Available once `/redesign/*` cutover happens. |

### Phase 2 — defer until post-launch (visual + cleanup + owner decisions)

| # | Anomaly | Phase 2 work |
|---|---|---|
| 3  | Leaderboard hardcoded `.eq('email_verified', true)` filter | Owner decision: drop the filter (perm-driven only) or keep it (consistent "hide unverified everywhere") |
| 8  | Email-change doesn't update `public.users.email` | DB cleanup — sync the column in the email-change route |
| 9  | Admin manual-sync ignores `frozen_at` | Add frozen-state check to admin downgrade path |
| 10 | `frozen_at` + `plan_grace_period_ends_at` don't clear each other | State-machine consolidation pass |
| 11 | `verity_monthly` ($3.99) = `verity_pro_monthly` ($9.99) perms | Owner decision: differentiate the perm sets OR consolidate the SKUs |
| 12 | No push for perms changes (60s nav lag) | Optional — realtime subscription on `users.perms_version` if perceived as a problem |
| 13 | 4 inactive family/family_xl SKUs still in DB | Schema cleanup — verify nothing references them, then delete |
| 17 | TTS button shown-but-disabled is dead UX | Visual decision: hide entirely OR convert to upsell button |
| 19 | No "Pro pride-of-status" surface | Visual: badge/pill in comments + on profile header |
| 22 | `access_codes.type` taxonomy dual-purpose | Decision: delete legacy `invite/press/beta/partner` types or wire them into redemption |

### Out of scope — separate projects

| # | Anomaly | Owner-side project |
|---|---|---|
| 15 | No lifecycle email cadence for unverified users | Lifecycle email project — 24h / 72h / 7d / 14d nudge cadence to recover unverified bucket |
| 21 | Anon visitors have no "save for later" affordance | Anon retention project — bookmark-without-account, "remind me of this story" email capture |

### Pen-test findings (2026-04-27)

| # | Severity | Finding | Phase |
|---|---|---|---|
| 23 | HIGH | Unicode homoglyph bypass on ban-evasion `ilike()` check | Recommend Phase 0 (5-line fix, normalize NFKD before compare) |
| 24 | HIGH | Public-profile column-level leakage on `users` (RLS row-level only) | Separate hardening project (requires view or table split) |
| 25 | HIGH | Kid pair-code grants 7-day impersonation if leaked | Separate kids-security pass (TTL reduction + out-of-band confirm) |
| 26 | MEDIUM | `/api/access-redeem` JSON parse before rate limit (DoS vector) | Recommend Phase 0 (Content-Length cap) |
| 27 | MEDIUM | Login-precheck timing side-channel for account enumeration | Separate hardening project |
| 28 | MEDIUM | Audit log best-effort writes — race-able to leave actions unrecorded | Separate hardening project |
| 29 | MEDIUM | CORS allow-list trusts `NEXT_PUBLIC_SITE_URL` env var | Recommend Phase 0 (hardcode prod origins) |
| 30 | LOW | Email-change milliseconds-scale race condition | Address inline when revisiting email-change route |

### Analytics-instrumentation findings (2026-04-27)

| # | Severity | Finding | Phase |
|---|---|---|---|
| 31 | HIGH | Only 3 of ~15 defined event types actually firing | Separate instrumentation project (precondition for funnel work) |
| 32 | MEDIUM | `signup_complete` hardcoded `user_tier='anon'` | Address inline when revisiting signup route (or simultaneous with Phase 0.1) |
| 33 | MEDIUM | `onboarding_complete` doesn't pass tier | Address inline (1-line fix in onboarding route) |
| 34 | MEDIUM | NavWrapper hydration race causes early page_views to mis-tag as `'anon'` | Separate fix — defer trackEvent until authLoaded=true, or fire a corrective event after hydration |
| 35 | LOW | Client-supplied `user_tier` not validated at `/api/events/batch` | Bundle into Phase 0 hardening (whitelist clamp) |
| 36 | MEDIUM | Cohort + via_owner_link not tracked in events | Add to TrackEvent interface + plumb through useTrack — separate project |
| 37 | MEDIUM | GA4 + custom-events pipelines fire in parallel, page_view only on home for custom | Separate instrumentation project (decide which is canonical, instrument the other surfaces) |
| 38 | HIGH | No admin dashboard reads from `events` table — data goes nowhere | Separate dashboard project |

### DB performance findings (2026-04-27)

| # | Severity | Finding | Phase |
|---|---|---|---|
| 39 | MEDIUM (at scale) | `audit_log` not partitioned + no retention cron | Separate ops project (~12 months out at 10k DAU) |
| 40 | LOW now / MEDIUM at scale | `webhook_log` not partitioned + no retention cron | Separate ops project |
| 41 | MEDIUM | No retention cron for partitioned `events` table | Separate ops project (single weekly cron, partitioning already done) |
| 42 | LOW now / MEDIUM at scale | `compute_effective_perms` server-side no request memoization | Separate optimization (memoize per-request in `/lib/auth.js`) |
| 43 | MEDIUM at scale | Stripe `subscription-reconcile-stripe` N+1 sequential pattern | Separate fix (parallelize with Promise.all batches) |
| 44 | LOW (cosmetic) | `permission_set_perms` index bloat from dev churn | One-time `REINDEX TABLE` before launch |

---

## 16b. Engagement panel agreements (4/4 unanimous, mapped to Plan v4)

Brought in 4 engagement-discipline reviewers (activation, retention, community, monetization) and walked them through what each user type sees at each surface. Items where all 4 reviewers independently said the same thing:

| Panel agreement | Anomaly # | Resolved by |
|---|---|---|
| Owner-link beta state today is the worst experience on the platform | #1 | Plan v4 Phase 1 (unified verify flow — they verify, they unlock) |
| Free-reads pill is currently lying to anon users | #14 | Phase 0.4 (drop pill + regwall + flag entirely) |
| No lifecycle email cadence for unverified users | #15 | Out of scope — separate retention project |
| Locked profile tabs look like Pro features, not "click email" gates | #16 | Phase 1 (`<VerifyGate>` replaces `<LockedTab>`) |
| TTS button shown-but-disabled is dead UX | #17 | Phase 2 (visual decision: hide vs upsell) |
| `verity_monthly` and `verity_pro_monthly` grant identical perms | #11 | Phase 2 (owner decision: differentiate or consolidate) |
| Comment composer lock copy is inconsistent across states | #18 | Phase 1 (`<VerifyGate>` + `<QuizGate>` unify copy) |
| Leaderboard hardcoded `email_verified` filter is wrong | #3 | Phase 2 (owner decision) |
| No "Pro pride-of-status" surface anywhere in the everyday flow | #19 | Phase 2 (visual: badge in comments + on profile) |
| Owner-link recipients can't reach the billing page | #20 | Plan v4 Phase 1 (verify like everyone else, unlocks naturally) |

Where the panel disagreed (not 4/4):
- **Anon free-reads regwall ON vs OFF** — owner direction (2026-04-27): OFF, no read limit. Phase 0.4 drops the regwall entirely.
- **Comment composer copy: "verify + quiz" upfront vs progressive reveal** — defer to Phase 1 component design.
- **Pick-username before vs after verify** — Plan v4 settles this: AFTER verify (universal), per the unified flow.

---

## 17. Implementation plan (panel-revised, phased)

This section was rewritten 2026-04-27 after a multi-perspective review (engagement, growth, trust+safety, billing, security, CEO-strategic, beta-tester voices). The original "owner-link skips verify" approach was rejected on identity-security grounds. Replaced with phased plan below.

**Status: prep only. Do not ship without owner approval.**

---

### PHASE 0 — health fixes, no flow change (~2 days)

These three fixes don't move any user through any new screen. They make the system honest about what it already does and remove two latent bombs. Ships first because Phase 1 isn't measurable without Phase 0's analytics fix.

**0.1 — NavWrapper tier resolver: simplify to 5 buckets (`web/src/app/NavWrapper.tsx:74-86`)**

Today: `if (!user.email_verified) return 'anon'` flattens unverified-with-Pro and actually-anonymous into the same bucket. Earlier draft proposed an 11-bucket expansion (`pro_unverified`, `family_unverified`, etc.) — owner direction (2026-04-27) is the OPPOSITE: simplify, don't expand. Plan grant is invisible until verified, by policy. If you haven't verified, your tier IS `unverified`, full stop. Treat plan grants as latent until they're earned via verification.

Final tier values:
```
'anon' | 'unverified' | 'free' | 'pro' | 'family'
```

Logic:
```js
function deriveTier(user) {
  if (!user) return 'anon';
  if (!user.email_verified) return 'unverified';
  const tier = user.plans?.tier || null;
  if (tier === 'verity_family' || tier === 'verity_family_xl') return 'family';
  if (tier === 'verity' || tier === 'verity_pro') return 'pro';
  return 'free';
}
```

This is opinionated by design:
- A Pro-unverified user reports as `unverified`, not `pro`. Honest. Their Pro grant is on paper only — they can't use any of the 21 requires_verified perms — so reporting them as Pro would inflate Pro retention numbers with users who don't actually use Pro features.
- Analytics consumers get a coherent funnel: anon → unverified → free → (pro | family). Five clean buckets. Easy to reason about.
- Pro and Verity collapse into one tier (`pro`) because they grant identical perm sets today. If/when the SKUs are differentiated (Phase 2 decision), the tier resolver gets a 6th bucket then.

Downstream callers: any hardcoded `tier === 'anon'` checks should be reviewed. Most are telemetry; some may be UI gates. Sweep the codebase before shipping.

**Files touched:** 1 file (NavWrapper.tsx, ~10 lines). Plus a sweep for hardcoded tier comparisons across the codebase (the audit agent found ~9 callsites earlier — re-grep before ship).

**Test cases:**
- Anon visitor → `tier='anon'`
- Free unverified (signed up, no email click) → `tier='unverified'`
- Free verified → `tier='free'`
- Pro unverified (current owner-link beta state) → `tier='unverified'` (was 'anon' — now distinguishable from anon, but still NOT counted as pro until they verify)
- Pro verified → `tier='pro'`
- Family verified → `tier='family'`
- Family unverified → `tier='unverified'`

**Rollback:** revert single file. Zero schema impact.

---

**0.2 — Block double-billing for cohort Pro users**

Where: Stripe checkout entry point. Need to locate exact file (likely `web/src/app/api/stripe/checkout/route.js` or `web/src/app/api/billing/checkout/route.js` — verify before writing).

Today: a beta user with `cohort='beta'` + `plan_id=verity_pro_monthly` + `comped_until > now()` can hit Stripe checkout, pay $9.99, and the cron downgrades their local plan_id at beta-end while Stripe keeps charging. Three months in, $30 surprise on their card.

Change: pre-checkout, the route reads the user's `cohort, plan_id, comped_until`. If all three indicate they're already on Pro via cohort comp, return 409 with copy:
```json
{ "error": "already_on_pro_via_beta",
  "message": "You're already on Pro through the beta. Upgrade after [comped_until date]." }
```

Client surface: a small inline message on the upgrade-CTA page; the Upgrade button stays visible but inert with the explanation.

**Files touched:** 1 server route + 1 client billing page (the CTA copy display).

**Test cases:**
- Cohort beta + Pro grant + comped_until=null → checkout proceeds (edge: pre-cron state)
- Cohort beta + Pro grant + comped_until in future → checkout rejected, message shown
- Cohort beta + Pro grant + comped_until in past (cron should have downgraded by now) → checkout proceeds (re-subscribe)
- Cohort null + no plan → checkout proceeds normally
- Cohort beta + Pro grant + comped_until + user has admin role → ??? open question, see §18

**Rollback:** revert single route. Zero schema.

---

**0.3 — Email-change perms cache bump (`web/src/app/api/auth/email-change/route.js:119`)**

Today: route flips `email_verified=false` server-side. The 21 `requires_verified=true` perms instantly flip granted=false in the DB. Client cache still grants them for ≤60s (until next navigation). User keeps clicking buttons the API will reject.

Change: one line after the email_verified flip:
```js
await service.rpc('bump_user_perms_version', { p_user_id: user.id });
```

Best-effort wrapped in try/catch (cache lag is not a blocker for the change itself).

**Files touched:** 1 line in 1 file.

**Test cases:**
- Verified user changes email → on next page navigation, comment composer locks immediately
- RPC call fails → email-change still completes successfully
- Concurrent navigation during the change → either old or new perms map renders, never half-state

**Rollback:** delete one line.

---

**0.4 — Drop the anon free-reads regwall + pill entirely (`web/src/app/story/[slug]/page.tsx`)**

Owner direction (2026-04-27): no reading limit for anon. Free reading is unlimited. The conversion driver becomes the comment/quiz loop ("sign up to participate"), not a paywall ("sign up to keep reading").

What's in the code today:
- `bumpArticleViewCount()` in `web/src/lib/session.js:17` — increments a localStorage counter on every article open
- `freeReadLimit` state on the story page (default 5 from settings)
- The free-reads pill at story/[slug]/page.tsx:1589-1598 — "3 of 5 free reads"
- The Interstitial regwall component (rendered in the story page render tree, fires when `views >= freeReadLimit`)
- `LAUNCH_HIDE_ANON_INTERSTITIAL = true` constant at story/[slug]/page.tsx:90 (currently hides the regwall pre-launch)

Changes:
- Remove the pill render block (lines 1589-1598) from the story page
- Remove the regwall fire conditions
- Remove or stop calling `bumpArticleViewCount()` (it can stay as a dormant function; just don't call it from the story page)
- Remove the `LAUNCH_HIDE_ANON_INTERSTITIAL` constant (no longer needed since the regwall is dropping permanently)
- Remove `freeReadLimit`, `anonViewCount` state and the `getNumber('free_article_limit', ...)` settings read
- The Interstitial component itself can stay — it's used elsewhere, just no longer wired to anon free-reads

**Files touched:** primarily `web/src/app/story/[slug]/page.tsx` (~30 lines removed). Possibly `web/src/lib/session.js` if `bumpArticleViewCount` becomes orphan and worth deleting.

**Settings table cleanup (out of scope):** `free_article_limit` setting becomes dead. Can be removed in a separate sweep.

**Test cases:**
- Anon visitor opens 10 articles in a row → all 10 reads work, no pill, no regwall
- Free verified user → no change (pill was anon-only)
- Pro user → no change

**Rollback:** revert single file. Zero schema impact. The Interstitial component is preserved for any future use.

---

### PHASE 0 ship criteria

- All four changes ship in one PR
- No DB migration required
- No env var changes required
- Reviewable in <30 min
- Ships behind no flag — pure correctness fixes for live broken/inconsistent behavior
- Validates assumption: after ship, analytics dashboard can distinguish Pro-unverified from anon (now reported as `unverified` not `anon`). Anon read flow is unobstructed.

---

### PHASE 1 — unified verify-email flow (~2-3 days, after Phase 0 lands)

**Owner direction 2026-04-27 (final):** owner-link recipients verify their email like everyone else. The owner personally vouches for each invitee in a 1:1 channel — the panel's identity-leak concern (David Mukherjee, Brian Liu) is mitigated by the existing slug controls (single-use, 7-day expiry, revocable). Skip-verify and 48h-grace approaches are both DROPPED in favor of a single unified flow for all signups.

**The flow for every new account:**
```
signup form (email + password)
  → Supabase auth.signUp returns no session (Confirm email ON)
  → /verify-email screen (Check your inbox + resend button)
  → user clicks email link
  → /api/auth/callback exchanges the code for a session
  → complete_email_verification fires:
       - clears verify_locked_at (if set)
       - flips email_verified=true
       - re-runs apply_signup_cohort → grants Pro for cohort='beta' users (now eligible because email_verified=true)
       - mints user's 2 referral slugs
       - bumps perms_version
  → /signup/pick-username
  → user picks handle
  → /welcome carousel
  → into the site, fully functional
```

Same flow for owner-link, user-link, and post-beta open signups. The differences are only what happens at `complete_email_verification` time — owner-link + user-link beta users get the Pro grant via `apply_signup_cohort`, post-beta open signups don't (no cohort match).

#### 1.1 — Login page: redirect post-signup to /verify-email

`web/src/app/login/page.tsx:157`. Today: `window.location.href = '/signup/pick-username'`.

Change:
```js
window.location.href = '/verify-email';
```

That's the only change needed in this file. No `via_owner_link` branching — every post-signup user goes to verify-email first.

#### 1.2 — Pick-username server-side gate

Convert `web/src/app/signup/pick-username/page.tsx` from pure client to a server-component or layout that runs the check before rendering. Required gate:

```
if (!user) → redirect /login
if (!email_verified) → redirect /verify-email
```

Implementation options:
- Convert to RSC (server component) and run the check at the top
- Add a server-side `generateMetadata` or `loader`-pattern that runs the check + redirects
- Add it to a parent layout for the `/signup/*` segment

Result: no user can land on pick-username with `email_verified=false` via URL poke.

#### 1.3 — Welcome page bypass: DELETE

`web/src/app/welcome/page.tsx:85-93`. Today:
```js
const isBetaOwnerLinkSignup = me?.cohort === 'beta' && !!me?.plan_id;
if (!me?.email_verified && !isBetaOwnerLinkSignup) {
  router.replace('/verify-email');
}
```

Change to:
```js
if (!me?.email_verified) {
  router.replace('/verify-email');
}
```

Delete the `isBetaOwnerLinkSignup` constant entirely. Now dead code under the unified flow because every user lands on welcome with `email_verified=true` by definition (they verified before reaching pick-username, which precedes welcome).

The simpler check is belt-and-suspenders for direct URL pokes to /welcome.

#### 1.4 — VerifyGate component (still valuable)

`web/src/components/auth/VerifyGate.tsx`. New shared component. Purpose under the unified flow: handle the post-signup case where a user changes their email mid-session and `email_verified` flips back to false (per anomaly #6 + #7). Without VerifyGate, those users see locked features with no signal about why.

Placements:
- Comment composer (`web/src/components/CommentThread.tsx`): inline gate when user tries to type while unverified
- Follow button: tooltip + click → "Verify your email to follow"
- Bookmark button (over the cap): same pattern when unverified
- TTS button: same pattern when unverified

Component shape:
```tsx
<VerifyGate when={!email_verified} reason="comment">
  {/* the actual control */}
</VerifyGate>
```

When the gate fires: inline message ("Verify your email to comment") + Send button (calls `/api/auth/resend-verification`) + cooldown countdown.

Reuses `useCooldown` hook from `/verify-email` page logic.

Profile-level pill (originally proposed): kept as secondary affordance for users who land on /profile while unverified, but not the primary mechanism.

#### 1.5 — Address the 21 `requires_verified` perm gates that look like Pro features

Per anomaly #16, the locked profile tabs (Activity / Categories / Milestones) currently render with a `<LockedTab>` lock-icon that implies upgrade-path. Under the unified flow these tabs are unreachable for unverified users (because most won't be unverified post-signup), but the email-change case still hits them.

In tabs that lock for unverified users, render via `<VerifyGate>` instead of `<LockedTab>`. Replaces "this is a paid feature" affordance with "click your email" affordance.

Files: `web/src/app/profile/page.tsx:593,612,631`.

---

### PHASE 1 ship criteria

- No DB migration required (verified — the `via_owner_link` column proposed in earlier drafts is not needed)
- No cron change required (verified — `sweep_beta_expirations` already correctly handles unverified beta users via `verify_locked_at`)
- `compute_effective_perms` unchanged
- Login flow tested for: beta owner-link, beta user-link, post-beta open. All three should: signup → verify-email → click link → pick-username → welcome → site.
- VerifyGate tested at comment composer + locked profile tabs (the two highest-impact placements)
- Welcome bypass deleted, no dead constant left behind
- Pick-username server-side gate tested: direct URL poke at /signup/pick-username while unverified → bounce to /verify-email

---

### What this simpler flow buys vs. the dropped 48h-grace approach

- **No DB migration** (zero schema risk)
- **No new cron logic** (zero scheduling risk)
- **No new column on users** (cleaner data model)
- **No grace-window banner / countdown UX** to design
- **No edge cases** around what happens at hour 47/48/49 of grace
- **One unified flow** to reason about, document, support
- **Existing `complete_email_verification` RPC handles everything** — no new code paths

What we lose: owner-link recipients have to click an email link before they can use the product. That's a few-seconds-to-a-few-minutes delay vs. immediate access. The owner accepts this tradeoff because every owner-link recipient is personally known and the email-click expectation is universal in 2026.

---

### PHASE 2 — defer until after launch (post AdSense + Apple approval)

These are good ideas, but Carmichael's pushback is correct: auth-flow polish is not the launch blocker. Park them.

- Magic-link OAuth as primary signup path → eliminates `/forgot-password`, `/reset-password`, lockout pre-check, password strength UI, Show/Hide button. Kills 4 entire screens. Massive simplification.
- Single-screen signup (email + username + password collapsed)
- Visual kit migration (AuthPage, Wordmark, TextField, PrimaryButton, FormBanner, useCooldown) across all 11 auth pages
- Consent line under Create account button + drop server `agreedToTerms`/`ageConfirmed` requirement
- COPPA explicit checkbox + parental-consent audit logging on kid-profile creation
- AccountStateBanner queueing instead of first-match (banned user can ALSO see "deletion scheduled" / "frozen" / "grace ends" stacked)
- Consolidate the 8 user-state flags into one enum with documented transitions
- Verity vs Pro SKU pricing decision (consolidate the identical-perms SKUs OR add real differentiation)
- Inactive family/family_xl SKU cleanup
- Leaderboard hardcoded `.eq('email_verified', true)` filter decision

---

## 18. Open questions for the owner

Most of the original open questions evaporated with the unified-verify decision (2026-04-27). What remains:

1. **Supabase "Confirm email" project setting — ON or OFF in prod?** Still cannot see this from code. The unified flow REQUIRES it to be ON — that's what gates Supabase from issuing a session at signup, which is what makes the verify-email screen the actual gate. If it's currently OFF, Phase 1 needs an additional step to make Supabase actually wait for confirmation. **Please check Supabase dashboard → Authentication → Sign In/Up.**

2. **Owner-link recipients with admin role** — if an admin user happens to also be a beta cohort member with cohort Pro, should the double-billing block in Phase 0.2 still apply? Recommend: block applies to all roles equally; admins use admin-only test endpoints if they need to test billing.

3. **Manual admin email-confirm tool** — does this exist in `/admin/users` today? If not, do we need to add it for support cases (e.g., a user genuinely cannot receive email, support manually confirms)? Recommend: nice-to-have, can defer until first support ticket arrives. Out of scope for Phase 0/1.

---

## 19a. Phase 0 prep checklist (before any keystroke on real code)

- [ ] Confirm Phase 0 plan with owner (now 4 items, including 0.4 regwall drop)
- [ ] Locate exact Stripe checkout route file (probably `web/src/app/api/stripe/checkout/route.js` — verify)
- [ ] Identify the upgrade-CTA page that surfaces the 0.2 error (`/profile/settings#billing`? `/billing/upgrade`? Both?)
- [ ] Sweep `=== 'anon'` callers across the codebase, list each, decide if it should become `!loggedIn` or be repointed at the new tier strings. Tier strings are now: `anon | unverified | free | pro | family`
- [ ] Identify analytics consumers downstream of NavWrapper's userTier (Mixpanel / PostHog / custom events). Tier set is shrinking from 6 to 5 buckets — most dashboards will work unchanged; any chart that explicitly groups on `verity_pro` etc. needs a remap.
- [ ] Confirm `bumpArticleViewCount` has no other consumers before deciding to delete vs. leave dormant
- [ ] Confirm `LAUNCH_HIDE_ANON_INTERSTITIAL` and `free_article_limit` setting have no other readers before removing
- [ ] Write 1 PR with all 4 fixes; tag with [PHASE-0-AUTH-HEALTH]

## 19b. Phase 1 prep checklist (before Phase 0 ships, design-only)

- [x] Owner approves unified-verify approach (no skip, no grace — everyone verifies, 2026-04-27)
- [ ] Confirm Supabase "Confirm email" project setting is ON
- [ ] VerifyGate component spec finalized (where it renders, what copy, what cooldown)
- [ ] Decide VerifyGate placement points: comment composer, follow button, bookmark-over-cap, TTS button, locked profile tabs (Activity / Categories / Milestones). Confirm no other surfaces.
- [ ] Identify pick-username conversion path to server-rendered (RSC, layout check, or generateMetadata pattern) so the email_verified gate enforces server-side
- [ ] Verify that `complete_email_verification` correctly handles the post-Phase-0 case (it should — no changes to this RPC are required, but worth a smoke test through the new flow)

## 19c. Files that will be touched (Phase 0 + Phase 1 combined)

Phase 0:
- `web/src/app/NavWrapper.tsx` (tier resolver: 5-bucket simplification)
- `web/src/app/api/stripe/checkout/route.js` or equivalent (block double-billing) — VERIFY PATH
- `web/src/app/api/auth/email-change/route.js` (add bump_user_perms_version)
- `web/src/app/story/[slug]/page.tsx` (drop anon free-reads pill + regwall wiring)
- Possibly: `web/src/lib/session.js` (delete `bumpArticleViewCount` if orphan)
- Possibly: 9 sites of `=== 'anon'` checks for the sweep
- Possibly: 1-2 analytics consumer files if tier-string change breaks downstream dashboards

Phase 1 (unified verify-email flow, no DB migration):
- `web/src/app/login/page.tsx:157` (one-line redirect change to /verify-email)
- `web/src/app/signup/pick-username/page.tsx` (add server-side email_verified gate)
- `web/src/app/welcome/page.tsx:85-93` (delete `isBetaOwnerLinkSignup` constant; simplify to single email_verified check)
- `web/src/components/auth/VerifyGate.tsx` (new)
- `web/src/components/CommentThread.tsx` (wire VerifyGate at composer)
- `web/src/app/profile/page.tsx:593,612,631` (replace `<LockedTab>` with `<VerifyGate>` for the 3 locked tabs)
- Find file for follow button → wire VerifyGate
- Find file for bookmark button on story → wire VerifyGate when over cap and unverified
- Find file for TTS button → wire VerifyGate when unverified

NO Phase 1 DB migration. NO cron change. NO new column. NO change to compute_effective_perms or apply_signup_cohort.

---

## 19. Files referenced (master list)

**Application code:**
- `web/src/middleware.js`
- `web/src/lib/auth.js`
- `web/src/lib/permissions.js`
- `web/src/lib/kids.js`
- `web/src/lib/betaGate.ts`
- `web/src/lib/referralProcessing.ts`
- `web/src/lib/referralCookie.ts`
- `web/src/app/NavWrapper.tsx`
- `web/src/app/login/page.tsx`
- `web/src/app/welcome/page.tsx`
- `web/src/app/verify-email/page.tsx`
- `web/src/app/forgot-password/page.tsx`
- `web/src/app/reset-password/page.tsx`
- `web/src/app/signup/pick-username/page.tsx`
- `web/src/app/profile/page.tsx`
- `web/src/app/profile/kids/page.tsx`
- `web/src/app/profile/settings/page.tsx`
- `web/src/app/leaderboard/page.tsx`
- `web/src/app/messages/page.tsx`
- `web/src/app/story/[slug]/page.tsx`
- `web/src/app/admin/layout.tsx`
- `web/src/app/admin/access/page.tsx`
- `web/src/app/admin/referrals/page.tsx`
- `web/src/components/AccountStateBanner.tsx`
- `web/src/components/profile/BetaStatusBanner.tsx`
- `web/src/components/CommentThread.tsx`
- `web/src/app/api/auth/signup/route.js`
- `web/src/app/api/auth/callback/route.js`
- `web/src/app/api/auth/email-change/route.js`
- `web/src/app/api/auth/login/route.js`
- `web/src/app/api/access-redeem/route.ts`
- `web/src/app/r/[slug]/route.ts`
- `web/src/app/api/comments/route.js`
- `web/src/app/api/quiz/start/route.js`
- `web/src/app/api/admin/referrals/mint/route.ts`
- `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js`
- `web/src/app/api/cron/freeze-grace/route.js`
- `web/src/app/api/cron/sweep-beta/route.js`
- `web/src/app/api/stripe/webhook/route.js`
- `web/src/app/api/promo/redeem/route.js`
- `web/src/app/api/ios/appstore/notifications/route.js`
- `web/src/app/api/ios/subscriptions/sync/route.js`
- All `web/src/app/api/kids/*` routes (14 total)

**Migrations:**
- `Ongoing Projects/migrations/2026-04-26_beta_cohort_referrals.sql` (compute_effective_perms, sweep_beta_expirations, apply_signup_cohort, complete_email_verification, mint_referral_codes, mint_owner_referral_link, redeem_referral, grant_pro_to_cohort, generate_referral_slug, users_protect_columns_trigger)
- `Ongoing Projects/migrations/2026-04-26_closed_beta_gate.sql` (apply_signup_cohort + mint_referral_codes patches)
- `Ongoing Projects/migrations/2026-04-26_mint_owner_link_v2.sql`
- `Ongoing Projects/migrations/2026-04-26_mint_owner_link_explicit_actor.sql`
- `Ongoing Projects/migrations/2026-04-26_access_request_email_confirm.sql`
- `Ongoing Projects/migrations/2026-04-27_phase3_age_banding.sql` (current_kid_profile_id)
- `Ongoing Projects/migrations/2026-04-27_phase4_dob_correction_system.sql`
- `Ongoing Projects/migrations/2026-04-27_phase5_graduation_flow.sql` (graduate_kid_profile)

**Live DB queries used (via MCP):**
- Permission catalog counts (927 active, 21 requires_verified, 3 public, 34 ui_sections)
- Roles + perms-via-role counts (8 roles)
- Plans + perms-via-plan counts (9 plans)
- Permission sets attached-to counts (21 active sets)
- RLS policies on articles/comments/users/reading_log/quiz_attempts/bookmarks/kid_profiles/reports/access_codes/access_code_uses
- Function existence check (15 kid + billing + perms-version functions confirmed live)
- `settings.beta_active='true'`, `signup_cohort='beta'`, `beta_grace_days=14`, `beta_cap=0`
- Active referral codes: 1 owner-tier, 0 user-tier

---

## 20a. Parallel `/redesign/*` track (discovered 2026-04-27, owner-driven)

The owner has a separate redesign track in progress at `web/src/app/redesign/*`, served at `localhost:3333` via middleware bypass. This is the canonical visual + state-architecture direction for the auth/profile surfaces, NOT the mockups I created at `/ideas/auth-mockups/`.

Key files in the redesign track:
- `web/src/app/redesign/_lib/palette.ts` — design tokens (different palette than admin or my mocks; ink-blue accent #0b5cff, editorial serif on hero, 4px-base spacing scale, 5-step type ramp, ambient + elevated shadow)
- `web/src/app/redesign/_lib/states.ts` — clean tagged-union AccountState type with severity ordering. **Returns ALL applicable states sorted by severity, not the legacy first-match.** Already addresses the "banner stacking" panel concern.
- `web/src/app/redesign/_lib/demoUser.ts` — synthetic preview row used when the redesign pages are accessed anon at :3333
- `web/src/app/redesign/_components/*` — AccountStateBanner (new architecture), AppShell, Card, EmptyState, Field, PermsBoundary, Skeleton, StatTile, TierProgress, Toast
- `web/src/app/redesign/profile/`, `web/src/app/redesign/u/[username]/` — actual page implementations

Middleware support (`web/src/middleware.js` lines 291-296, 410-414): :3333 bypasses coming-soon mode AND lets anon access `/profile`, `/profile/*`, `/u`, `/u/*` for preview rendering. Production never matches because the host check is port-exact (`:3333`).

**Implications for this plan:**
1. The `<VerifyGate>` component proposed in §17.1.6 should align with the redesign palette (use `C.warnSoft` background, `R.lg` radius, `S[4]` spacing). Don't ship a one-off visual — fold into the existing kit.
2. The redesign's `states.ts` already includes `unverified_email`, `verify_locked`, `comped`, `beta_cohort_welcome` states. The auth-flow change should READ from `deriveAccountStates()` rather than its own banner logic. Reuse, don't duplicate.
3. The `/ideas/auth-mockups/` page I created earlier is obsolete vs the redesign direction. Either delete or refresh to align with the redesign palette. Recommend delete.
4. Anomaly #5 in §16 ("AccountStateBanner first-match only") is RESOLVED in the redesign. Once the redesign ships, the legacy `web/src/components/AccountStateBanner.tsx` becomes deprecated.

The redesign is currently rendering via the `/redesign/*` URL prefix at :3333. The eventual cutover from legacy `/profile/*` to redesigned views is a separate project (likely Phase 2+) — out of scope for this auth-flow work.

**Action for the auth-flow PR:** wherever the new VerifyGate or grace-window banner needs visual treatment, IMPORT FROM `web/src/app/redesign/_lib/palette.ts` rather than defining new tokens. This keeps Phase 1 deliverables visually coherent with what's becoming the primary surface.

---

## 20. Status

**2026-04-27 — Investigation complete. Plan v4 finalized: unified verify-email flow for all signups. 4 reviewer-rounds folded in. No code shipped, no migrations applied.**

Reviewer rounds completed:
1. Engagement panel (4 reviewers, mapped to anomalies #14-22)
2. Pen-test (anomalies #23-30)
3. Product-analytics (anomalies #31-38)
4. DB perf (anomalies #39-44)

**Agent hallucinations caught this session (all corrected against live DB via MCP):**
- Analytics agent: claimed events table doesn't exist. **WRONG.** Table exists, has 5846 rows in last 7 days, daily-partitioned with 7 indexes per partition.
- DB-perf agent: claimed `permission_scope_overrides` is unindexed. **WRONG.** Has both `idx_pso_perm` and `idx_pso_scope` covering both lookup paths.
- DB-perf agent: claimed events table grows unbounded. **PARTIALLY WRONG.** Daily-partitioned, retention is just a cron away.
- Kid-system agent (earlier session): claimed entire `/api/kids/*` route surface and 15 DB functions don't exist. **WRONG.** All 14 routes exist as `.js` files; all 15 functions verified live in pg_proc.

Lesson: M-22 verification rule continues to earn its keep. ~4-5 hallucinated findings out of ~40 across 4 rounds. Pattern: agents miss `.js` vs `.ts` extensions and assume migrations folder = current schema. Always verify with MCP before treating as ground truth.

Current state:
- Investigation: COMPLETE (§§1-16)
- Plan v1 ("owner-link skips verify entirely"): SUPERSEDED — rejected on identity-security grounds
- Plan v2 ("48h soft grace + admin-confirm"): SUPERSEDED — admin-confirm removed per panel
- Plan v3 ("48h soft grace, no admin-confirm"): SUPERSEDED — owner direction 2026-04-27 to simplify
- **Plan v4 (CURRENT): unified verify-email flow.** Owner-link, user-link, and post-beta open signups all hit /verify-email after signup. No skip, no grace, no special case. Owner accepts the email-click delay because every owner-link recipient is personally vouched for and email-click is universal in 2026.
- Tier strings simplified to 5 buckets (`anon | unverified | free | pro | family`) — Phase 0.1
- Anon free-reads regwall + pill dropped (no read limit) — Phase 0.4
- `/redesign/*` track recognized as canonical visual direction (see §20a)
- Phase 0 (4 items): PREP DONE, see §19a. Awaiting owner go-ahead.
- Phase 1 (5 items, no DB migration): PREP DONE, see §19b. Awaiting owner go-ahead on §18.1 (Supabase setting) + Phase 0 ship.
- Phase 2: BACKLOGGED to post-launch.

What dropped from earlier drafts:
- No `via_owner_link` column on users
- No new branch in `compute_effective_perms`
- No new cron pass for grace lapse
- No grace-window banner / countdown UX
- No `apply_signup_cohort` change (existing logic already grants Pro on email verify for cohort='beta' users — verified)

Owner decisions needed (in order of urgency):
1. **Confirm Supabase "Confirm email" project setting is ON.** (§18.1) — this is the only true blocker for Phase 1 to work as designed.
2. Greenlight Phase 0 ship (or modify scope).
3. Greenlight Phase 1 ship (after Phase 0 lands).
4. Decide on Phase 2 timing — block on launch milestones, or backlog cleanly.

Companion artifacts:
- `/redesign/*` (canonical visual + state-architecture direction at localhost:3333)
- `web/src/app/ideas/auth-mockups/page.tsx` — DEPRECATED, does not align with the redesign palette. Recommend delete in Phase 0 PR.

---

## 21. `/redesign/*` profile review findings (2026-04-27 4-reviewer pass)

**Trigger:** owner request — bring an adversary (100% engagement / 0% abandonment standard) plus three independent testers (visual / UX / code-quality) to walk every section of the redesigned profile at localhost:3333 and flag everything right and wrong.

**Method:** four parallel agents, each with file paths to read and curl URLs to exercise. Each returned a ranked report. Findings below are the **triaged subset** — items the lead developer judged worthy of ship-time attention, deduplicated across reviewers and rejected (intentionally) where one reviewer raised something that was bikeshed, subjective, or already wrong about the current code.

**Not propagated** (reviewer was off-base or item is not worth doc tracking):
- Adversary's "Toast role=alert / 4s dismiss" — bikeshed; current `role=status` is correct for non-urgent saves
- Adversary's "mobile app bar section name redundant with page title" — subjective; fine as a context anchor
- UX reviewer's "Block button missing from PrivacyCard followers list" — **incorrect**; `PrivacyCard.tsx` lines 240–254 do render the bulk Block button via `blockPicked()` when `picked.size > 0`. Verified in code.
- Visual reviewer's preview.tsx fontSize literals (lines 853, 876) — fixture-only file, not in production code path
- Visual reviewer's `'#fff'` literals in AccountStateBanner — minor, palette has `accentInk` but not a clean white token; deferred

### 21.1 Critical — ship-blockers before live

1. **`web/src/app/u/[username]/page.tsx` line 190 still only checks `profile_visibility === 'private'`.** Does NOT include `'hidden'`. Means a user in lockdown leaks once `PUBLIC_PROFILE_ENABLED` flips. Sister files (`/u/[username]/layout.js`, `/card/[username]/layout.js`, `/card/[username]/page.js`, `/card/[username]/opengraph-image.js`) were updated in the redesign work but this one was missed. Add `|| === 'hidden'` to the condition.

2. **Privacy "Hidden" tier and PublicProfileSection visibility writes use mismatched enum sets to the same `users.profile_visibility` column.** PrivacyCard writes `'hidden'`; PublicProfileSection writes `'public' | 'private'` (no awareness of `'hidden'`). Saving in either surface can flip the other unexpectedly. Unify: PublicProfileSection should READ `'hidden'` as a third state and either render it as read-only ("Locked down — manage in Privacy") or expose the same tri-state.

3. **`web/src/app/redesign/_components/Toast.tsx` line 33 setTimeout has no cleanup on unmount.** Each toast spawns an orphan timer. Wrap in a per-toast `useEffect` that returns `clearTimeout`, or store handles and clear on `ToastProvider` unmount.

4. **`window.location.host === 'localhost:3333'` is the only gate on the dev-perms-all-true override** in `ProfileApp.tsx` line 119–121. Tighten with a Node-env check too: `process.env.NODE_ENV !== 'production' && host === 'localhost:3333'`. Same pattern in middleware's `_isRedesignPort`.

5. **Lockdown deletes all `follows` rows directly from the client** (`PrivacyCard.tsx` lines 175–178). Trusts RLS to enforce that the caller can only delete `following_id = self`. If RLS is wrong, this becomes a write-to-other-users primitive. Move to a server RPC `lockdown_self()` that atomically: sets `profile_visibility='hidden'` AND deletes follower rows. One transaction, server-side identity check.

6. **Inputs and buttons in `web/src/app/redesign/_components/Field.tsx` declare CSS transitions but never wire `:focus` / `:hover` styles.** Result: keyboard users get no visual feedback navigating any form. The `focusRing` helper exists (`palette.ts` line 124) but isn't applied. Add `onFocus`/`onBlur` handlers that toggle `boxShadow: SH.ring`, plus `:hover` background changes on every button variant. Affects every settings card.

### 21.2 Important — visible UX gaps

7. **Mobile drawer in `AppShell.tsx` lacks `Escape` handler and focus trap.** A keyboard user opening the drawer on narrow viewports can tab off-screen. Account-state banners render at z-index 40 but the drawer is at z-30 with overlay z-25 — a banned user on mobile literally can't see their banner above an open drawer. Promote banners to z-50 and add Escape-to-close + focus trap.

8. **Native `window.confirm()` still used by:** Cancel subscription (`BillingCard.tsx` ~line 122), MFA remove (`MFACard.tsx`), and the lockdown trigger (it has a styled card, but the bulk-Remove on followers also has a confirm). Inconsistent with the rest of the redesign's modal style. Replace with the `Card variant="danger"` pattern already used by the Hidden lockdown confirm.

9. ~~**AvatarEditor save button sits on the bio card below it, not on the avatar card itself.**~~ — **[RESOLVED 2026-04-27 — TODO 5th-pass verification]** Re-read of `web/src/app/redesign/_components/PublicProfileSection.tsx` shows AvatarEditor mounted at line 197 with the card carrying its own dedicated footer Save at lines 203-215. Reviewer's claim was based on an earlier layout. No fix needed. (See `CHANGELOG.md` 2026-04-27.)

10. **Deletion-scheduled banner uses `warnSoft` (yellow) tone.** Account deletion is irreversible after 30 days; banner should use `dangerSoft` (red) for severity match. Affects `AccountStateBanner.tsx` (`deletion_scheduled` case) and `DataCard.tsx` inline pending-banner.

11. **`as never` casts on Avatar in `PrivacyCard.tsx` line 492 and `BlockedSection.tsx` line 123.** Both Avatar receivers may be null → silent broken-avatar fallback. Replace with proper `AvatarUser` type and explicit null guard.

12. **Rail search keywords miss "followers".** Typing `followers` in `⌘K` rail search doesn't find Privacy. `ProfileApp.tsx` `keywords:` array for the privacy section is `['dm', 'messages', 'block', 'hide', 'visibility']` — add `'followers'`, `'unfollow'`, `'remove follower'`.

13. **YouSection action cards drive users out of the profile** ("Today's articles" → `/`, "Bookmarks" → `/bookmarks`, "Messages" → `/messages`). Adversary flagged this as primary abandonment vector for users who landed on profile to actually edit it. Consider replacing "What's next" with a profile-internal CTA strip (e.g., "Polish your profile: avatar / bio / privacy") and moving outbound nudges into a discrete onboarding card only when `articles_read_count === 0`.

14. **Permission state doesn't refresh in real-time.** A plan upgrade in another tab doesn't unlock sections until refresh. `compute_effective_perms` already exposes a version channel — wire `my_perms_version()` polling (60s) into ProfileApp's load effect to invalidate stale gates.

15. **Expert application form has no required-field markers.** `ExpertApplyForm.tsx` enforces required fields in submit handler but doesn't communicate them visually. Add red asterisk or pill on Full name / Bio / Areas / Sample 1.

16. **`EmptyState` component still accepts an `icon` prop that's never rendered.** Dead code. Remove the prop or repurpose it.

### 21.3 Polish — would elevate from good to great

17. **Spacing literals drift to S-tokens.** `gap: 1` / `padding: '0 4px'` / `padding: '0 6px'` scattered across `AppShell.tsx`, `MessagesSection.tsx`, `PasswordCard.tsx`, `preview/page.tsx`. Snap every literal to `S[N]`.

18. **Tier badge has three different visual treatments** (rail identity card / stat tile / public-profile preview). One canonical pill component, used in all three places.

19. **PasswordCard rule checklist** uses green dot on pass but inert gray dot on fail. Should use a red dot when the user has typed something but the rule is unmet — bidirectional signal.

20. **PrivacyCard followers list has no Retry on load failure.** Currently shows toast; user has to refresh the whole page. Add a retry button in the empty/error state.

21. **Microcopy passes:**
    - "Data & danger" → "Your data" (rail title)
    - LockedSection "X is part of premium" → "Upgrade to unlock {section}"
    - Rail search placeholder "Search settings" → "Search profile" (sections include non-settings surfaces)
    - PublicProfileSection "Add a bio below" → use placeholder text inside the textarea instead

22. **PrivacyCard Hidden-confirm copy** doesn't say how many followers will be removed. Inject `{count}`: "This sets visibility to **Hidden** and immediately removes all {count} current followers."

23. **Expert queue back-channel empty state misleads non-expert admins.** When `isAdminScope && categories.length === 0`, the empty state says "Apply for expert verification" — wrong CTA for someone who already has admin oversight perms. Branch the copy.

### 21.4 What the reviewers explicitly liked (kept as a positive baseline so we don't regress)

- Master/detail shell + persistent identity rail card: the right architecture for this product
- Permission-gated rows showing as **locked** (dimmed, with upgrade CTA) instead of hidden: gives users the full surface map
- 22-section grouped rail (Library / Family & expert / Settings / Account): scannable, no surprises
- Avatar spectrum picker + multi-size live preview: the right level of fun
- Privacy lockdown tier with destructive confirm + checkbox-bulk follower manager: the safety lever the legacy product didn't have
- `/redesign/preview` static fixture: correct call to keep mocks out of production code
- Inline expert queue with admin-scoped backchannel (versus all-categories legacy): clean fix to a messy surface
- Section cross-fade animation, skeleton shimmer, sticky scroll-spy nav: app-grade feel

### 21.5 Status

**Items above are triaged but not implemented.** Awaiting owner pick. Recommend executing 21.1 as a single ship-readiness PR (six items, all small, all critical). 21.2 is a comfortable second PR. 21.3 is a polish pass that can land any time before live.

Reviews on file (raw outputs not stored — captured here as the source of truth).

---

## 22. Cutover plan — taking the redesign live (web + iOS)

**Trigger:** owner ask — "how do I take your shit and bring it to the site and to SwiftUI while keeping the new UI." This section is the file-by-file migration breakdown for both surfaces. It assumes the redesign at `/redesign/*` is the source of truth; everything below is the diff between "where it lives now (parallel track)" and "where it needs to live to ship."

### 22.1 Where the redesign lives today

**45 files** under `web/src/app/redesign/`:

```
web/src/app/redesign/
├── _components/                       (10 shared primitives)
│   ├── AccountStateBanner.tsx         14-state banner family
│   ├── AppShell.tsx                   master/detail shell + rail + ⌘K search + mobile drawer
│   ├── Card.tsx                       card chrome (default + danger variants)
│   ├── EmptyState.tsx                 zero-data / locked / error
│   ├── Field.tsx                      labeled form row + shared button styles
│   ├── PermsBoundary.tsx              suspends until perms cache resolves
│   ├── Skeleton.tsx                   shimmer (line / block / circle)
│   ├── StatTile.tsx                   neutral stat tile (no per-stat color)
│   ├── TierProgress.tsx               next-tier numeric line + neutral progress bar
│   └── Toast.tsx                      toast provider (success / error / info)
├── _lib/                              (3 modules)
│   ├── demoUser.ts                    DEV-ONLY synthetic user for :3333 anon preview
│   ├── palette.ts                     C / S / F / R / SH / FONT design tokens
│   └── states.ts                      account-state derivation (banned/muted/frozen/etc.)
├── preview/page.tsx                   STATIC visual fixture (mock content baked in)
├── profile/
│   ├── _components/
│   │   ├── AvatarEditor.tsx           72-swatch spectrum + neutrals + wheel + hex
│   │   └── ProfileApp.tsx             section orchestrator — owns user + perms + state
│   ├── _sections/                     (16 inline section components + LinkOutSection helper)
│   │   ├── ActivitySection.tsx
│   │   ├── BlockedSection.tsx
│   │   ├── BookmarksSection.tsx
│   │   ├── DataSection.tsx
│   │   ├── ExpertApplyForm.tsx
│   │   ├── ExpertProfileSection.tsx
│   │   ├── ExpertQueueSection.tsx
│   │   ├── IdentitySection.tsx
│   │   ├── LinkOutSection.tsx
│   │   ├── MessagesSection.tsx
│   │   ├── NotificationsSection.tsx
│   │   ├── PlanSection.tsx
│   │   ├── PrivacySection.tsx
│   │   ├── PublicProfileSection.tsx
│   │   ├── SecuritySection.tsx
│   │   ├── SessionsSection.tsx
│   │   ├── SignOutSection.tsx
│   │   └── YouSection.tsx
│   ├── page.tsx                       /profile entry (defaultSection="you")
│   └── settings/
│       ├── _cards/                    (8 settings cards used by Sections)
│       │   ├── BillingCard.tsx
│       │   ├── DataCard.tsx
│       │   ├── EmailsCard.tsx
│       │   ├── IdentityCard.tsx
│       │   ├── MFACard.tsx
│       │   ├── NotificationsCard.tsx
│       │   ├── PasswordCard.tsx
│       │   └── PrivacyCard.tsx
│       └── page.tsx                   /profile/settings entry (defaultSection="identity")
└── u/[username]/page.tsx              public-profile placeholder (legacy still kill-switched)
```

The legacy surface (`web/src/app/profile/page.tsx` 1,876 lines + `web/src/app/profile/settings/page.tsx` 5,300 lines + 12 redirect-shim subpages under `profile/settings/`) is **untouched** and continues to render on `:3000`.

### 22.2 Web cutover plan — promote `/redesign/*` to canonical `/profile/*`

The cleanest move is a **physical rename**, not a symlink or feature flag. This eliminates the dual codebase and makes the redesign the single source of truth.

**Step 1: Delete legacy.** (~7,200 lines deleted)
- `rm web/src/app/profile/page.tsx` (1,876 lines)
- `rm web/src/app/profile/settings/page.tsx` (5,300 lines)
- `rm -rf web/src/app/profile/settings/{password,emails,login-activity,alerts,feed,expert,blocked,data,billing,supervisor}/` (12 redirect-shim pages, all just anchor redirects to the deleted long-scroll)
- Keep `web/src/app/profile/family/`, `web/src/app/profile/kids/`, `web/src/app/profile/[id]/` — those are separate pages outside the redesign scope (family management lives at `/profile/family`; the redesign's Family section currently `LinkOutSection`s to it).

**Step 2: Move redesign files to canonical paths.**
The redesign uses Next App Router `_components`/`_lib`/`_sections` underscore conventions, which Next ignores as routes. Move pattern:

```
web/src/app/redesign/_components/*           → web/src/app/profile/_components/*
web/src/app/redesign/_lib/{palette,states}   → web/src/app/profile/_lib/*
web/src/app/redesign/profile/_components/*   → web/src/app/profile/_components/* (merge)
web/src/app/redesign/profile/_sections/*     → web/src/app/profile/_sections/*
web/src/app/redesign/profile/page.tsx        → web/src/app/profile/page.tsx
web/src/app/redesign/profile/settings/_cards/* → web/src/app/profile/settings/_cards/*
web/src/app/redesign/profile/settings/page.tsx → web/src/app/profile/settings/page.tsx
```

After the move, fix every relative import inside the moved files (the depth changes from `../../_lib/palette` to `../_lib/palette` etc.). One `find + sed` pass handles it; budget ~15 minutes for the import fixup.

**Step 3: Drop dev-only artifacts.**
- `rm web/src/app/redesign/_lib/demoUser.ts` — synthetic user only used on `:3333` anon preview; production never shows demo data
- Drop `isPreviewHost()` calls and `if (preview)` branches from `ProfileApp.tsx` and any settings card — already removed in earlier pass; verify with `grep -r "isPreviewHost\|preview" web/src/app/profile/`
- `rm web/src/app/redesign/preview/page.tsx` — static fixture lives in source for design reference only; either delete with the rest, or keep under a non-redesign path (e.g. `web/src/app/_design-fixtures/profile.tsx`) for future design QA
- `rm -rf web/src/app/redesign/u/` — placeholder route; legacy `/u/[username]` still serves on the same path
- `rm -rf web/src/app/redesign/` — the directory should be empty after the moves

**Step 4: Drop the dev-port middleware logic.**
In `web/src/middleware.js`, remove:
- The `_isRedesignPort` const (line ~290)
- The coming-soon-mode bypass for `:3333` (line ~298)
- The `_isRedesignProfilePath` anon-bypass (line ~409)
- The `/redesign/*` rewrite block at the end of `middleware()` (lines ~445-461)
- The `localhost:3333` entry in `ALLOWED_ORIGINS` (line 173) — keep `:3000` for active dev work

**Step 5: Drop `dev:3333` from `package.json`.**
Single line: remove `"dev:3333": "next dev -p 3333"`. The legacy `dev` (port 3000) becomes the only dev script again.

**Step 6: Fix the `/u/[username]/page.tsx` `'hidden'` leak.**
Per §21.1 item 1 — line 190 of `web/src/app/u/[username]/page.tsx` checks `=== 'private'` only. Add `|| === 'hidden'`. This is independent of the cutover but must ship in the same PR or the lockdown lever is broken.

**Step 7: Decide the public-profile flag.**
The redesign's `/redesign/u/[username]/page.tsx` was a placeholder; the real `/u/[username]` is gated by `PUBLIC_PROFILE_ENABLED = false` in `web/src/app/u/[username]/page.tsx:22`. Cutover does NOT flip that flag. Keep public profile kill-switched until owner says otherwise — it's a separate decision from the profile redesign and depends on the §21 hero rebuild + pagination + report sheet work being done.

### 22.3 Web — what code stays unchanged

**No DB migrations.** The redesign uses existing columns only:
- `users.profile_visibility` (text) — already accepts arbitrary string values; new value `'hidden'` does not require a CHECK-constraint change
- `users.allow_messages`, `users.hide_activity_from_others`, `users.bio`, `users.avatar` (jsonb), `users.avatar_color` — all pre-existing
- `users.email_verified`, `users.is_banned`, `users.frozen_at`, etc. — read by `_lib/states.ts` for AccountStateBanner; all pre-existing
- `follows`, `blocked_users`, `expert_applications`, `expert_application_categories`, `expert_discussions`, `category_scores`, `categories`, `reading_log`, `comments`, `bookmarks` — all read directly via supabase client; no schema change

**No new API routes.** Every endpoint the redesign hits already ships:
- `update_own_profile` RPC (Identity / Public / Privacy / Avatar saves)
- `auth.updateUser({email})` + `/api/auth/verify-password` + `auth.signOut({scope:'others'})` (Password)
- `auth.mfa.{enroll,challenge,verify,unenroll}` (2FA — new on web UX, but the GoTrue methods are stock Supabase)
- `/api/notifications/preferences` (channels)
- `/api/account/sessions` GET + DELETE
- `/api/users/:id/block` POST + DELETE
- `/api/account/data-export` POST
- `/api/account/delete` POST + DELETE
- `/api/stripe/portal` POST
- `/api/billing/cancel`, `/api/billing/resubscribe` POST
- `/api/expert/{apply,vacation,queue,back-channel}` + `/api/expert/queue/[id]/{claim,decline,answer}`
- `/api/conversations` GET (Messages)
- `/api/follows` POST (FollowButton on PublicProfile)

**No middleware additions** beyond the four removals in step 4.

**No new dependencies.** Everything uses existing imports — `@/lib/supabase/client`, `@/lib/permissions`, `@/lib/scoreTiers`, `@/types/database-helpers`, `@/components/Avatar`.

### 22.4 Web — what goes wrong if rushed

**The four read-paths I already updated for `'hidden'`:** `/u/[username]/layout.js`, `/card/[username]/{layout,page,opengraph-image}.js`. These currently treat `'hidden'` the same as `'private'`. **The fifth file** (`/u/[username]/page.tsx:190`) was missed — it still does `=== 'private'` only. Without the §21.1 #1 fix, lockdown leaks the moment public profiles flip on.

**Native app coupling:** the iOS app reads from this same DB. After cutover, an iOS user in lockdown also writes `profile_visibility='hidden'` (via the iOS-side privacy panel, when ported per §22.6). If the iOS app's read paths still gate on `'private'` only, that's the same leak in a different surface. Audit iOS sources for `profile_visibility` strings before the iOS PR ships.

**The `preview` flag plumbing.** Throughout the redesign, sections accept a `preview: boolean` prop derived from `isPreviewHost()`. After cutover this can be deleted entirely — the prop is dead in production. Either rip it out file-by-file (~30 minutes), or leave it always-`false` and clean up next pass. Recommend ripping; it's a dev-only contamination.

### 22.5 iOS — the adult app at `VerityPost/VerityPost/`

**Current state inventory** (relevant files only):

```
VerityPost/VerityPost/
├── ProfileView.swift              4-tab dashboard (Overview/Activity/Categories/Milestones)
├── SettingsView.swift             long-scroll settings hub w/ 10 push-destinations
├── PublicProfileView.swift        public-profile read view (~65% web parity)
├── PermissionService.swift        actor-based perms cache
├── PermissionStore.swift          @MainActor ObservableObject mirror
├── AuthViewModel.swift            currentUser + session + plan
├── StoreManager.swift             StoreKit 2 subscription state
├── SettingsService.swift          notification prefs cache + login activity
├── BlockService.swift             blocked-users cache
├── ExpertQueueView.swift          standalone expert queue (separate tab in legacy)
├── FamilyViews.swift              family dashboard + kid management
├── SubscriptionView.swift         plan grid
├── BookmarksView.swift            bookmark list
├── MessagesView.swift             DM threads
├── AlertsView.swift               notification preferences UI
├── PushPermission.swift           push opt-in management
├── PushRegistration.swift         APNs registration
└── ContentView.swift              app root w/ MainTabView
```

The iOS app's profile-area code is roughly **8–9k lines** spread across the files above. Visual style, navigation, and data model are all functional but not aligned to the redesign's master/detail shell, neutral tier treatment, or unified sectioning.

### 22.6 iOS port mapping — redesign sections → SwiftUI views

**Strategy:** keep the data layer (PermissionService, AuthViewModel, StoreManager, supabase client, REST hits) **completely unchanged**. Rebuild only the visual + IA layer to mirror the web redesign's shell + section model.

**Shell.** Replace `ProfileView`'s 4-tab structure with a `NavigationSplitView` on iPad and a custom drawer-style sidebar on iPhone. New file: `ProfileShell.swift`. Sidebar = section list grouped (Library / Family & Expert / Settings / Account). Detail = active section's view. The web `AppShell.tsx` rail's IdentityCard becomes a sidebar header on iOS — avatar, name, plain-text tier line, no color ribbon, no avatar ring.

**Section-by-section mapping** (web file → iOS file):

| Web section | iOS view | Status today | Port effort |
|---|---|---|---|
| `YouSection.tsx` | `YouView.swift` (NEW) | Legacy `ProfileView` Overview tab | Rebuild as a single section view: tier-progress + stats grid + "what's next" cards |
| `PublicProfileSection.tsx` | `PublicProfileEditView.swift` (NEW) | `PublicProfileView` exists but read-only | New editing surface; reuse `PublicProfileView` styling for the preview card |
| `IdentitySection.tsx` | wrap existing `AccountSettingsView` | exists | Light: rename + adopt redesign fonts/spacing |
| `SecuritySection.tsx` | compose `EmailSettingsView` + `PasswordSettingsView` + `MFASettingsView` | all three exist | Wrap in a single parent `SecurityView.swift`; standard `Section` blocks |
| `SessionsSection.tsx` | wrap `LoginActivityView` | exists | Light |
| `NotificationsSection.tsx` | wrap `NotificationsSettingsView` | exists; AlertsView legacy | Update channel list to "in-app / push / security email always-on" per memory rule |
| `PrivacySection.tsx` | `PrivacyView.swift` (NEW) | **does not exist** on iOS | Big build: 3-tier audience (Public/Followers/Hidden) + DM toggle + hide-activity + follower checkbox manager |
| `BlockedSection.tsx` | `BlockedView.swift` (NEW) | partial — `BlockService` cache exists | New list view with unblock action |
| `PlanSection.tsx` | wrap `SubscriptionSettingsView` (in `SettingsView.swift`) | exists | Light |
| `DataSection.tsx` | `DataView.swift` (NEW) | partial — delete flow lives in SettingsView danger zone | New unified view: export + scheduled-deletion banner + cancel-deletion |
| `ActivitySection.tsx` | `ActivityView.swift` (NEW) | Legacy `ProfileView` Activity tab | Repackage existing reading_log / comments / bookmarks queries as a section |
| `BookmarksSection.tsx` | wrap `BookmarksView` | exists | Light |
| `MessagesSection.tsx` | wrap `MessagesView` | exists | Light |
| `CategoriesSection` (TBD on web — currently LinkOut) | `CategoriesView.swift` (NEW) | Legacy `ProfileView` Categories tab | Rebuild with parent + sub pill rows matching `LeaderboardView.swift` |
| `MilestonesSection` (TBD on web — currently LinkOut) | `MilestonesView.swift` (NEW) | Legacy `ProfileView` Milestones tab | Earned + locked grid |
| `ExpertQueueSection.tsx` | replace `ExpertQueueView` | standalone view, separate tab | Move into shell as a section; admin scoping for back-channel like web |
| `ExpertProfileSection.tsx` + `ExpertApplyForm.tsx` | `ExpertProfileView.swift` (NEW) | partial — `VerificationRequestView` is a sheet | Inline application form when no app exists; status + areas + vacation when one does |
| `SignOutSection.tsx` | `SignOutView.swift` (NEW) | currently a row in `SettingsView` | Inline section with two buttons |
| `Refer / Help / Family / Feed prefs` | LinkOut-style cards inside the shell | partial | Keep as launchpads to existing screens (FamilyDashboardView, etc.) |

**AvatarEditor (new on iOS).** SwiftUI `LazyVGrid` of 72 swatches + neutrals row + native `ColorPicker` for hex/wheel + multi-size live preview using existing avatar render code. New file: `AvatarEditorView.swift`. Writes to the same `users.avatar` jsonb + `users.avatar_color` columns as web.

**AccountStateBanner (new on iOS).** Port `_components/AccountStateBanner.tsx`'s 14-state union directly. iOS version uses `Color` extensions for ink/danger/warn/info backgrounds. Renders as a sticky banner at the top of the shell when `accountStates[0].kind != 'ok'`. Hard-block states (banned / locked / deletion) replace the entire shell; soft states render above it.

### 22.7 iOS — design tokens

Bring `_lib/palette.ts` over as `Palette.swift`:

```swift
extension Color {
    static let vpInk = Color(hex: "#0a0a0a")
    static let vpInkSoft = Color(hex: "#27272a")
    static let vpInkMuted = Color(hex: "#52525b")
    static let vpInkFaint = Color(hex: "#a1a1aa")
    static let vpSurface = Color(hex: "#fafafa")
    static let vpSurfaceRaised = Color(hex: "#ffffff")
    static let vpSurfaceSunken = Color(hex: "#f4f4f5")
    static let vpBorder = Color(hex: "#e4e4e7")
    static let vpAccent = Color(hex: "#0b5cff")
    static let vpDanger = Color(hex: "#b91c1c")
    static let vpDangerSoft = Color(hex: "#fee2e2")
    // ... etc — port every key from palette.ts
}

enum VPSpace { static let s1 = 4.0; static let s2 = 8.0; static let s3 = 12.0; /* ... */ }
enum VPRadius { static let sm = 6.0; static let md = 10.0; static let lg = 14.0; /* ... */ }
```

Type:
- Display headers: `.font(.system(.largeTitle, design: .serif).weight(.semibold))` — system serif, no webfont
- Body: system default sans
- Mono / code: `.font(.system(.body, design: .monospaced))`

**No TIER_C port.** Tier renders as plain text with `.foregroundColor(.vpInkMuted)`. Same memory rule as web — tiers don't get color.

### 22.8 iOS — leaderboard-pattern pill rows

The Categories section uses the leaderboard pattern (parent pill row + sub pill row). iOS already has this in `LeaderboardView.swift`; mirror that exact chip shape into `CategoriesView.swift` so the visual language is consistent across surfaces.

### 22.9 iOS — race conditions to fix during port

Per §21.1 item 2 (web enum mismatch): the iOS app must standardize on the same three-state visibility (`'public' | 'private' | 'hidden'`) when reading `users.profile_visibility`. The current iOS code likely only knows `'public' | 'private'`. Audit before the port ships:
- `grep -rn "profile_visibility" VerityPost/VerityPost/`
- Update every read site to handle `'hidden'` the same as `'private'` (lockdown semantics)
- Update `PublicProfileEditView`'s save flow to write `'hidden'` when the user picks lockdown

Per §21.1 item 5 (lockdown should be a server RPC, not client deletes): when iOS adds the lockdown lever, route it through a new RPC `lockdown_self()` rather than letting the iOS client issue direct `DELETE FROM follows WHERE following_id = me`. Same fix unlocks both surfaces simultaneously.

### 22.10 Suggested PR sequence (web first, then iOS)

1. **Web cutover PR** (~7,200 line deletions, ~45 file moves, ~15 minutes of import fixup): steps 1–5 from §22.2 + §21.1 #1 (`/u/[username]` `'hidden'` check) + §21.1 #2 (PublicProfileSection `'hidden'` awareness) + §21.1 #3 (Toast cleanup) + §21.1 #4 (NODE_ENV gate; trivially achieved by the dev-port logic deletion in §22.2 step 4).
2. **Web stalker-safety RPC PR** (DB migration adding `lockdown_self()` + replacing client delete in PrivacyCard with the RPC call). Per §21.1 #5.
3. **Web focus-states + a11y PR** — §21.1 #6, §21.2 mobile-drawer fixes, §21.2 keyboard items.
4. **Web visual-polish PR** — §21.3 items.
5. **iOS PR** — port per §22.6 → §22.9. Ship after web stabilizes; share the same `lockdown_self()` RPC from PR #2.

### 22.11 Status

- Redesign code: complete on `:3333` (45 files, 22 sections, 8 settings cards). Demo-data branches stripped from real components per owner directive. Tier color removed entirely per owner directive.
- Cutover: not started. PRs above are sequenced but unscheduled — awaiting owner go.
- iOS port: not started. Web cutover should land first to establish the canonical surface.
