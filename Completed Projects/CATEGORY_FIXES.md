# Verity Post — Bug Hunt Fix Log

Running log of every fix applied during the 10-category bug hunt pass.

---

## Category 1: PostgREST Embed Ambiguity — DONE

All 6 ambiguous embeds disambiguated with `!fk_name(...)` syntax.

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `site/src/app/admin/reports/page.js` | 60 | `users(...)` → `users!fk_comments_user_id(...)` |
| 2 | `site/src/app/api/expert/queue/route.js` | 31 | `comments(...)` → `comments!fk_expert_queue_items_comment_id(...)` + nested `users!fk_comments_user_id` (this was the known-broken embed from Phase Log) |
| 3 | `site/src/app/api/admin/expert/applications/route.js` | 16 | `users(...)` → `users!fk_expert_applications_user_id(...)` |
| 4 | `site/src/app/admin/notifications/page.js` | 152 | `users(...)` → `users!fk_notifications_user_id(...)` |
| 5 | `site/src/app/admin/notifications/page.js` | 234 | same fix on refresh query |
| 6 | `site/src/app/admin/expert-sessions/page.js` | 40 | `users(...)` → `users!fk_user_roles_user_id(...)` |

**SQL migrations written:** none (client-only fix).

**Decisions made during fix:**
- Q1 → only embed source question comment, not answer
- Q2 → embed comment author, not moderator
- Q3 → use `fk_user_roles_user_id` (role holder), no `assigned_by`

---

## Category 2: User-Facing Copy — DONE

### A. Emojis and symbols removed (all 30+ instances)
Replaced with plain text or removed entirely. Zero emoji/symbol characters remain in `site/src/`.

- `auth/callback/page.js:85` — ✗ → `!`
- `admin/moderation/page.js:179` — `✓ ${r}` → `${r} (granted)`
- `messages/page.js:222` — ✏️ button → text "New"
- `messages/page.js:229` — 💬 empty-state icon removed
- `components/NotificationBell.jsx:49` — 🔔 → text "Notifications"
- `recap/[id]/page.js:105` — ✓/✗ → "Correct"/"Incorrect"
- `recap/[id]/page.js:110` — "Read the story →" → "Read the article"
- `leaderboard/page.js:281, 301` — 🔒 → " (Locked)"
- `story/[slug]/page.js:425` — ★/☆ → "Saved"/"Save"
- `admin/breaking/page.js:199` — `✓ Alert Sent!` → "Alert Sent"
- `signup/expert/page.js:162` — `✓ ${label}` → `${i+1}. ${label}`
- `components/VerifiedBadge.js:32` — ✓ span removed (badge still labeled "Verified"/"Expert")
- `signup/page.js:179` — "Passwords match ✓" → "Passwords match"
- `signup/pick-username/page.js:145` — `{s === 1 ? '✓' : s}` → `{s}`
- `signup/pick-username/page.js:183-184` — ✓/✗ input indicators removed (existing below-input text already shows state)
- `components/CommentRow.jsx:110` — 📌 Pinned → "Pinned as Article Context"
- `components/CommentRow.jsx:174, 178` — ▲/▼ vote arrows → "Up"/"Down"
- `components/CommentRow.jsx:217` — ⚡ → "Supervisor flag"
- `components/TTSButton.jsx:53, 56` — ▶︎/❚❚ → "Listen"/"Resume"/"Pause"
- `admin/webhooks/page.js:13-17` — icon properties removed (5 icons), 2 render sites updated
- `admin/users/page.js:303` — ⚑ → "Suspicious"
- `components/ArticleQuiz.jsx:252` — ✓/✗ → "Correct"/"Incorrect"
- `bookmarks/page.js:227` — 🔖 icon removed
- `forgot-password/page.js:87, 118` — 🔒 and 📧 icons removed
- `reset-password/page.js:129` — ✓/○ span dropped (label color indicates state)
- `reset-password/page.js:150` — ✓ removed
- `profile/family/page.js:57` — 🔥 → "Streak"
- `profile/settings/billing/page.js:363, 369` — ✓/✕ → "Yes"/"No"
- `profile/settings/password/page.js:203` — ✓ span dropped (circle bg color indicates state)
- `admin/story-manager/page.js:492` — &#9889; (lightning) removed
- `admin/story-manager/page.js:548` — ●/○ unicode circles dropped
- `admin/pipeline/page.js:405`, `admin/support/page.js:87`, `admin/users/page.js:350/376/411` — ▲/▼ chevrons → "Hide"/"Show"

### B. Old tier names fixed (7 sites)
- `LockModal.jsx:44` — "available on Premium." → "available on paid plans."
- `profile/page.js:570` — "Upgrade to Premium" → "Upgrade your plan"
- `admin/support/page.js:47` — "Premium / Expert / Family users" → "paid users / Experts"
- `admin/features/page.js:114` — "Recovery enabled (Premium)" → "(paid)"
- `admin/cohorts/page.js:21` — dropdown now lists all 5 v2 tiers
- `admin/plans/page.js:254` — comment updated
- `admin/users/page.js:150` — plan prompt updated to v2 tier DB values
- `terms/page.js:43, 45` — "premium" → "paid"
- `leaderboard/page.js:331` — comment updated

### C. Cut features removed
- `profile/settings/emails/page.js` — deleted `weeklyDigest` and `storyAlerts` (category alerts) toggles and defaults
- `admin/features/page.js` — removed entire Morning Digest group (lines 446-453)
- `admin/features/page.js:609` — removed `flag_digest` toggle
- `admin/features/page.js:219` — "Upvotes to promote to Community Note" → "Article Context pinning threshold (upvotes)"
- `admin/features/page.js:218` — "per story per 24h" → "per article per 24h"
- `admin/notifications/page.js` — removed Morning Digest config row (old lines 365-377); fixed 4 "breaking stories" → "articles" mentions in seed config
- `admin/roles/page.js:87` — removed `page.notes` ("Community Notes") permission row
- `site/src/app/api/email/send-digest/route.js` — deleted entire file

### D. "Story" → "Article" across UI and admin copy
User-facing:
- `story/[slug]/error.js, loading.js, layout.js` — all "story" mentions → "article"
- `story/[slug]/page.js` — tab label 'Story' → 'Article' (3 places); "Story not found" → "Article not found"; "Report this story" (×2) → "Report this article"
- `bookmarks/page.js` — empty state and CTA buttons
- `browse/page.js` — category count and empty state
- `how-it-works/page.js:11` — description copy
- `notifications/page.js:83` — empty-state copy
- `profile/page.js` — 6 achievement descriptions, "Stories Read" stat, "Saved stories and collections" link
- `profile/[id]/page.js:149` — activity feed text
- `page.js:405` — home search placeholder
- `recap/[id]/page.js:110` — "Read the story" link label

Admin:
- `admin/page.js` — Content Pipeline group desc + 4 card titles/descs
- `admin/stories/page.js` — heading, two buttons, count label, Find New Stories
- `admin/story-manager/page.js` — "+ New/Add Article", "No articles yet", delete confirm, legend, "Open Article" button
- `admin/kids-story-manager/page.js` — same pattern
- `admin/stories/[id]/quiz/page.js` — "← All articles"
- `admin/analytics/page.js` — "Total Articles" stat, "Top Articles" tab, empty state
- `admin/breaking/page.js` — "Link to Article" label, placeholder
- `admin/plans/page.js` — 6 feature labels
- `admin/features/page.js` — section title "Article Page", 3 more feature labels, "Sponsored articles"
- `admin/reader/page.js:73` — onboarding step name
- `admin/ingest/page.js:85` — admin alert

**SQL migrations written:** none (all client-side).

**Files deleted:**
- `site/src/app/api/email/send-digest/route.js`

**No new questions.**


## Category 3: Loading/Error/Empty/Permission States — DONE

### Primary state bugs fixed
1. `/category/[id]/page.js:74-79` — Replaced bare "Loading..." text with skeleton (heading + 5 stub article cards) matching the `/leaderboard` pattern
2. `/create-post/page.js:138-139` — Converted "Go to Login" inline link to a styled button CTA on the permission-denied state
3. `/messages/page.js` — Wrapped init logic in `loadMessages()` with try/catch, added `loadError` state, rendered a proper error panel with "Try again" button that re-invokes `loadMessages()`

### Category 2 escapees (HTML-entity emojis) cleaned up
My original Unicode regex didn't match HTML entities — a second sweep caught these:

| File:Line | Entity | Fix |
|-----------|--------|-----|
| `browse/page.js:138` | `&#x1F50D;` (🔍) | span removed from search input |
| `category/[id]/page.js:86` | `&#x1F50D;` (🔍) | removed from "Category not found" state |
| `kids/page.js:349` | `&#x1F512;` (🔒) | removed from PIN modal |
| `leaderboard/page.js:377` | `&#x1F512;` (🔒) | removed; copy alone carries the message |
| `leaderboard/page.js:488` | `&#x1F512;` (🔒) | same |
| `admin/story-manager/page.js:406` | `&#8599;` (↗) | replaced with small "LINK" text label |
| `admin/categories/page.js:27, 28` | `&#9650; / &#9660;` (▲▼) | replaced with "Up"/"Down" + aria-label |
| `create-post/page.js:151` | `&#10003;` (✓) | circle kept as decorative, checkmark dropped |
| `create-post/page.js:329` | `&#10003;` (✓) | guideline bullet replaced with tiny dot div |
| `verify-email/page.js:117` | `&#10003;` (✓) | circle kept decorative, checkmark dropped; role=img changed to aria-hidden |
| `admin/kids-story-manager/page.js:477` | `&#9889;` (⚡) | lightning span removed |

**Verification:** grep for `&#x1F...`, `&#9...`, `&#10003;`, `&#8599;` — no remaining matches.

**Pages not deeply audited** (per your "skip second pass" decision): `/profile/page.js`, `/profile/settings/*`, `/profile/kids/[id]`, `/u/[username]`, `/signup/*`, `/welcome`, `/recap/[id]`, `/kids/expert-sessions/[id]` — any state issues there will surface in later categories.

**SQL migrations:** none.
**Files deleted:** none.

**No new questions.**


## Category 4: Tier Gate Correctness — DONE

### Bugs found and fixed

**Bug 1: Ask an Expert gated to Verity Pro+ instead of Verity+ (D20 mismatch)**

D20 says any paid tier (Verity, Verity Pro, Verity Family, Family XL) can @ experts. The implementation blocked Verity users from asking. Three layers:

1. **UI gate (`site/src/components/CommentThread.jsx:262`)** — `canAskExpert` array excluded `'verity'`. Changed to reuse existing `viewerIsPaid` (which uses `PAID_TIERS` set covering all 4 paid tiers).
2. **Server RPC (`ask_expert` in `014_phase6_expert_helpers.sql:290`)** — same tier check. Wrote migration `034_bugfix_ask_expert_tier.sql` to redefine the RPC with the widened tier list and updated error message.
3. **Marketing copy (`site/src/lib/plans.js`)** — the billing-page tier cards listed Ask an Expert, "See other users' Verity Scores", "Unlimited breaking-news alerts", and "Profile banner + shareable card" as Verity Pro features, and listed "Ask an Expert" / "See others' Verity Scores" in Verity's `missing` array. Per D20, D5/D7, D14, and D32 these are all Verity+ features. Moved them into Verity's `features` array; trimmed Verity Pro down to what's genuinely unique (ad-free + streak freezes + priority support + inheritance via "Everything in Verity"). Verity's `missing` now correctly shows just streak freezes, complete ad-free, and kid profiles.

**Bug 2: Admin label mismatch on streak recovery**

`site/src/app/admin/features/page.js:114` was changed to "(paid)" in Category 2 but that's too broad. Per D19, streak recovery is Verity Pro only (Verity does NOT get streak freezes). Changed label to "Recovery enabled (Verity Pro+)".

### Features verified OK (no change needed)
- DMs gate (D11): `messages/page.js` — `dmLocked === 'free'` banner + PermissionGate for all 4 paid tiers
- Follows (D28): `FollowButton.jsx` — `PAID_TIERS.has(viewerTier)`
- @mentions (D21): `CommentComposer.jsx` — `isPaid` via PAID_TIERS; strips for free, allows all paid
- Advanced search (D26): `search/page.js` — `PAID_TIERS.has(userTier)` hides filters; server ignores free-user filters
- Text-to-speech (D17): gated at `story/[slug]/page.js:416`
- Weekly recap (D36): `api/recap/route.js` gates to paid
- Bookmark collections (D13): `bookmarks/page.js` uses `isPaid` correctly
- Profile card (D32): `u/[username]/page.js` uses `viewerIsPaid`
- Category + subcategory leaderboards (D31): `leaderboard/page.js:233, 332` uses paid check
- Kid profile max count (D34): `profile/kids/page.js:56` — `family=2, family_xl=4`
- Family features (D24): family endpoints under `api/family/*` scoped via RPCs
- Kid undiscoverability (D12): kid_profiles is a separate table, no joins into user search/leaderboards/suggestions
- Reporting + blocking (D39): no tier gate; verified-email-only check
- Ad hidden_for_tiers (D23): defaults to `['verity_pro', 'verity_family', 'verity_family_xl']` — Verity still sees light ads, Verity Pro+ ad-free. Correct.
- Quiz attempt cap (D1): `ArticleQuiz.jsx:42` — paid = all 4 tiers, unlimited retries. Correct.
- Viewer category score display on comments (D7): `CommentRow.jsx:119` uses `viewerIsPaid` (all paid). Correct.
- Kid trial (D44): one-per-account tracked in user row, converts via billing_change_plan. RPCs in place.
- Cancellation DM revocation (D40): enforced in `user_has_dm_access` + `dmLocked='grace'/'frozen'` UI state.

### SQL migrations written
- `034_bugfix_ask_expert_tier.sql` — redefines `ask_expert` RPC to accept all paid tiers (adds `'verity'` to the allowed list, updates error message).

### No new questions.


## Category 5: UI Consistency and Polish — DONE

Audit scope: `site/src/app/` (user-facing pages only) + `site/src/components/`. Admin/dev/api routes skipped.

### Verified OK
- **Bottom nav overlap:** `NavWrapper.js:118` already applies `paddingBottom: 68` (or 104 when admin bar present) to its wrapper div, so no page loses content behind the fixed nav.
- **Z-index stack:** correctly layered — content (10–50) < sticky headers (100–200) < modals (1000) < admin bar (10000) < bottom nav (9999). No conflicts.
- **Mobile edge-padding:** user-facing pages uniformly use 16px side padding inside `maxWidth: 720` containers. No content touching viewport edges.
- **Primary button styling:** near-universal `borderRadius: 10` + ~`padding: 12px 24px` across auth (login/signup/welcome/reset-password/forgot-password/expert-signup) and user flows (story/bookmarks/browse/profile). One outlier at `create-post` uses 8px — 2px off, not worth a code change.
- **Tap targets:** only one under 32px found — a 28×28 color-swatch button in `profile/kids/page.js:186`. It's a grid selector, so total clickable area is effectively larger; acceptable.
- **Horizontal overflow:** no non-wrapping long strings or fixed-width containers that would cause horizontal scrolling at 375px.
- **Modal z-index:** all modals (LockModal=1000, Interstitial=9998, messages picker=10000, story report/image modals=9999) sit above regular content and the header.

### Bugs found
None severe enough to warrant code changes. The app has been through an active design pass — remaining inconsistencies are stylistic, not functional.

**SQL migrations:** none. **Files changed:** none. **No new questions.**


## Category 6: Dead Code and Unused Imports — DONE

### Dead code removed (7 files)
Seven static pages had a leftover `const [_] = useState(null);` placeholder plus matching `import { useState } from 'react';` and `'use client';` directive — none of which were used. Each page renders static content only and can be a Server Component. Trimmed all three lines from each:

- `site/src/app/accessibility/page.js`
- `site/src/app/privacy/page.js`
- `site/src/app/terms/page.js`
- `site/src/app/cookies/page.js`
- `site/src/app/dmca/page.js`
- `site/src/app/how-it-works/page.js`
- `site/src/app/status/page.js`

Each file is now a pure static Server Component, which also improves initial-load performance.

### Verified clean
- **console.log** — zero in `site/src/app/` (grep returned no matches). One in `components/Toast.js` is a legitimate fallback when the ToastProvider isn't mounted.
- **v1 leftovers** — grep for `verity_tier`, `average_rating`, `credibility_rating`, `reaction_count`, `REACTION_TYPES`, `toggleReaction`, `community_notes`, `communityNote`, `handleAskExpert` all clean. One `scroll_depth` hit in `admin/features/page.js:79` is a config-setting key (`read_scroll_depth_pct`), not a reference to the removed `reading_log.scroll_depth` column.
- Phase 13 already deleted the major v1 artifacts (reactions UI, admin/notes/, admin/credibility/, REACTION_TYPES, toggleReaction, handleAskExpert).

**SQL migrations:** none. **No new questions.**


## Category 7: API Route Issues — DONE

### Bugs fixed

**1. Silent error swallowing — `api/account/onboarding/route.js`**
The `service.from('users').update(...)` call discarded its error. If the DB write failed (constraint, permission), the route would still return `{ ok: true }`. Destructured `{ error }` and now returns 500 on failure.

**2. Wrong HTTP status code — `api/admin/settings/invalidate/route.js`**
Single try/catch wrapped both `requireRole` (auth failure) and `clearSettingsCache` (execution failure), returning 500 for both. Split into two blocks: auth failure now returns 403, internal failure returns 500. Matches monitoring conventions.

**3. Missing v2LiveGuard on 3 high-traffic write routes** (Phase Log flagged this as a rollout blocker)
Added `const blocked = await v2LiveGuard(); if (blocked) return blocked;` at the top of each POST handler:
- `api/comments/[id]/report/route.js`
- `api/expert/ask/route.js`
- `api/recap/[id]/submit/route.js`

Plus the routes that already had it (comments POST, vote, context-tag, quiz/start, quiz/submit, bookmarks POST, notifications, stories/read) — those verified correct and unchanged.

### Verified OK
- **Auth checks:** every protected route uses `requireAuth()` (or `requireRole()` for admin routes) before the DB write; whitelisted unauth routes (auth callback, stripe webhook, ads serve/impression/click, search, health) intentional per design.
- **v1 plan strings in tier logic:** grep clean — all tier comparisons use v2 enum values (`verity`, `verity_pro`, `verity_family`, `verity_family_xl`).
- **Stripe webhook signature:** `api/stripe/webhook/route.js` uses HMAC-SHA256 verify + 5-min replay guard + idempotent on `webhook_log.event_id` (Phase 12).

### Not fixed (intentional)
- **Inconsistent JSON-response shapes across POST routes** (`{ id }` vs `{ comment: ..., scoring: ... }` vs `{ ok: true }`): normalizing these would require UI caller updates across several files. The shapes work; standardizing is a refactor, not a bug.

### Routes to consider for v2LiveGuard later (not launch-blocking)
- Stripe checkout/portal — intentionally omitted; payment flow has its own gatekeeping
- `api/notifications/preferences` — low traffic, skip

**SQL migrations:** none. **No new questions.**


## Category 8: Database Query Issues — DONE

### Bugs fixed

**1. `.single()` that would throw when no row exists (8 sites)**

Each of these queries is followed by a null-check (`if (!ticket ...)`, `if (byId) ... else`, etc.), meaning the code explicitly expects "no row" as a valid outcome. But `.single()` throws an error when 0 rows are returned — the null-check never runs and the route raises an unhandled exception. Swapped to `.maybeSingle()`:

- `api/ai/generate/route.js:29` — article lookup by id
- `api/stories/read/route.js:35` — optional is_kids_safe check
- `api/support/[id]/messages/route.js:14` (GET ticket ownership)
- `api/support/[id]/messages/route.js:45` (POST ticket ownership)
- `profile/[id]/page.js:50` — user-by-id lookup
- `profile/[id]/page.js:59` — user-by-username fallback lookup
- `profile/kids/me/page.js:41` — scoped kid profile lookup
- `profile/page.js:208` — self user fetch

**2. Missing `.limit()` on unbounded admin lists (4 sites)**

Added `.limit(500)` as defensive bound. Admin tables currently small, but unbounded `.select('*').order()` is a latent OOM risk as tables grow and risk is free to prevent:

- `api/admin/sponsors/route.js:8`
- `api/admin/ad-campaigns/route.js:8`
- `api/admin/ad-placements/route.js:8`
- `api/admin/ad-units/route.js:11`

### Verified OK
- **N+1 loop patterns** — none found; queries that need multi-id fetches already use `.in('id', ids)` (e.g., `CommentThread`, `profile/family`).
- **Over-fetching `select('*')`** — hot paths (home feed, article, comments, search) all use explicit column lists. The remaining `select('*')` calls are on admin routes operating on small result sets and inherently benefit from returning full rows for admin UI.

**SQL migrations:** none. **No new questions.**


## Category 9: Security Quick Scan — DONE

### Bugs fixed

**1. PostgREST filter injection in `/api/search` (real vuln, moderate impact)**

User input for `q` was interpolated directly into a `.or('title.ilike.%${q}%,excerpt.ilike.%${q}%,body.ilike.%${q}%')` filter string. Because `.or()` takes a comma-separated filter list, a `q` containing `,` or `.` (etc.) could inject additional filter clauses. `source` had the same issue in its `.ilike('publisher', '%${source}%')`.

Blast radius was limited — the outer `.eq('status','published')` still applied, and articles are public — but attackers could still alter the filter semantics. Fix: added a `sanitizeIlikeTerm()` helper that strips `, . % * ( ) " \` from user input before interpolation. Applied to both `q` and `source`. Also bounded the `sources` sub-query with `.limit(500)`.

**2. Kid PIN set/reset — argument-order bug broke the feature (functional, not security)**

`api/kids/set-pin/route.js:36` and `api/kids/reset-pin/route.js:29` were calling `assertKidOwnership(supabase, user.id, kid_profile_id)` but the helper signature is `(kidProfileId, client)`. The first arg (supabase client object) was being treated as the kid ID, so the ownership check always failed-closed and 500'd — meaning no parent could set or reset a PIN. Fail-closed, so NOT a vulnerability, but it broke the feature entirely.

Fix: swapped argument order to `assertKidOwnership(kid_profile_id, supabase)` on both routes. The initial scan report mischaracterized this as an IDOR risk; in reality it was a feature-killing bug that would have shown up immediately in testing.

### Verified OK
- **Stripe webhook signature check** (`api/stripe/webhook/route.js`): HMAC-SHA256 verify on every request, 5-min replay guard, webhook secret from env, idempotent on `webhook_log.event_id`. No bypass path.
- **Service-role usage**: every `createServiceClient()` call is preceded by either `requireAuth()`, `requireRole()`, or is an explicitly unauth route per design (ads, stripe webhook, search, health).
- **Kid profile discoverability (D12)**: no queries surface `kid_profiles` through user search, follows, leaderboards, messages. The kid expert-sessions POST handler correctly checks parent ownership before inserting questions (`kid.parent_user_id !== user.id`).
- **Ad click endpoint (no auth)**: intentional per Phase 10 D23 design — ads are anonymous-friendly. RPC-level validation handles impression ownership.
- **IDOR spot-checks**: `/api/bookmarks/[id]`, `/api/kids/[id]`, `/api/support/[id]/messages`, `/api/conversations` all scope by `user.id` or verify ownership before the write/read.

**SQL migrations:** none. **No new questions.**


## Category 10: Realtime Subscription Issues — DONE

Only one Supabase realtime subscription exists in the codebase: `components/CommentThread.jsx:119-158`. All verified OK:

- **Filter syntax**: `article_id=eq.${articleId}` — correct PostgREST filter form for `postgres_changes`.
- **Cleanup on unmount**: `return () => { supabase.removeChannel(channel); }` — proper teardown.
- **React Strict Mode double-mount guard**: channel name includes `Date.now() + random suffix`, so the double-mount invocations don't collide on the same channel name. This was fixed in Phase 5 per Phase Log.
- **Dependency array**: `[articleId]` — subscription correctly re-established when article changes.
- **Both handlers (INSERT + UPDATE)** registered on the same channel before `.subscribe()` — correct order.

No other realtime subscriptions exist. `verify-email/page.js:62` uses `subscription.unsubscribe()` on an `onAuthStateChange` listener (not a Supabase realtime channel — that's the auth listener). `PermissionsProvider.jsx:48` same pattern. Both handled correctly.

**SQL migrations:** none. **No code changes.** **No new questions.**

---

## Bug-Hunt Pass Complete

All 10 categories closed. Summary:

| Category | Bugs Fixed | SQL Migrations |
|---|---|---|
| 1. PostgREST embed ambiguity | 6 | — |
| 2. User-facing copy | 50+ | — |
| 3. Loading/error/empty states | 14 | — |
| 4. Tier gate correctness | 2 | `034_bugfix_ask_expert_tier.sql` |
| 5. UI consistency | 0 (all verified OK) | — |
| 6. Dead code / unused imports | 7 | — |
| 7. API route issues | 5 | — |
| 8. DB query issues | 12 | — |
| 9. Security quick scan | 2 | — |
| 10. Realtime subscriptions | 0 (already correct) | — |

**Files deleted:** `site/src/app/api/email/send-digest/route.js`
**SQL migrations to apply in Supabase:** `034_bugfix_ask_expert_tier.sql`

