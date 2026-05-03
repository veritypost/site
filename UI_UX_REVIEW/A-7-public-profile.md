# Unit 7 — Public profile + card (`/u/[username]`, `/card/[username]`)

**Surface(s):** `web/src/app/u/[username]/page.tsx` (766 lines), `web/src/app/u/[username]/layout.js`, `web/src/app/card/[username]/page.js` (295 lines), `web/src/app/card/[username]/layout.js`, `web/src/app/card/[username]/opengraph-image.js` (200 lines), `web/src/app/profile/card/page.js` (136 lines), `web/src/app/profile/[id]/page.tsx`, `web/src/components/FollowButton.tsx`, `web/src/lib/scoreTiers.ts`, `web/src/lib/reportReasons.js`, `web/src/app/api/users/[id]/block/route.js`, `web/src/app/api/reports/route.js`
**Status:** findings (awaiting owner adjudication on Q1 before Slice 15 can open)
**Date:** 2026-05-02
**Note on kill-switch:** INDEX previously labelled this "(KILL-SWITCHED — chrome only)". `PUBLIC_PROFILE_ENABLED` is currently `true` — surface is live. Full review applied.
**Anchor:** Review complete. 3 independent reviewers merged. 45 findings logged (25 crit, 19 polish, 1 data). Owner-decision Q1 (show_activity on shareable card) panel returned 2-1 divergent — surfaced for adjudication. 2 decisions auto-locked (#059 private profile page, #061 card noindex). Elevated-care items: F01 (CSAM escalation), F15 (targetType injection), F16 (wrong permission for reports) — adversary pass required for Slice 15.

---

## ⚠️ STOP FOR OWNER ADJUDICATION — Q1

**Q1: Does `show_activity=false` suppress stats on the shareable card (`/card/[username]`)?**

Background: Users can set `show_activity=false` to hide their stats on their public profile. The shareable card at `/card/[username]` is an opt-in, paid (`profile.card_share`) surface that always shows `verity_score` and `streak_current` regardless of `show_activity`. Currently the card does not check the setting at all.

Three domain experts polled:

| Expert | Verdict | Key argument |
|--------|---------|--------------|
| Product UX | **Exempt** | Card is a deliberate, gated, paid act of self-disclosure. `show_activity=false` means "don't surface stats passively"; a link you actively share is different intent. |
| Product consistency | **Exempt** | Card is a separate surface with its own visibility model. A user who pays for card-share and distributes the link has overridden the passive privacy toggle. |
| Privacy | **Respect it — warn at generation** | `show_activity=false` is a blanket privacy baseline. Opt-in sharing ≠ specific consent to override it. Correct UX: warn at card-generation time if `show_activity=false`, let user flip it, default to suppression if they don't. |

**Panel: 2-1 divergent. Owner must choose:**

- **(A) Exempt** — card always shows stats; `show_activity` applies only to the passive public profile. No code change needed for this finding (F21 → wontfix).
- **(B) Respect + warn** — if `show_activity=false` when user generates/views their card link in `/profile/card`, show a one-line warning: "Your activity is hidden — stats won't show on your card. [Update privacy settings]." Card page itself still suppresses stats when `show_activity=false`. Closes F21.
- **(C) Suppress silently** — card respects `show_activity=false` with no explanation. Closes F21 but creates confusing blank card for paid users who forgot the setting.

**Reply A / B / C to unlock Slice 15.**

---

## Auto-locked decisions

**DECISION #059 — Private profile shows "This profile is private" (not 404) (auto-locked)**
Current code returns `notFound()` for private/hidden profiles viewed by non-self authenticated users (page.tsx:201). PRINCIPLE §3.2 + industry standard (Twitter, LinkedIn, Instagram) require a "This profile is private" page rather than a 404. The 404 gives no signal that the account exists but is private. The "private" page also prevents users from assuming a typo.
**Apply (F05):** Replace `notFound()` at line 201 with a rendered "This profile is private" state (heading, one-line explanation, "Browse Verity Post →" CTA). Keep `notFound()` only for genuinely non-existent usernames. The layout's `generateMetadata` should return `{ robots: 'noindex,nofollow' }` for private profiles.

**DECISION #061 — `/card/[username]` robots: noindex,nofollow is intentional (auto-locked)**
The card layout sets `robots: noindex,nofollow`. This is correct — the card is designed for social sharing via OG image/link preview (Twitter, iMessage), not for Google indexing. A card appearing in search results would be surprising and expose user stats to search crawlers. The noindex is intentional.
**Apply:** Do not change card robots meta. Finding from edge-cases reviewer is wontfix.

---

## Findings

### Elevated-care — Legal / Security

**F01** [crit] `/api/reports/route.js:91` — CSAM/child-exploitation/grooming reports set `is_escalated=true` and call `captureMessage()` (Sentry) as the only human-paging mechanism. `captureMessage` is a silent no-op when `SENTRY_DSN` is not configured. If Sentry is absent from production environment, urgent §2258A-triggering reports land in the DB with no human alerted. A comment in `reportReasons.js:8` says "a human is paged" — that comment is false when Sentry is unconfigured. Fix: add a non-Sentry fallback escalation path for `is_escalated=true` reports — at minimum, insert a row into an `admin_alerts` table and trigger an email via the existing email service to a configured `ESCALATION_EMAIL` env var. **Requires adversary pass in Slice 15.**

### Critical — Auth / Permissions

**F02** [crit] `page.tsx:211` — Reverse-block (target has blocked the viewer) is never queried. The page fetches only `blocker_id = viewer, blocked_id = target` (the viewer's own block). A viewer blocked by the target sees the full profile, Follow button, and DM link unchanged — the target's block has no UX effect. Fix: extend the `blocked_users` query to an OR query covering both directions; if either direction returns a row, treat the profile as restricted and hide action buttons.

**F03** [crit] `page.tsx:494` — When `blocked === true` (viewer has blocked target), the DM link (`canSendDm && ...`) still renders. There is no `!blocked` guard on the `canSendDm` branch. Fix: add `&& !blocked` to the DM condition.

**F04** [crit] `page.tsx:142` — The main data-fetch IIFE has no try/catch. A thrown exception (network error, `refreshAllPermissions` failure) leaves `loading=true` forever — the page is stuck on the loading state with no error path and no recovery affordance (PRINCIPLE §3.3). Fix: wrap the IIFE in try/catch; on catch, call `setError(true)` and render an `<ErrorState>` with a Retry button.

**F05** [crit] `page.tsx:201` — Private/hidden profile returns `notFound()` for non-self authenticated viewers. Auto-locked by DECISION #059: replace with a "This profile is private" rendered state. See DECISION #059 above for exact fix.

**F06** [crit] `page.tsx:606` — `show_activity !== false` gate applies uniformly, including to self-view. If a profile owner sets `show_activity=false` and then visits their own public profile, they see their stats hidden — no way to verify what others see. Fix: bypass the gate for `me.id === target.id`; show stats on self-view regardless. DECISION #025 allows stats on the owner's own profile.

**F07** [crit] `page.tsx:234` — Followers/following tab refetch (triggered on tab switch) has no try/catch and no loading indicator. On network error the list silently stays empty with only a `console.error` — no user-visible error message, no retry CTA (PRINCIPLE §3.3). Fix: wrap in try/catch; show a retry link on failure.

**F08** [crit] `FollowButton.tsx:41` — `FollowButton` returns `null` when `!permsReady || !canFollow`. During the permissions-fetch window (100–300ms), the button is fully absent — creates a jarring layout shift when it pops in (PRINCIPLE §3.1). Fix: render a disabled skeleton button (opacity 0.4, `pointer-events: none`) while `!permsReady`, then swap to real state once resolved.

**F09** [crit] `page.tsx:655` — Followers/Following tab buttons missing `role="tab"`, `aria-selected`, and wrapping `role="tablist"`. Screen-reader users cannot determine which tab is active or navigate between them (WCAG 4.1.2). Fix: `<div role="tablist">` wrapper; `role="tab"` + `aria-selected={activeTab === 'followers' || ...}` on each button.

**F10** [crit] `page.tsx:634` — Copy-card-link `onClick` calls `navigator.clipboard?.writeText(...)` but fires `toast.success` unconditionally — there is no `await` and no error branch. If clipboard is unavailable (HTTP, Firefox without permission), the toast says "Link copied" but nothing was copied. Fix: `try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Copy failed — paste the URL manually.'); }`.

**F11** [crit] `card/page.js:91` — `/card/[username]` `copyLink` catches the clipboard error but still calls `setCopied(true)` in the catch block, then resets after 2s. Fix: same as F10 — only set `copied=true` on success; set a `copyFailed` state on catch with distinct copy ("Couldn't copy — try selecting the URL manually").

**F12** [crit] `page.tsx:476` — Frozen viewer receives the full action bar (Follow, DM, Block, Report) with no account-status awareness. A frozen account should not be able to follow, DM, or file reports. Fix: add a `frozen_at` check to the viewer's me-row fetch; if `frozen_at IS NOT NULL`, hide Follow/DM/Report buttons; Block still permissible (defensive action).

**F13** [crit] `page.tsx:511` — Block and Report buttons are rendered for any authed non-self viewer with no client-side permission check. The comment reads "API enforces the permission" — but the UI shows enabled buttons to users who will receive a 403 on click. Fix: gate Block on `hasPermission('settings.privacy.blocked_users.manage')`; gate Report on `hasPermission('profile.report')` (or `article.report` if that's the correct key — see F16).

**F14** [crit] `page.tsx:139` — `reportReason` state is initialized to `'spam'` but `PROFILE_REPORT_REASONS[0]` is `'csam'` (the intent per the T278 comment is for the urgent trio to appear first). A reporter who submits without changing the dropdown files a spam report instead of a CSAM report. Fix: initialize `reportReason` to `PROFILE_REPORT_REASONS[0].value` (i.e., `'csam'`).

**F15** [crit] `api/reports/route.js:31` — `targetType` is accepted from the request body with no allowlist validation. Any authenticated user with the report permission can submit `targetType: 'admin_audit_log'` or any internal table name — polluting the reports queue. Fix: `if (!['article', 'comment', 'user'].includes(targetType)) return NextResponse.json({ error: 'Invalid target type' }, { status: 400 })`. **Requires adversary pass in Slice 15.**

**F16** [crit] `api/reports/route.js:14` — The reports route gates all report types (including `targetType: 'user'`) on `article.report` permission. A user without `article.report` (wrong domain) cannot file a profile abuse or CSAM report. Fix: introduce a `profile.report` permission for user reports, OR expand the gate to `article.report || profile.report` with a fallback while the new perm is rolled out. **Requires adversary pass in Slice 15.**

**F17** [crit] `page.tsx` (entire file) — DECISION #020 requires that an Owner Mode holder sees a subtle "Owner Mode: ON" label on their own profile/settings page. No such label exists anywhere in the profile page (confirmed by grep — zero occurrences of "Owner Mode" or `isOwnerMode` rendering in `/u/[username]`). Fix: in the self-view section (`me.id === target.id`), check `hasPermission('admin.owner_mode')`; if true, render a small inline `"Owner Mode"` label near the username.

**F18** [crit] `page.tsx:189` — Username lookup uses `.eq('username', username)` with no case normalization. The DB unique index is on `lower(username)` — `/u/Alice` 404s when the stored username is `alice`. Fix: normalize input before query: `username.toLowerCase()`.

**F19** [crit] `card/page.js:53`, `card/layout.js:14`, `opengraph-image.js:28` — Same case-sensitivity gap: all three use `.eq('username', username)` without lowercasing. A shared card link with the wrong case renders "No user found" / brand plate instead of the real card. Fix: `.eq('username', username.toLowerCase())` in all three files.

**F20** [crit] `profile/[id]/page.tsx:14` — When `public_profiles_v` returns a row with `username: null` (user exists but has not yet set a username), the code calls `notFound()` — the real user is unreachable by numeric ID. Fix: redirect to a `/profile` or `/u/` URL that handles the no-username state, or show a "Profile not available" page instead of 404.

**F21** [crit] `card/page.js:207`, `opengraph-image.js:156` — `show_activity` is not checked on the card page or OG image. A user who opted out of activity display still has their `verity_score` and `streak_current` published on the publicly-accessible shareable card. Pending DECISION #060 (Q1): owner answer determines fix recipe. **Blocked on Q1.**

**F22** [crit] `page.tsx:226` — Block action calls the `/api/users/[id]/block` API but there is no DB trigger or cascade removing the `follows` row (A → B). After User A blocks User B, User B's "Following" state on User A's profile stays stale until a page reload, and `follower_count` denormalized columns are out of sync. Fix: in `api/users/[id]/block/route.js`, after inserting the block row, also `DELETE FROM follows WHERE follower_id=blocked AND followee_id=blocker OR follower_id=blocker AND followee_id=blocked` to clean up both follow directions.

**F23** [crit] `page.tsx:626` — On self-view, the Verity Score is gated on `profile.score.view.other.total` — the permission for viewing *other* users' scores. A free-tier user lacking this permission cannot see their own score on their own public profile page. Fix: add `|| (me && me.id === target.id)` to the score-visibility condition.

**F24** [crit] `page.tsx:606` — The stat block (quizzes passed, comments, follower count, following count) renders for any authenticated viewer with no `profile.view.follower_count` or `profile.view.reading_stats` permission check — only `target.show_activity !== false` is checked. The permissions catalog declares these keys but they are never consulted here. Fix: gate stat block rendering on the appropriate permissions (or confirm these permissions were intentionally dropped from the stat-block gate, which should then be documented).

**F25** [crit] `profile/card/page.js:36` — When `me` query returns `null` (user row not yet materialized after signup), the state becomes `'error'` and renders "Could not load your profile. Back to profile →" with no retry and no explanation. Fix: add a "Try again" button (`onClick={() => router.refresh()}`); add copy: "Your profile is still setting up — refresh in a moment."

### Data integrity

**F26** [polish] `scoreTiers.ts:42` — Module-level in-process cache (`_cache`, `_cacheTime`) shared across all SSR requests on the same Node.js worker. If `score_tiers` table is empty on first load, `_cache = []` persists for 60 seconds — `tierFor()` returns `null` for all users during that window, hiding tier pills sitewide with no degraded-state indicator. Fix: treat an empty `_cache` result as a cache miss (don't cache empty arrays); also add a `null` fallback tier name for when `tierFor()` returns null.

### Copy / Accessibility

**F27** [polish] `page.tsx:494` — When `canSendDm` is false, the DM button is simply absent with no explanation or upgrade CTA (PRINCIPLE §3.2). Fix: render a disabled "Message" button with a tooltip/label: "Messaging is a Verity Plus feature." + inline link to `/pricing`.

**F28** [polish] `page.tsx:695` — `UserList` empty state text is "Nobody here." — colloquial placeholder. Fix: branch by list type: "No followers yet." / "Not following anyone yet."

**F29** [polish] `page.tsx:469` — Expert badge visibility is gated on `canSeeExpert` which requires `profile.expert.badge.view`. On self-view, an expert who lacks that permission cannot see their own badge on their own public profile. Fix: add `|| (me && me.id === target.id && targetRow.is_expert)` to the expert-badge condition.

**F30** [polish] `page.tsx:300` — Anon CTA copy says "Profiles show reading history, Verity Score, comments, and more." Reading history is not displayed on authenticated profile views; Verity Score is permission-gated. The copy overpromises. Fix: "Profiles show Verity Scores, achievements, and more."

**F31** [polish] `page.tsx:466` — `@{target.username}` is rendered unguarded in three places (username display row, report header, block dialog title). If `target.username` is null (possible per the `string | null` type), these render as `@null`. Fix: `@{target.username ?? '[no username]'}` or guard earlier when username is null.

**F32** [polish] `page.tsx:638` — Share card link constructs `href="/card/${target.username}"` with no null guard. When `target.username` is null, produces `href="/card/null"` — a malformed live link. Fix: don't render the share link block when `!target.username`.

**F33** [polish] `opengraph-image.js:26` — OG image generator never fetches `avatar_url` — renders letter-initial avatar only. The card page (`page.js:154`) renders the real avatar photo if present. OG preview and card page show different avatars for users with uploaded photos. Fix: fetch `avatar_url` from `public_profiles_v`; in the image generator, render `<img src={avatar_url}>` when present instead of the letter tile.

**F34** [polish] `profile/card/page.js:72` — Copy reads "Shareable profile cards are available on paid plans." The word "available" implies future delivery — a DECISION #003 violation. Fix: "Shareable profile cards are a Verity Plus feature." (describes present state).

**F35** [polish] `card/page.js:97` — `not_found` state renders `<div>No user found.</div>` with no `<h1>`, no `<main>`, and no recovery link. `private` state is the same. Both are dead-end pages (PRINCIPLE §3.2, WCAG 1.3.1). Fix: add `<h1>` + a "Browse Verity Post →" link at minimum.

**F36** [polish] `reportReasons.js:55` — `PROFILE_REPORT_REASONS` uses `value: 'hate'` while `ARTICLE_REPORT_REASONS` uses `value: 'hate_speech'` for the same concept. Both pass `assertReportReason()` validation but appear as different categories in the admin moderation queue. Fix: normalize to `'hate_speech'` across all reason arrays.

### Dark mode / Tokens (sweep candidate additions)

The following findings all share the pattern of hardcoded hex colors that fail dark mode (PRINCIPLE §1.1). They increment the `dark-mode-token-sweep` candidate to Unit 7 (count now: 3 units — Units 2, 3, 7).

**F37** [polish] `page.tsx:260` — Loading state `color: '#666'` hardcoded; no skeleton. Fix: `color: var(--dim)` + skeleton rows.

**F38** [polish] `page.tsx:533` — Report picker panel: `border: '1px solid #e5e5e5'`, `background: '#fafafa'`, `background: '#fff'`, `color: '#111'` — entirely hardcoded, zero dark-mode token coverage. Fix: replace with `var(--card)`, `var(--border)`, `var(--text)`.

**F39** [polish] `page.tsx:699, 610` — `UserList` + stat rows hardcoded `color: '#666'`, `background: '#f7f7f7'`, `border: '1px solid #e5e5e5'`, `color: '#111'`. Fix: token equivalents.

**F40** [polish] `page.tsx:664` — Followers/Following tab toggle inactive state: `background: '#f7f7f7'`, `color: '#666'` — invisible in dark mode. Fix: `var(--tab-inactive-bg)` / `var(--dim)`.

**F41** [polish] `page.tsx:470` — Expert badge `color: '#16a34a'` hardcoded. Fix: `var(--p-verified)` or a dedicated expert token.

**F42** [polish] `page.tsx:599` — Bio text `color: '#333'` hardcoded. Fix: `var(--text)`.

**F43** [polish] `FollowButton.tsx:76` — `background: '#111'`, `border: '1px solid #e5e5e5'`. Fix: `var(--accent)`, `var(--border)`.

**F44** [polish] `card/page.js:200` — Verity Score + Streak stat tiles `background: '#fff'`. Fix: `var(--card)`.

**F45** [polish] `profile/card/page.js:67, 102` — `color: 'var(--text-primary)'` used where rest of app uses `var(--text)` — token drift. Fix: normalize to `var(--text)`.

---

## Refuted / False alarms

- Reviewer 2 F9: Self-block / self-report concern. `showFollowControls = me && me.id !== target.id` gates both Block and Report correctly. Refuted — no finding.
- Reviewer 2 F13: `messages.send` in brief vs `messages.dm.compose` in code. The code is correct; the brief description was stale. Documentation drift only, not a product bug.
- Edge-cases F12 (`noindex` on card): Auto-locked as intentional (DECISION #061). Not a finding.

---

## Summary

| Severity | Count |
|----------|-------|
| [crit] — functional/security blocker | 25 (F01–F25) |
| [polish] — quality floor | 19 (F26–F45) |
| Elevated-care (adversary req'd) | 3 (F01, F15, F16) |
| Refuted / wontfix | 3 |
| **Total** | **44** |

---

## Decisions consumed

- DECISION #020 — Owner Mode: ON label on own profile (unimplemented — F17)
- DECISION #025 — Stats on own profile only (profile page IS the right place; no violation found for visible stats)
- DECISION #003 — No "coming soon" / future-delivery copy (F34)

## New decisions

- **DECISION #059** — Private profile shows "This profile is private" page, not 404 (auto-locked)
- **DECISION #060** — `show_activity` on shareable card (pending Q1 answer)
- **DECISION #061** — `/card/[username]` noindex is intentional (auto-locked)

---

## Slice 15 — Prerequisites and scope

**Blocked on:**
- [ ] DECISION #060 (owner Q1 answer A/B/C) — unblocks F21 recipe

**Elevated-care items requiring adversary pass:**
- F01: CSAM escalation path (legal — 18 U.S.C. § 2258A)
- F15: `targetType` injection in reports API (security)
- F16: Wrong permission domain for user reports (security)

**Slice scope:** All 44 findings. Prereqs: Slices 1 + 2 (Foundation) shipped.
