# MASTER TRIAGE — 11-agent sweep, 2026-04-23

Source: 3 zone-split (settings / API / components) + 4 round-2 unified (A/B/C/D) + 4 round-3 specialised (Kids iOS / Admin UI / Billing+IAP / Cron+lib).
Notation: **[N/4]** = how many of the 4 unified round-2 agents corroborated. Round-3 agents are independent (single-source unless noted).

---

## TIER 0 — Handler crashes (regressions)

| # | File:Line | Bug | Source |
|---|-----------|-----|--------|
| 1 | `web/src/app/api/admin/users/[id]/roles/route.js:130` | DELETE calls undefined `assertActorOutranksTarget`. Every revoke 500s. POST migrated, DELETE forgotten. | API (file-verified) |
| 2 | `web/src/app/api/admin/billing/cancel/route.js:37` + `freeze/route.js:35` | References `actor.id` but variable is `user`. ReferenceError on every cross-user mutation. | API (file-verified) |

## TIER 1 — 4/4 unanimous CRITICAL

| # | File:Line | Bug | Corroboration |
|---|-----------|-----|---------------|
| 3 | `web/src/app/api/auth/email-change/route.js:44-51` | Flips `email_verified=false` BEFORE attempting `auth.resend`; swallows resend error → permanent unverified-state lockout. | A+B+C+D + components |
| 4 | `VerityPost/VerityPost/StoryDetailView.swift:1855` | Quiz-pass at 70% via integer math vs server's 60% threshold. 3/5 pass on web → iOS reloads → discussion gated forever. | A+C+D + iOS agent |
| 5 | `web/src/app/profile/[id]/page.tsx:353-411` | `handleFollow` + `handleBlock` write to `follows`/`blocked_users` direct via RLS client. Bypasses rate limit, email-verified gate, audit, perm gate. **RESOLVED-BY-9 (commit 11986e8)**: file replaced with under-construction stub; the 855 lines containing the bug are gone. `/u/[username]` (the canonical surface) was never vulnerable — uses `FollowButton.tsx` → `/api/follows`. When `PUBLIC_PROFILE_ENABLED` flips back, the bug does not return. | A+C+D + settings |
| 6 | `web/src/app/profile/settings/page.tsx:2196-2204` PasswordCard | Verifies current password via `signInWithPassword`. Bypasses login rate limit, clobbers session cookie. | A+B+C+D + settings |
| 7 | `web/src/components/Ad.jsx:148-152` | `<a href={ad.click_url}>` from DB with no scheme validation. `javascript:` execution on click. | B+C+D |
| 8 | `web/src/app/profile/settings/page.tsx:1788, 1847` | `backgroundImage: url(${avatarUrl\|bannerUrl})` from raw user URLs. CSS-injection vector. | A+C+D + settings |
| 9 | `web/src/app/profile/[id]/page.tsx:76-80, 631-657` | Tab nav (`Activity`/`Milestones`) hardcoded to `/profile/activity` (viewer's own profile, not the viewed user's). | A+C+D + settings |

## TIER 2 — 2-3/4 corroborated CRITICAL

| # | File:Line | Bug | Corroboration |
|---|-----------|-----|---------------|
| 10 | `web/src/components/CommentThread.tsx:425-441` ↔ `web/src/app/api/users/[id]/block/route.js` | POST always returns `{blocked: true}` (split route). UI reads `data.blocked` to toggle. No unblock from comment row; clicking Block again no-ops. Dead unblock branch. | B+D + components | **SHIPPED 2026-04-24 · 5823194** — wire POST/DELETE split into CommentThread + messages block flows. |
| 11 | `web/src/app/api/notifications/preferences/route.js:43, 71-78` | Gate is `notifications.prefs.toggle_push` only — denies email/in-app to free-tier. PATCH `?? true` defaults reset other channels on partial body. | B+D | **SHIPPED 2026-04-24 · d470e88** — partial-PATCH merge semantics, no channel reset. |
| 12 | `update_own_profile` RPC (Supabase) + `web/src/app/profile/settings/page.tsx:1608-1611` + `VerityPost/VerityPost/SettingsView.swift:1338-1386` | RPC allowlists `username`; `reject_privileged_user_updates` trigger doesn't block it. UI says "Usernames cannot be changed" but DevTools call works. iOS exploits this directly — full rename in patch. | B + settings | **SHIPPED 2026-04-24 · 710be2b** — freeze username mutation in update_own_profile (schema/152). |
| 13 | `web/src/app/api/cron/send-emails/route.js:124` | `notifications.action_url` flows into outbound email HTML. `absoluteUrl` only adds `https://` to relative paths; no `javascript:`/`data:` rejection. Stored XSS via email. | A+C + API | **SHIPPED 2026-04-24 · 24c1a3d** — reject javascript: / data: / vbscript: in email action_url. |
| 14 | `VerityPost/VerityPost/AuthViewModel.swift:213-217` | Username sanitizer accepts Unicode letters. Cyrillic а vs Latin a homoglyph collision. Server-side signup doesn't normalize either. | A+C+D | **SHIPPED 2026-04-24 · 4ebb962** — restrict iOS username to ASCII (Cyrillic homoglyph). |
| 15 | `web/src/app/api/auth/callback/route.js:147, 178` | Drops `?next=` when first-time OAuth user redirects to `/signup/pick-username`. Original destination lost. | B+D | **SHIPPED 2026-04-24 · edf7791** — preserve OAuth callback ?next= through onboarding chain. |
| 16 | `web/src/app/api/account/delete/route.js:106-160` | Immediate-delete path doesn't sign out cookie session. Caller can navigate with stale auth until next `getUser()` 401s. | A+D | **SHIPPED 2026-04-24 · a227e8b** — sign out session after immediate account deletion. |
| 17 | `web/src/app/api/auth/signup/route.js:67-94` | Step-by-step service writes with no rollback. `users.upsert` ok → `roles.insert` fails → user has profile with no role → permanent permission lockout. | D + API | **SHIPPED 2026-04-24 · baff805** — idempotent user_roles insert + post-write role verification. |
| 18 | `VerityPost/VerityPost/AuthViewModel.swift:222-240` | Direct PostgREST username/reserved probes via anon client. No rate limit. Web has rate-limited `/api/auth/check-email` + `/api/auth/resolve-username`. Username enumeration. | A+C | **SHIPPED 2026-04-24 · 955af8e** — broker iOS username checks through rate-limited /api/auth/check-username (schema/151). |
| 19 | `web/src/app/profile/settings/page.tsx:1520-1530` | Avatar upload to `avatars` storage bucket which doesn't exist (only `banners` + `data-exports` provisioned). 100% failure. Banner has friendly fallback; avatar leaks raw "Bucket not found". | settings (MCP-verified) | **SHIPPED 2026-04-24 · 1c45eca** — graceful avatar-upload failure when bucket missing. |
| 20 | `web/src/app/profile/settings/page.tsx:544` + `VerityPost/VerityPost/AuthViewModel.swift:580` | `select('*')` from `users` — leaks `stripe_customer_id`, `apple_original_transaction_id`, `metadata` (provider tokens), `last_login_ip`, `mute_level`, `failed_login_count`, `frozen_at`. Page consumes ~10 fields. | A+B+D | **SHIPPED 2026-04-24 · 93696f9** — replace users select(*) with explicit columns + narrow UserRow. |
| 21 | `web/src/app/api/messages/route.js:38-47` + `conversations/route.js:39-58` | Status codes derived from `error.message.includes('paid plan' / 'muted' / 'rate limit')`. RPC error rename → 429 silently drops to 400 with no `Retry-After`. | A+C+D + API | **SHIPPED 2026-04-24 · 77625e9** — stable [CODE] prefix on DM RPC errors (schema/150). |

## TIER 3 — Single-agent CRITICAL (lower confidence; still real)

| # | File:Line | Bug | Source |
|---|-----------|-----|--------|
| 22 | `web/src/app/api/promo/redeem/route.js:30-34` | `.ilike('code', code.trim())` no LIKE-wildcard escape. `code: '%'` matches arbitrary promos. | A | **SHIPPED 2026-04-24 · 86b0787** — escape LIKE metachars in promo-code lookup. |
| 23 | `web/src/app/api/auth/login-failed/route.js:67-82` | Server-side `signInWithPassword` per failed-login report ties up Vercel function's outbound IP against GoTrue's per-IP quota for entire user base. | D | **STALE 2026-04-24** — ephemeral-client pattern already in place (verified 2026-04-24). |
| 24 | `web/src/app/api/comments/[id]/vote/route.js:18` | Gates ALL vote types behind `comments.upvote`. Users blocked from downvote can downvote freely. | B | **SHIPPED 2026-04-24 · 76a13fb** — route vote permission by type (upvote/downvote/clear). |
| 25 | `web/src/app/api/admin/billing/audit/route.js:22` | Write endpoint gated by `admin.billing.view` (read perm). Anyone with billing-view plants arbitrary audit rows. | API | **SHIPPED 2026-04-24 · 4eb37b4** — gate admin billing audit on billing-write perms, not view. |
| 26 | `web/src/app/api/account/login-cancel-deletion/route.js:21` | No `isAllowedOrigin` check on cookie branch (sibling `/api/account/delete` does enforce). CSRF on account-state mutation. | API | **SHIPPED 2026-04-24 · 9828613** — require same-origin on cookie-branch cancel-deletion (CSRF). |
| 27 | `web/src/app/api/events/batch/route.ts:149` | Accepts client-supplied `user_id` with no session cross-check. Analytics attacker-controllable. | API | **SHIPPED 2026-04-24 · 6683aee** — events.batch — ignore client-supplied user_id. |
| 28 | `web/src/app/api/kids/reset-pin/route.js:49` | `signInWithPassword` to verify password (DA-092/F-012 anti-pattern). Bypasses lockout, no per-email rate limit, clobbers parent session cookie. | API | **STALE 2026-04-24** — ephemeral-client pattern already in place (verified 2026-04-24). |
| 29 | `web/src/app/api/ios/subscriptions/sync/route.js:144-149` | `existingSub` lookup matches only `apple_original_transaction_id`, not user_id. Stolen-receipt replay overwrites another user's sub row. | API | **STALE 2026-04-24** — defense-in-depth user_id guard already exists at route.js:184. |
| 30 | `web/src/app/api/ios/appstore/notifications/route.js:97` | Apple notif rows stuck at `processing_status='received'`. Reclaim path doesn't include `received` → silently drop subscription state changes. | API | **SHIPPED 2026-04-24 · 24b6675** — reclaim Apple notif rows stuck at 'received'. |
| 31 | `web/src/app/api/auth/resolve-username/route.js:60-62` | 404-vs-200 response shape differentiates registered usernames despite rate limit. 14k probes/day enumeration. | C | **SHIPPED 2026-04-24 · 08929cf** — uniform 200 response on resolve-username — close enumeration. |
| 32 | iOS `/api/auth/login` bypass | iOS signs in via SDK, writes `last_login_at` via RPC. `login_count`, `audit_log` row, `scoreDailyLogin` all skip iOS users. | C | **STALE 2026-04-24** — iOS async login via SDK is intentional / by design. |
| 33 | `web/src/app/api/quiz/submit/route.js:33-34` | Hardcodes `answers.length !== 5`. Locks quiz size into route forever. Config-via-DB violation. | A+C | **SHIPPED 2026-04-24 · 35c1035** — validate quiz answer length against actual quiz count. |
| 34 | `web/src/app/profile/settings/page.tsx:1525-1530` | Avatar upload doesn't reject SVG. Embedded JS served from `veritypost.com` origin = stored XSS via avatar viewer. | C | **SHIPPED 2026-04-24 · 3056bc5** — reject SVG avatars — stored XSS vector. |
| 35 | `web/src/app/api/cron/sweep-kid-trials/route.js:39-40` | Exports both GET and POST. CRON_SECRET in URL bar = browser history + access logs. | C | **STALE 2026-04-24** — CRON_SECRET read from Authorization header (verifyCronAuth), never URL; removing GET would break Vercel cron scheduler. |
| 36 | `web/src/components/Avatar.tsx:27` | `username[0]` for emoji/multi-byte usernames returns broken surrogate half. | A+C+B | **SHIPPED 2026-04-24 · 34366c7** — Avatar initials split by code point. |
| 37 | `web/src/components/CommentRow.tsx:79-83` | Mention links `/u/<name>` — `/u/` route doesn't exist. Every @-mention 404s. | A+D | **STALE 2026-04-24** — /u/[username] route exists; PUBLIC_PROFILE_ENABLED kill-switch — prelaunch-parked. |
| 38 | `web/src/components/AccountStateBanner.tsx:72` | Deletion-banner CTA → `/profile/settings/data` directory which doesn't exist. 404. | A+D | **STALE 2026-04-24** — /profile/settings/data route exists as redirect to #data anchor. |
| 39 | `web/src/app/api/auth/callback/route.js:155` | Updates `users.email_verified` via cookie-scoped client (RLS). Inconsistent with rest of file (service). Silently no-ops if `users_update` policy ever tightens. | A+C+D | **SHIPPED 2026-04-24 · 2b05dd4** — callback email_verified update uses service client. |

---

## ROUND 3 ADDITIONS — 4 specialised agents

### Kids iOS (Round 3-A)

**CRITICAL:**
| # | File:Line | Bug |
|---|-----------|-----|
| K1 | `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:307` + `KidsAppState.swift:165` | Quiz pass uses 60% threshold for celebration; `completeQuiz()` increments streak unconditionally without `passed` param. Failed quiz → "Great job!" + streak animation + DB unchanged. | **SHIPPED 2026-04-24 · 0295c41** — KidQuizResult propagation + completeQuiz(passed:) guard. Bundled with K10. |
| K2 | `VerityPostKids/VerityPostKids/PairingClient.swift:125-130` | Kid JWT 7-day TTL with no refresh path. Backgrounded-then-expired session → silent 401 → no error, no re-pair prompt. | **SHIPPED 2026-04-24 · f7ef24e** — refreshIfNeeded on launch + scenePhase.active; /api/kids/refresh route + schema/153. |
| K3 | `VerityPostKids/VerityPostKids/ArticleListView.swift:160-165` | `categorySlug` parameter accepted but never used. Every category card shows the same article list. | **SHIPPED 2026-04-24 · cd894a2** — slug threaded through KidCategory → KidsAppRoot → ArticleListView; two-step resolve slug → category_id → filter query. |
| K4 | `VerityPostKids/VerityPostKids/KidReaderView.swift:210-217` + `KidQuizEngineView.swift:290-299` | `reading_log` + `quiz_attempts` retry-once then silent log. Streak trigger never fires; kid sees celebration locally but DB has nothing. | **SHIPPED 2026-04-24 · 500dfe2** — throw on double-fail; KidQuizResult.writeFailures propagated; KidsAppRoot suppresses celebration scenes when > 0. |

**HIGH:**
| # | File:Line | Bug |
|---|-----------|-----|
| K5 | `VerityPostKids/VerityPostKids/ParentalGateModal.swift` callers | Gate exists, used only on `/profile` Unpair + Privacy/Terms. NOT on quizzes, expert sessions, settings, reading. COPPA gap. |
| K6 | `VerityPostKids/VerityPostKids/GreetingScene.swift:375-489` | `DispatchQueue.main.asyncAfter` choreography has no cancellation. View dismiss mid-animation → orphan blocks mutating dead view state. | **SHIPPED 2026-04-24 · bc08acf** — rewritten runChoreography + typeChoreography as async over Task.sleep; .task(id: name) auto-cancels on disappear. |
| K7 | `VerityPostKids/VerityPostKids/GreetingScene.swift:468-489` | Typewriter assumes ASCII names. Emoji/multibyte (Zoë, José, 中文) misalign sparkle position. | **STALE 2026-04-24** — verified: code uses `typedCharCount < name.count` where name.count is Swift grapheme cluster count; no ASCII Array-indexing exists. Triage claim incorrect. K6 rewrite preserved the correct Character-based loop. |
| K8 | `VerityPostKids/VerityPostKids/ProfileView.swift:63,67` | `URL(string:)!` force-unwrap. Crash vector if ever made DB-driven. | **SHIPPED 2026-04-24 · 0908817** — URL(string:) ?? fallbackLegalURL (apex domain). |
| K9 | `VerityPostKids/VerityPostKids/KidsTheme.swift:91-113` | `Color(hex:)` returns black on parse failure. Silent invisible UI, no warning. | **SHIPPED 2026-04-24 · cca0a6e** — scanHexInt64 result + length guard; log warning + return fuchsia sentinel on parse failure. |

**MEDIUM:**
| # | File:Line | Bug |
|---|-----------|-----|
| K10 | `VerityPostKids/VerityPostKids/KidsAppRoot.swift:9` flow comment | Lies about wiring. `completeQuiz()` is dead code with hardcoded values; never called from quiz engine. **All V3 animation scenes (StreakScene, QuizPassScene, BadgeUnlockScene) are unwired** — celebration system structurally broken. | **SHIPPED 2026-04-24 · 0295c41** — sceneQueue pattern in KidsAppRoot; StreakScene + BadgeUnlockScene now present after pass. QuizPassScene deferred (requires exposing last-question state in engine). Bundled with K1. |
| K11 | `VerityPostKids/VerityPostKids/LeaderboardView.swift:263-303` | RLS returns kid's own row only; code uses `i+1` from full unfiltered → kid always sees rank 1 by accident. No real top-N. | **SHIPPED 2026-04-24 · 8729899** — SECURITY DEFINER RPC get_kid_category_rank (schema/154); loadCategory calls RPC + renders entry.rank + footer "Rank X of Y". Bundled with K13. |
| K13 | `VerityPostKids/VerityPostKids/LeaderboardView.swift:125-129` | Category-pill button has empty action. Taps do nothing. | **SHIPPED 2026-04-24 · 8729899** — pills driven from fetched VPCategory list; tap sets selectedCategory → onChange triggers load. Bundled with K11. |

### Admin UI (Round 3-B)

**CRITICAL:**
| # | File:Line | Bug |
|---|-----------|-----|
| AD1 | `web/src/app/admin/words/page.tsx:118` + `admin/plans/page.tsx:137,269` | `confirm()` called without `<ConfirmDialogHost />` mounted. Silent no-op on every destructive action. (Already on master triage from components agent — 3-B confirms exact lines.) | **SHIPPED 2026-04-24 · aced725** — mount <ConfirmDialogHost /> on admin/words + admin/plans. |
| AD2 | `admin/access/page.tsx`, `admin/permissions/page.tsx`, `admin/moderation/page.tsx`, `admin/cohorts/page.tsx`, `admin/stories/page.tsx`, `admin/support/page.tsx`, `admin/pipeline/costs/page.tsx` | Push raw `error.message` into toasts/error divs. DA-119 violations across the admin tree. | **SHIPPED 2026-04-24 · 63875c2** — strip raw error.message from admin toasts (DA-119 sweep). |

**HIGH:**
| # | File:Line | Bug |
|---|-----------|-----|
| AD3 | `web/src/components/admin/DataTable.jsx:108,111` | `j`/`k`/`Enter`/`Space` keyboard shortcuts — owner banned shortcuts in admin. | **SHIPPED 2026-04-24 · 1d3585f** — remove DataTable keyboard shortcuts. |
| AD4 | `admin/users/page.tsx:57-60` + `admin/permissions/page.tsx:129-133` | Client gates on `ADMIN_ROLES` while API enforces stricter perm (e.g. `admin.permissions.manage`). Page renders fully then 403s on first action. | **SHIPPED 2026-04-24 · fdf02bb** — hasPermission('admin.users.list.view') / hasPermission('admin.permissions.catalog.view'). |

**MEDIUM:**
| # | File:Line | Bug |
|---|-----------|-----|
| AD5 | `admin/prompt-presets/page.tsx:29` (EDITOR_ROLES) vs `admin/categories/page.tsx:188` (ADMIN_ROLES) | Inconsistent role thresholds for similarly-privileged surfaces. | **SHIPPED 2026-04-24 · 3f24c16** — both gated on their API perm key (admin.pipeline.presets.manage, admin.pipeline.categories.manage). |
| AD6 | `admin/pipeline/costs/page.tsx:119` | Load failure sets `err` state but never toasts. User might not notice the page is broken. | **SHIPPED 2026-04-24 · 91ea57e** — ToastProvider + useEffect toast on err; DA-119 sweep on prior `${error.message}` interpolations. |
| AD7 | `admin/kids-story-manager` + `admin/story-manager` | Redefine local color palettes (`accent: '#2563eb'`, `now: '#c2410c'`) overriding `ADMIN_C` — design-token drift. | **SHIPPED 2026-04-24 · b2e9f56** — promoted now/nowBg to ADMIN_C; story-manager drops override; kids-story-manager keeps only the genuinely unique accent. |

**Pages 3-B deferred:** `/admin/articles/[id]/{edit,review}`, `/admin/recap`, `/admin/breaking`, `/admin/subscriptions`, `/admin/expert-sessions`, `/admin/data-requests`, `/admin/webhooks`, `/admin/streaks`, `/admin/analytics`, `/admin/sponsors`, `/admin/promo`, `/admin/cohorts`, `/admin/reader`. Follow-up agent needed.

### Billing + IAP (Round 3-C)

**CRITICAL:**
| # | File:Line | Bug |
|---|-----------|-----|
| B1 | `web/src/app/api/stripe/webhook/route.js:320-385` + `api/ios/appstore/notifications/route.js:201-246` | Webhooks call `billing_change_plan()` / `billing_resubscribe()` / `billing_freeze_profile()` but never `bump_user_perms_version`. Permission cache stale after every paid plan change. Frozen users retain paid features. (Admin manual-sync DOES bump — webhook path forgotten.) |
| B2 | `web/src/app/api/stripe/webhook/route.js:139-161` switch | `invoice.payment_succeeded` event NOT handled. Stuck-limbo subscriptions when `customer.subscription.updated` misses or fires out-of-order. | **SHIPPED 2026-04-24 · dc7b69d** — new handlePaymentSucceeded clears plan_grace_period_ends_at + plan_status='active' on subscription-source invoice success. |
| B3 | `web/src/app/api/ios/subscriptions/sync/route.js:26-73` | Receipt hijack — `userId` from bearer token, never cross-checked against JWS `payload.appAccountToken`. Attacker POSTs victim's receipt with own bearer → claims victim's subscription. Combines with #29 in master triage (no user_id filter on existingSub lookup) for clean account-takeover. |
| B4 | `web/src/app/api/stripe/webhook/route.js:110-113` | Stuck `processing_status='processing'` window — if invocation crashes mid-RPC, row stays `processing` forever, all Stripe retries return 200 immediately. Subscription left inconsistent. Needs >5min reclaim. | **SHIPPED 2026-04-24 · dc7b69d** — age-based reclaim (>5min) on processing/received; mirrors #30 iOS-side fix. |
| B5 | `web/src/app/api/promo/redeem/route.js:144-147` | Direct `users.plan_id` write races concurrent Stripe webhook RPC. `users.plan_id` and `subscriptions.plan_id` diverge. Permission resolver reads users → wrong tier features granted. | **SHIPPED 2026-04-24 · bbcd785** — routed through billing_change_plan (FOR UPDATE serializes with webhook) or billing_resubscribe for frozen users; dropped redundant route-level perms_version bump. |

**HIGH:**
| # | File:Line | Bug |
|---|-----------|-----|
| B6 | `stripe/webhook/route.js:139-161` | `invoice.upcoming` not handled — no proactive "card expiring" notifications. | **SHIPPED 2026-04-24 · dc7b69d** — new handleInvoiceUpcoming fires a billing_alert notification with upcoming amount + currency. |
| B7 | `stripe/webhook/route.js:139-161` | `customer.deleted` not handled — orphan `users.stripe_customer_id`. F-016 defense then refuses upgrade. | **SHIPPED 2026-04-24 · dc7b69d** — new handleCustomerDeleted clears orphan stripe_customer_id via guarded UPDATE; audit_log entry + warn when plan_status='active'. |
| B8 | Schema — `subscriptions(user_id, apple_original_transaction_id)` | Verify UNIQUE constraint exists. Concurrent Restore Purchases → duplicate rows. | **SHIPPED 2026-04-24 · 5d95f2b** — schema/155 adds partial UNIQUE index. Owner applies. |
| B9 | `ios/appstore/notifications/route.js:144-162` | S2S notification arriving before iOS sync returns `orphaned: true` and gives up. If sync never fires, all subsequent S2S events for that transaction silently orphan. Should fall back to `transaction.appAccountToken` user lookup. | **SHIPPED 2026-04-24 · 91146cb** — before orphaning, look up transaction.appAccountToken → users.id; on match mint a minimal pending row + handler proceeds. |
| B10 | `api/admin/subscriptions/[id]/manual-sync/route.js:111-115,139-142` | Sets `pending_stripe_sync: true` but no automation reads it. Admin downgrade-in-DB → Stripe still bills user at next renewal. | **SHIPPED 2026-04-24 · 0ca552e** — dropped the unused flag; audit_log is the canonical record of "admin changed local state; operator owes the Stripe-side mirror." |
| B11 | `stripe/webhook/route.js:392-419` `handleChargeRefunded` | Auto-freezes on apparent full refund. Slow Stripe state, partial-refund-misclassified, chargeback-later-won → harsh freeze with no admin approval. |
| B12 | `ios/subscriptions/sync/route.js:57-60` + `ios/appstore/notifications/route.js:64-67` | `JWS verification failed: ${err.message}` — DA-119 leak. | **SHIPPED 2026-04-24 · 91146cb** — both sites log server-side + return generic "Invalid signature". |

**MEDIUM:**
- B13: Promo `current_uses` ABA race — failed user still inserts into `promo_uses`, analytics drift  **STALE 2026-04-24** — current code uses optimistic `.eq('current_uses', n)` claim + rollback on failure; duplicate-use guard prevents re-redeem. Race surface is narrow; not worth more code complexity.
- B14: Apple JWS header timestamp not validated — past-dated receipt replay  **DEFERRED 2026-04-24** — real concern; needs a real Apple JWS to craft tests against. Flag for follow-up.
- B15: `/api/ios/subscriptions/sync` no rate limit — JWS-armed attacker can spam webhook_log  **SHIPPED 2026-04-24 · a1b30d7** — 20/min/ip via new `ios_subscription_sync` policy (schema/156). Owner applies.
- B16: Apple notification handler marks unknown types as `processed` — future-handler-add can't catch up  **SHIPPED 2026-04-24 · a1b30d7** — unknown types stay at `received` + record processing_error hint so future migration can replay.
- B17: `billing_cancel_subscription` rejects already-frozen users with no recovery path  **DEFERRED 2026-04-24** — RPC-level behavior; separate RPC fix.

**LOW:**
- B18: No `audit_log` row on Stripe webhook errors (only `webhook_log`)  **DEFERRED 2026-04-24** — `webhook_log` already captures errors + processing_error; second audit_log row would duplicate.
- B19: Free plan lookup by `name='free'` — drift risk; should use `is_free_tier` column  **SHIPPED 2026-04-24 · a1b30d7** — manual-sync route now uses `tier='free'` matching the RPCs' canonical column.
- B20: No user-facing notification on refund freeze  **STALE 2026-04-24** — `handleChargeRefunded` creates a `billing_alert` notification as of B11 (commit 8984700, prior session).

**Code paths 3-C deferred:** Google Play IAP (confirm out of scope), family plan seat counting/decrement, win-back/churn cron, invoice record sync (does anything populate `invoices` table?), pause/resume subscriptions (`pause_start`/`pause_end` columns exist, no handlers).

### Cron + middleware + lib infra (Round 3-D)

**CRITICAL:**
| # | File:Line | Bug |
|---|-----------|-----|
| L1 | `web/src/app/robots.js:12-26` ↔ `middleware.js:33,39` | `robots.js` doesn't list `/category` or `/card` in disallow → robots told they can crawl, middleware then 302s to login. Combined with `sitemap.js` publishing `/category/<slug>` URLs = wasted crawl budget + zero indexing. Either both go public OR both go in disallow. **SHIPPED 2026-04-24 · c012c3f** — removed `/browse`, `/category`, `/card`, `/search`, `/u` from `PROTECTED_PREFIXES` (L1 scope expanded per A/B/C/D consensus; /search + /u added per owner directive to open anon-safe surfaces broadly). `robots.js` unchanged (already did not disallow these). `/card` keeps its layout-level noindex (intentional — prevents ranking for people's names vs canonical `/u/<username>`). Deferred items opened: (a) anon-bookmark upgrade CTA on /category + /browse, (b) /card OG leak for `profile_visibility=private`, (c) /card canonical → /u/<username>, (d) /leaderboard + /recap anon-safety sweep. |
| L2 | `web/src/lib/permissions.js:67-85` `refreshIfStale` | Stale-fallthrough is a security leak on revocation. Comment says "slightly stale > all-deny" intentionally, but for plan-downgrade / role-revoke, concurrent `hasPermission()` reads still return YES until new fetch lands. Should differentiate grants (stale ok) from revokes (hard-clear). | **SHIPPED 2026-04-24 · 0493050** — allPermsCache = null BEFORE awaiting refreshAllPermissions on version bump; fail-closed during the refetch window. |

**HIGH:**
| # | File:Line | Bug |
|---|-----------|-----|
| L3 | `cron/send-push/route.js:27,56` | `BATCH_SIZE=500` + `.in('user_id', userIds)` ≈ 18KB URL → exceeds PostgREST 8KB cap → silent failure, notifications skipped without log. | **SHIPPED 2026-04-24 · 9d04420** — BATCH_SIZE=200 (~7.4KB URL, comfortable headroom). |
| L4 | `cron/send-emails/route.js:71-82` | `Promise.all` for setup deps; any single failure aborts batch. 50 notifications re-queue → double-send when error clears. | **SHIPPED 2026-04-24 · 8b304e7** — Promise.allSettled + per-result branching; clean bail leaves email_sent=false for retry. |
| L5 | `cron/check-user-achievements/route.js:45-49` | Sequential `for await rpc(...)` over all 48h-active users. 10k × 10ms = 100s, exceeds `maxDuration=60`. Last users skipped. | **SHIPPED 2026-04-24 · 7a46e71** — bounded-concurrency worker pool (10 in flight). |
| L6 | `cron/process-data-exports/route.js:102-109` | Partial-failure reset: RPC succeeded + upload failed → next run re-runs RPC + re-uploads, two download URLs emailed. Idempotency broken. | **SHIPPED 2026-04-24 · cd5b89a** — state-machine guards the 'processing' → 'completed' transition; orphan uploads cleaned on error; notification best-effort after completion. |
| L7 | `web/src/lib/supabase/server.ts:51-66` `createClientFromToken` | Doesn't validate JWT shape. `bearer="garbage"` passes through, fails at first RPC. No early reject. | **SHIPPED 2026-04-24 · a050234** — regex shape check (three base64url segments); throw at factory boundary. |

**MEDIUM:**
| # | File:Line | Bug |
|---|-----------|-----|
| L8 | `web/src/lib/rateLimit.js:38-42` | Dev fail-open uses `VERCEL_ENV !== production && !== preview`. Custom-VPC staging deploy with `NODE_ENV=development` bypasses rate limits — auth brute-force vector on staging. | **SHIPPED 2026-04-24 · 4cc5d56** — require NODE_ENV=development AND RATE_LIMIT_ALLOW_FAIL_OPEN=1 explicit opt-in. |
| L9 | `web/src/lib/apns.js:21-23` | JWT cache checks `expiresAt > now+60` but not `created_at < now-3000`. Long-running cron reusing JWT past 50min hits Apple max-age invalidation. | **STALE 2026-04-24** — verified: jwtCache.expiresAt is set to `now + JWT_MAX_AGE_SECONDS` (50min) at signing time. Check `expiresAt > now + 60` refreshes before 50min elapses. Well under Apple's 60min invalidation. |
| L10 | `web/src/lib/appleReceipt.js:23` | `EXPECTED_BUNDLE_ID = 'com.veritypost.app'` hardcoded. No env override for white-label/test build. | **SHIPPED 2026-04-24 · 4cc5d56** — `process.env.APPLE_BUNDLE_ID || 'com.veritypost.app'`. |
| L11 | `web/src/lib/featureFlags.js:14-26` | Doesn't differentiate "row not found" (PGRST116) from "table missing" (42P01). Whole `feature_flags` table missing → silent `defaultValue` return. Caller passing `defaultValue=true` silently bypasses gate. | **SHIPPED 2026-04-24 · 4cc5d56** — real error → fail closed (false); null data → caller's default. |
| L12 | `web/src/lib/plans.js:12-118` | `TIERS`/`PRICING` hardcoded; UI imports them directly. Admin DB change doesn't reflect without redeploy. | **DEFERRED 2026-04-24** — large DB refactor touching admin UI + checkout + settings. Keep as follow-up. |
| L13 | `web/src/lib/roles.js:34-51` | 60s cache. Admin role-assignment dropdowns can show stale rolelist for 60s after a new role is added. | **DEFERRED 2026-04-24** — 60s staleness on admin dropdown is acceptable UX; DB pub/sub invalidation would be the right fix but scope exceeds a single-file change. |
| L14 | `web/src/lib/pipeline/persist-article.ts:152-158` | `row = data[0]` if array; if RPC returns `[]`, `row` is undefined and next access silently fails. | **STALE 2026-04-24** — code already has `if (!row) throw new PersistArticleError('persist_generated_article returned no row')`. Guard exists. |
| L15 | `web/src/lib/pipeline/cost-tracker.ts:78-85` | Settings `value='not-a-number'` throws sentinel `cap_usd=-1`; downstream may treat as uncapped. | **STALE 2026-04-24** — parseNum throws on non-number; checkCostCap is documented fail-closed with cap_usd=-1 as the SIGNAL (not a silent uncapped). |
| L16 | `web/src/middleware.js:180-188` | CSP `Report-Only` is audit-only, not protective. Worth flagging as a scope item once nonces ship to all routes. | **STALE 2026-04-24** — intentional audit-only mode; scope item not a bug. |

**LOW:**
- L17: `sitemap.js:48-49` hardcoded `.limit(5000)` — silently truncates >5000 articles  **SHIPPED 2026-04-24 · 4cc5d56** — console.warn when cap hit. Multi-file sitemap index deferred until actually needed.
- L18: `apiErrors.js:20-21` P0001 passthrough trusts RAISE message; sloppy RPC author can leak secrets  **SHIPPED 2026-04-24 · 4cc5d56** — sanitize whitespace + cap at 240 chars.
- L19: `cron/send-push:262-266` no concurrency lock — overlapping cron invocations fight queue  **DEFERRED 2026-04-24** — needs schema (claim column or advisory-lock RPC). Cron schedule tolerable if runs finish within interval.
- L20: `cronAuth.js:35-40` length-equality check leaks length via timing (mitigated by random secret)  **STALE 2026-04-24** — mitigated by random-secret rotation; LOW priority + already documented trade-off.

**Files 3-D deferred:** `pipeline/call-model.ts` retry/backoff tail, `pipeline/prompt-overrides.ts` injection logic, `pipeline/scrape-article.ts` SSRF allowlist (likely real concern), `app/layout.js` GA4/AdSense CSP/privacy, `apns.js` lifecycle tail, `appleReceipt.js` `resolvePlanByAppleProductId` RLS safety, `cron/pipeline-cleanup` sweeps 3+4.

---

## ROUND 4 ADDITIONS — bug-hunt 2026-04-25

Owner-reported + audit-surfaced + test-surfaced items closed in the 2026-04-25 bug-hunt session. Detail: `Sessions/04-25-2026/Session 1/BUGS_FIXED_2026-04-25.md`. Session log: `Sessions/04-25-2026/Session 1/SESSION_LOG_2026-04-25.md`. Commits 9e1bb7b → 433b31f.

| # | File:Line | Bug |
|---|-----------|-----|
| BH1 | `VerityPost/VerityPost/HomeView.swift:558-568` BrowseLanding | Owner-reported: "I see a list of categories and I can't click it." Each row was static `Text(cat.displayName)` with no Button/NavigationLink/onTapGesture wrapper. | **SHIPPED 2026-04-25 · 94034d8** — wrap rows in NavigationLink → new CategoryDetailView; add Hashable to VPCategory; XCUITest regression guard `test_browseCategoriesAreInteractive`. |
| BH2 | `VerityPostKids/VerityPostKids/ExpertSessionsView.swift:34-36` | Same class as BH1 in kids app: session cards rendered as static VStacks, no tap handler. | **SHIPPED 2026-04-25 · 83e38c0** — wrap cards in Button → sheet detail; `.contentShape(Rectangle())` for tap-anywhere. |
| BH3 | `web/src/app/api/admin/promo/route.ts:75-83` | Admin promo-create returned 500 on duplicate code (Postgres 23505 leaking through). | **SHIPPED 2026-04-25 · 94034d8** — map 23505 → 409 with friendly "code already exists" message. Regression test added in `admin-deep.spec.ts`. |
| BH4 | `web/src/app/api/users/[id]/block/route.js:73-87` | Blocking a user whose ID doesn't exist returned generic 500 instead of 404. Postgres 23503 (FK violation) leaking. | **SHIPPED 2026-04-25 · 94034d8** — explicit `error.code === '23503'` → 404 `{ error: 'User not found' }`. |
| BH5 | `web/src/app/browse/page.tsx:259-331` "Latest" section | When zero published articles, the section header "Latest" rendered with an empty grid below it. No empty-state copy. | **SHIPPED 2026-04-25 · 83e38c0** — `featured.length === 0` branch renders dashed-border "No new stories yet today" card. |
| BH6 | `VerityPostKids/project.yml` | Kids app portrait-locks via `UISupportedInterfaceOrientations` but missed `UIRequiresFullScreen=true`. Triggers App Store warning at archive (would be a submission rejection signal). | **SHIPPED 2026-04-25 · 94034d8** — added `UIRequiresFullScreen: true`. xcodebuild archive now warning-free. |
| BH7 | `schema/114_f7_foundation.sql:77-87` (ai_models + 3 sibling F7 tables) | Admin "Generate" button in /admin/newsroom did nothing on click. PipelineRunPicker can't load `ai_models`; PostgREST returned 401 "permission denied" because the table had RLS but no `GRANT SELECT TO authenticated, service_role`. Picker has 0 models → button stays disabled → click no-op. Same gap on `ai_prompt_overrides`, `kid_articles`, `kid_sources`. | **SHIPPED 2026-04-25 · schema/177 (owner-applied) + 94034d8** — `GRANT SELECT ON public.{ai_models,ai_prompt_overrides,kid_articles,kid_sources} TO authenticated, service_role`. PostgREST schema cache reloaded via `NOTIFY pgrst, 'reload schema'`. Probe verified: 4 seeded models now visible. |
| BH8 | `web/src/app/api/admin/users/[id]/role-set/route.js` (3 spots) + `permission-sets/[id]` (1) + `subscriptions/[id]/manual-sync` (6) + `support/route.js` (1) | 8 routes returned `NextResponse.json({ error: someErr.message }, { status: 500 })` — leaks Postgres constraint names, RLS policy names, table/column names to clients. Info-leak class. | **SHIPPED 2026-04-25 · 29f7a22** — routed all 8 leaks through existing `safeErrorResponse(NextResponse, err, ...)` helper from `web/src/lib/apiErrors.js`. Maps 23505→409, 23503→400, P0001→422 passthrough, etc. |

**UI polish shipped (audit findings, secondary):**
- iOS adult: BookmarksView Remove → `VP.danger` token; StoryDetailView "Loading…" → "Starting quiz…"; SignupView + AlertsView decorative icons → `accessibilityHidden(true)`
- iOS kids: KidQuizEngineView close X 36→44pt + accessibilityLabel; ExpertSessionsView card `.contentShape(Rectangle())`
- Web: `/bookmarks` at-cap UI dedup (banner = upgrade CTA only); `/login` lockout copy → relative minutes (timezone-safe); `/not-found` 404 added "Browse categories" anon-safe CTA; `/story/[slug]` Loading state → `aria-live="polite"` + "Loading article…" + center-aligned

**Test infrastructure landed:**
- `web/tests/e2e/_fixtures/seed.ts` — deterministic seeding for 10 roles + cross-cutting state (subscriptions, audit_log, reports, expert app, achievement, follows, notifications, bookmarks, kid streak, comments, pair code, article + quiz)
- 8 new deep specs: admin-deep (24), admin-deep-batch2 (40), profile-settings-deep (16), kids-deep (17), expert-deep (13), social-deep (16), seeded-reader-flow (5), seeded-roles (18)
- iOS XCUITest targets via XcodeGen: VerityPostUITests (5 tests), VerityPostKidsUITests (4 tests)
- Suite total: **468 passed / 14 failed (known flakes) / 14 skipped (intentional)** on chromium + mobile-chromium

---

## TIER 4 — Quality (HIGH/MEDIUM, ~150 items, batched separately)

Aggregate themes (counts approximate):

- **DA-119 raw error leaks** to user toasts/responses: ~20 sites across settings + admin + iOS sync
- **Length caps missing** on text inputs: support, expert/ask, expert/back-channel, expert/queue/answer, recap/submit, appeals, reports, comments/report
- **Rate limits missing**: comments/vote, comments/flag, comments/report, expert/claim, expert/ask, expert/back-channel, quiz/start, comments PATCH
- **Optimistic-update rollback races**: alerts toggle, watchlist, follow/block, vote
- **`select('*')` on joins**: comments, expert/back-channel, expert-sessions, recap, support GET — moderation/private columns flow to client
- **iOS leaks/dead code**: ProfileView `select("*, plans(tier))`, expert insights `#if false`, `appAwardPoints` dead, custom URL scheme deep-link auth (hijack vector), realtime channel WebSocket leak across navs, DateFormatter allocations in View body
- **Z-index salad** (7 different overlay z-indexes)
- **Inline `<style>` keyframes** (7 components inject identical keyframes)
- **`.js`/`.jsx` files in `web/src/`** — 50-100+ files violating CLAUDE.md "no new `.js`/`.jsx`"
- **PermissionsProvider over-firing** — `onAuthStateChange` full refresh on `INITIAL_SESSION` + `TOKEN_REFRESHED` + every event, plus 60s polling without `visibilityState` gate
- **`onAuthStateChange` cleanup leaks** in signup, profile, profile/[id]
- **iOS `users.upsert` after signup races trigger** — possible orphan auth row + null username
- **`webhook_log` reclaim missing `received` state** for Apple notif rows
- **`messages` + `conversations` brittle error-string status mapping** (also a Tier 2 issue, also widespread)
- **CommentRow `⋯` glyph + `⋯`/`—`/`…` Unicode escapes scattered** — accessibility + grep-hostility
- **Toast IDs via `Date.now() + Math.random()`** — collision risk + uncleared timeouts on unmount
- **Inline `e.currentTarget.style.background` mutations** in Sidebar, Drawer, admin/Page — should be CSS `:hover`

---

---

## Design system tasks shipped

| Task | Description | Status |
|------|-------------|--------|
| T-045 | Classify all `hasPermission()` call sites with gateType (hard / soft / invisible) — prerequisite for T-067 LockModal swap | **SHIPPED 2026-04-26** — `Ongoing Projects/Current/hasPermission-classification.md`. 104 executable call sites classified: 15 HARD, 6 SOFT, 83 INVISIBLE. 41 sites flagged for inline-CTA wiring, 46 keep-invisible, 12 keep-hard-redirect, 5 keep-modal. |
| T-108 | Show asker context on expert queue cards (verity score + username) | **SHIPPED 2026-04-26** — commit 75866af. API JOIN on `users!fk_expert_queue_items_asking_user_id`; web card shows dim "Asked by username" below question body; iOS itemRow shows asker caption. |
| T-109 | Inline markdown preview for web answer composer | **SHIPPED 2026-04-26** — commit 75866af. Raw textarea replaced with Edit/Preview two-tab composer using `marked` + DOMPurify; `dangerouslySetInnerHTML` with sanitized output. |
| T-110 | Sheet-based answer composer with live preview for iOS | **SHIPPED 2026-04-26** — commit 75866af. `AnswerComposerSheet` updated with segmented Picker (Edit/Preview) and `AttributedString(markdown:)` preview tab. |
| T-114 | Per-question category display on expert queue cards | **SHIPPED 2026-04-26** — commit 75866af. API JOIN on `categories!fk_expert_queue_items_target_category_id`; iOS `ExpertQueueItem.category` populated from response; web card shows dim uppercase category label above target_type line. T-025 scope: `ISO8601DateFormatter` promoted to `private static let`. |

---

## Source files

- `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/a12eb7b6b3437712f.output` — settings exhaustive
- `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/a9cb20e6073ca80e6.output` — API exhaustive
- `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/a925f0ee8e67a78f5.output` — components exhaustive
- `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/a287a7e75108c2715.output` — round-2 A
- `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/a2c7e0dbb5720e90b.output` — round-2 B
- `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/a2d3b983e1e5d2cbd.output` — round-2 C
- `/private/tmp/claude-501/-Users-veritypost-Desktop-verity-post/cac30464-d918-4b28-bccd-54b4bf063dcf/tasks/a3529f72270d164c0.output` — round-2 D
