# UI Peer Audit #3 — Verity Post
Date: 2026-04-19
Focus: engagement + user journey + accessibility

## Severity rubric

- P0 — Breaks the product for a class of users (keyboard-only, screen reader, reduced-motion, low-vision, Dynamic Type). Or breaks a revenue/retention moment so badly a normal user cannot complete it.
- P1 — Makes a core task (sign up, read, quiz, comment, save, upgrade) noticeably harder than it needs to be. No hard blocker, but a measurable conversion or retention tax.
- P2 — Quality / polish. Inconsistent feedback, missing skeleton, ugly empty state, off-tempo copy. No conversion impact on its own but cumulative.
- P3 — Nits. Spacing, microcopy, animation curves.

## Top issues (ranked)

| # | Severity | Surface | Issue | User type affected |
|---|---|---|---|---|
| 1 | P0 | iOS app (all 38 .swift views) | Zero `.accessibilityLabel`, `.accessibilityHint`, `.dynamicTypeSize` modifiers; all fonts hardcoded to `.system(size: …)` so text ignores user's Dynamic Type size; VoiceOver is reading raw view hierarchy with no curation. | VoiceOver users, low-vision users, anyone on large text |
| 2 | P0 | Every web page | Every page renders the same `<title>Verity Post — Read. Prove it. Discuss.</title>`. Tab titles never change across /login, /signup, /notifications, /bookmarks, /leaderboard, /profile, /messages, /story/[slug]. Browser history, tab switching, and SR page announcements are all broken. | All web users, esp. SR + tab-heavy users |
| 3 | P0 | Bottom nav (web + iOS) | 4 tabs: Home / Notifications / Leaderboard / Profile. No Search, no Bookmarks, no Messages, no Browse. Search is a small icon in the top-right, only visible when logged in. Bookmarks has no entry point outside of tapping from a story. Messages is reachable only via direct URL. | All signed-in users |
| 4 | P0 | /story/[slug] registration wall modal | The "Sign up to keep reading" modal has `role="dialog"` but no focus trap, no Escape handler, no `.dismiss on backdrop click`. The visible Close button exists, but no keyboard path. Contrast with /login's password toggle that DOES handle aria-pressed. | Keyboard + SR users |
| 5 | P1 | /signup form | Labels on Full name / Email / Password / Confirm have no `htmlFor` / id — clicking label does NOT focus input. /login's form DOES do this. Regression within the same auth cluster. Also: error div is not `role="alert"` (unlike /login). | SR users, motor-impaired users |
| 6 | P1 | /welcome onboarding carousel | 3 slides with Back + Next + Skip buttons. Memory says user hates submit-stack onboarding and wants click-to-advance. No keyboard navigation (Left/Right arrows). No progress dots are aria-labeled. `Welcome to Verity Post \| 1 of 3` is decorative text, not an actual `<nav aria-label>` landmark. | New users |
| 7 | P1 | Onboarding path inconsistency | `signup/pick-username` shows "Step 2 of 3" indicator, but `/signup` (step 1) and `/welcome` (step 3?) don't use the same indicator. Users don't know how long the flow is. Also: pick-username offers a "Skip for now" but the next step is never mentioned. | New users |
| 8 | P1 | /profile/settings (3,761-line single page) | Settings is one giant scroll with 12 sections. Search filter is documented in code but no visible "search settings" affordance above the fold. No URL-hash per section that auto-scrolls. Re-finding "Change password" or "Cancel subscription" is a linear scroll. | All users, esp. returning |
| 9 | P1 | /bookmarks loading state | `Loading bookmarks…` as plain centered text. Every other authed page (/notifications uses skeleton rows) does it differently. Inconsistent loading vocabulary across app. | All users |
| 10 | P1 | Breaking-news banner | Renders a permission-gated banner with `BREAKING` badge + truncated title, but is NOT a link. User reads "BREAKING: X" and cannot click through. Dead-end engagement moment. | All users |
| 11 | P1 | Home feed category pills | Horizontal scroll with `scrollbar-width: none` and NO visual overflow indicator. Users don't know Sports/Finance/Culture exist past "Technology" on a 375px viewport. No left/right chevron, no gradient fade, no aria-roledescription="carousel". | Mobile users |
| 12 | P1 | /story/[slug] article body gate | When `canViewBody` is false, signed-in users see "Upgrade to read this article — Your current plan does not include full article access." This is the paywall. But the title and excerpt render above, so the "value proposition" above the CTA is just the article teaser. No mention of what the plan unlocks (no ads, TTS, bookmarks, DMs). | Free readers at paywall |
| 13 | P1 | /verify-email change-email flow | "Use a different account" link is `/logout` — not framed as "I typed the wrong email; let me change it and keep progress." Currently a cliff: user logs out, loses session, has to restart signup. | New users typo'd email |
| 14 | P1 | /login locked-out messaging | On 5+ failed attempts the error says "Too many failed attempts. Try again after [time]." No link to password reset inline with the lockout message — users have to find "Forgot password?" separately. | Users in panic-typing mode |
| 15 | P2 | iOS LoginView | Error state renders as a `Text` above the button with no `accessibilityLabel` or announcement. VoiceOver won't call it out. No `announce(for:)` bridge to post to `accessibilityNotification`. | VoiceOver users |
| 16 | P2 | Search overlay (home page) | Opens as a dialog with `aria-modal=true`, good — but on close via Cancel button there's no return of focus to the magnifying-glass button that opened it. Keyboard + SR users lose their place. | Keyboard + SR users |
| 17 | P2 | /bookmarks delete-collection | Has `ConfirmDialog` for collection delete, but individual bookmark "Remove" on a row is a plain onClick — no confirm, no undo toast. User fat-fingers and the entry is gone. | All users |
| 18 | P2 | /notifications empty state | Text-only: "You're all caught up." / "No notifications yet…" No visual, no CTA to set preferences, no link back to home. Good copy, dead screen. | All users |
| 19 | P2 | Story-page Save (bookmark) feedback | Toggling bookmark just flips button text to "Saved". No toast confirmation, no "Collection picker" on add, no undo. Compare to /story's share: share gets a "Link copied!" toast that auto-clears. Two different patterns, same page. | All users |
| 20 | P2 | /messages compose-new-DM modal | Focus trap exists (good) but the user-search uses a `role` filter and results show `verity_score` — no indication of what that number means to a first-time user. Hover reveals nothing. | New users |
| 21 | P2 | Disabled-state copy | /signup and /login "Sign In" button disables without saying WHY (password too short? terms not checked?). Disabled state must explain itself — current UX is silent rejection. | All users |
| 22 | P2 | Color contrast `--dim` on `--card` | Comment says review recalculated at 5.95:1 (passes AA). But the widely-used `color: #666666` (hardcoded in pages BEFORE migration to tokens) still exists in /home, /login, /signup, /forgot-password. `#666` on `#f7f7f7` = ~4.47:1, under 4.5:1 AA. Same in `/bookmarks` (hardcoded). | Low-vision users |
| 23 | P2 | iOS Splash / loading | `ContentView` splash has a `ProgressView` but no accessibility announcement ("Loading"). And when `splashTimedOut` fires, the error copy with `\u{2019}` literal escape will render as a curly apostrophe, fine — but no `accessibilityLabel` for screen readers. | VoiceOver users |
| 24 | P2 | /help FAQ | List of FAQs rendered as `<h3>` inside a div, not in a `<details>/<summary>` or proper accordion. Every FAQ is open permanently, page is a 800px-tall wall. No anchor links, no in-page search. | All users |
| 25 | P2 | Feedback after report submit | /story Report modal submits and shows "Thanks — we'll review it." Then closes after 2s. No indication that report was logged against THIS article. No way to find a history of one's reports. | All users |
| 26 | P3 | Favicon / OG images | OG image is `summary` (small thumb) on Twitter, not `summary_large_image`. No per-page OG generated except `/story/[slug]/opengraph-image.js`. Share a /leaderboard URL → generic VP preview. | Users sharing links |
| 27 | P3 | Logo inside nav is a `div` | Top-bar "Verity Post" is a `<a>` with aria-label — good. But the bottom-nav VP logo badge in the home feed is a styled div with text "VP" inside, no semantic role. Decorative, but also the only branding on-screen at /home. | SR users |
| 28 | P3 | Onboarding carousel progress bars | 3 solid bars that fill but no `role="progressbar"` / `aria-valuenow`. Purely decorative. | SR users |

## Engagement findings by surface

### Home (/)
- First-5-seconds: logged-out user lands on a white nav with "VP" logo, "All" pill, and "Loading articles..." text. No hero, no tagline, no explainer. A visitor doesn't know this is a news site until the first card loads. The page `<meta description>` says "News with a quiz-gated comment section" — that line needs to be ON the page for anon users.
- Primary action clarity: for logged-out users there's no CTA above the fold. Search icon is hidden until logged in (appropriate), but then `Sign up` / `Log in` isn't surfaced in the top bar either.
- Next-action discoverability: good — click any article card, done. But the category pill row is the only filtering UI and it scrolls horizontally without any visual hint.

### /login
- Clear, confident. One-field resolve (email or username), OAuth buttons below. "Welcome back" is the right tone.
- Missing: link to /signup placement is fine at bottom. But no "Continue as guest" — which is a real option (/ works anon) yet we never tell the user.

### /signup
- 4 fields + 3 checkboxes + OAuth. Too much above the fold. Progressive disclosure would help: email first, password only after email is valid, then agree-to-terms at submit.
- "Keep me signed in on this device" is default-on. Privacy-minded users will uncheck; this is well-handled.
- "I confirm I am 13 or older" plus "I agree to Terms" as two separate checkboxes is good but takes two clicks; could be a single combined statement.

### /welcome
- 3 carousel slides. Copy is strong. But "Skip" is in the top-right corner, button color is dim gray — invisible on first scan. For users who already read the tour elsewhere (marketing site), the skip affordance must be findable in 1s.
- Auto-advance is absent. Three manual clicks to reach "Start reading" is a friction tax on retention.

### /story/[slug]
- First-5-seconds (anon user, 1st view): title → excerpt → body. Fine. Breaking / Developing badges shown if applicable. Source count in meta. Reads like a news page.
- Primary action: pass the quiz. But the quiz is BELOW the article body. An anon who doesn't scroll past the body never sees it. Consider a teaser pill at the top: "Discussion earned by passing a 5-question quiz below."
- Next-action: after reading, reader sees "You might also like — Back to home / Browse articles". That's a dead-end disguised as a CTA. A REAL next-article recommendation would drive session depth.

### /bookmarks
- Title + count + Export/New Collection buttons. Fine.
- Empty state: "No saved articles here — Browse articles" — good, but the "Browse articles" link goes to `/`, not `/browse`. Two different things in this product. Users will think "wait, there's a dedicated browse page? where?"

### /notifications
- Skeleton loading state (good — only page I saw that has one).
- Anon in-page CTA with "[!]" monospace glyph — nice, honors no-emoji rule.
- Preferences link is a subtle text button, could be more prominent given how easy it is to get notif-fatigued.

### /leaderboard
- Top Verifiers / Top Readers / Rising Stars / Weekly tabs, plus All-Time / Month / Week period pills. Seven dimensions of filtering — that's a lot for a browse page. I'd A/B whether Rising Stars + Weekly are separate tabs or subviews.

### /messages
- Composition modal has `useFocusTrap` — thank you. But only when `showSearch` is the active modal. The conversation view has no focus management when switching threads.

### /kids
- Hi, [name]! What do you want to explore today? — warm tone, correct register.
- 2-column grid of category buttons with 60px+ touch targets — good for kids.
- Subcategories rendered as pills with min-height 40px — also good.

## Conversion moments

- **Upgrade CTAs**: scattered. Story paywall says "Your current plan does not include full article access" — zero benefit copy. Bookmarks cap banner says "Unlimited bookmarks, collections, notes, and export are available on paid plans — View plans →" (specific, good). TTS, DMs, Pro-only features each have their own inline banner — no unified upgrade moment.
- **Sign-up friction**: signup → verify email → pick-username → welcome → home. That's 4 steps. Pick-username and welcome should merge for users who already chose a username.
- **Paywall clarity**: the "Upgrade to read this article" state doesn't mention WHICH plan unlocks what. Reader hits paywall, clicks Upgrade, lands on `/profile/settings/billing` — now they're in settings land, not browsing plans side-by-side. /browse/plans would convert better.
- **Registration wall (2nd anon article view)**: modal says "You've reached the free article limit." No "keep reading free X more this week" counter, no sense of how strict the wall is.

## Feedback loops

### Actions with NO confirmation
- /bookmarks "Remove" on row — silent deletion, no undo.
- /bookmarks "Move to collection" via `<select>` — silent, no toast.
- /bookmarks "Save" note — silent save.
- /story "Report article" submit — inline "Thanks" for 2s, then modal closes. No persistent receipt.
- /profile/settings password change (inferred from action key) — need to confirm, but most settings actions dispatch toast only via ToastProvider.
- /welcome "Skip" onboarding — no "Are you sure?" and no way to return.

### Actions with confirmation done well
- /story Share — toast `Link copied!` auto-clearing in 2s, handled across clipboard + fallback paths.
- /bookmarks collection delete — `<ConfirmDialog>` with busy state + destructive language.
- /forgot-password submit — shifts to a success card with email masking + resend affordance.
- /notifications Mark all read — visible state change on the list.

## Loading + error + empty states

### Present where needed
- /notifications — skeleton rows while perms hydrate.
- /profile/settings — `SkeletonRow` / `SkeletonBar` components imported (at least infra exists).
- /leaderboard — has `loading` state.

### Missing / weak
- /home — "Loading articles…" as text, no skeleton cards.
- /bookmarks — "Loading bookmarks…" as text.
- /messages — `msgsLoading` state but not shown with skeleton.
- /story/[slug] — "Loading..." as text centered in dark viewport. No skeleton of article shape.
- /kids — "One sec…" text, no skeleton.

### Error states
- Home / messages / notifications have error banners with Retry buttons. Good.
- /story has no visible "failed to load article" surface — if the fetch errors, user sees loading forever or an empty view.
- /welcome `finishError` has `role="alert"` — good.

### Empty states
- /bookmarks empty — "No saved articles here — Browse articles" (wrong target).
- /notifications empty — text-only, no CTA.
- /messages empty conversation list — not inspected but from code looks like a plain list.

## Accessibility findings

### Keyboard navigation
- Skip-to-main-content link is present in layout.js — good baseline.
- Focus-visible outline (`2px solid #111`) is globally applied — good.
- BUT: search overlay doesn't return focus to trigger on close. Registration wall modal doesn't trap focus. No keyboard shortcut `/` to focus search (a news-site convention users expect).
- Horizontal-scroll category pills on home have no arrow-key navigation. Tab through them works but arrow-key / page-up doesn't.

### Screen reader / semantic HTML
- `<main id="main-content">` landmark — good.
- `<nav>` used in NavWrapper — good, but no `aria-label`. Screen reader says "navigation" with no distinguishing name for the bottom tab bar.
- Dialog roles present on report modal, registration wall, search overlay — all have `aria-modal=true` and `aria-labelledby` — thank you.
- BUT: /signup form error box is NOT `role="alert"` (login's is). Inconsistent.
- Breaking banner: `BREAKING` + title is in a `<div>` with no role. Announced as generic text by VoiceOver.
- Category badges (`<span>` with uppercase text) have no role, which is fine, but they're also not readable as links — and they sit directly above clickable article cards.
- iOS has ZERO accessibility modifiers across all 38 views.

### Focus management
- Search overlay opens, focuses the search input via setTimeout 100ms — fragile, but works. Close doesn't restore focus.
- Modals that DO use `useFocusTrap`: /messages search, /story report, /story regwall. That's 3 of roughly 10 modals.

### Color contrast
- `--dim: #5a5a5a` on `--card: #f7f7f7` = 5.95:1 — passes AA.
- Hardcoded `#666666` still exists in many pages (not using tokens). `#666` on `#f7f7f7` = 4.47:1, under 4.5:1 AA for normal text. Flagged.
- "At cap (10)" disabled button is `#ccc` on white — fails badly.
- "View plans →" linked text inside a warning banner uses `color: #111, fontWeight: 600` on `#fffbeb` — passes.

### Motion / reduced-motion
- globals.css has a `prefers-reduced-motion: reduce` baseline that collapses animations to 0.01ms. Excellent.
- Kid celebration motion explicitly degrades via the same rule. Good.
- No JS-driven animation was audited, but the CSS baseline is doing real work.

## iOS accessibility

- **Dynamic Type**: not supported. Every `.font(.system(size: 13))` is a fixed size. Users with Larger Text set to 150% will see the same 13pt. Must migrate to `.font(.subheadline)` / `.font(.body)` / `@ScaledMetric`.
- **VoiceOver labels**: absent. `Button("Sign In") { … }` gets an auto-label from its text — OK for labeled buttons but icons (e.g. `Image(systemName: "xmark")`) need `.accessibilityLabel("Dismiss")`.
- **Safe areas**: `.safeAreaInset(edge: .bottom)` used on tab bars — good. `.ignoresSafeArea()` on splash — intentional.
- **Reduce Motion**: no `@Environment(\.accessibilityReduceMotion)` reads anywhere. Any SwiftUI `withAnimation` runs unconditionally.
- **VoiceOver rotor**: no heading markers (`.accessibilityAddTraits(.isHeader)`) on any "Welcome back" / "Sign in" screens.
- **Announcements**: no UIAccessibility.post when errors appear. VoiceOver user submits login → sees nothing change.

## Onboarding path

Sign-up → verify → (pick-username) → welcome → home → first read → quiz → first comment → first upgrade.

### Where friction lives
1. Verify email is a required hard stop. Resend cooldown 60s. Change-email flow is inline — good. But "Use a different account" = /logout. Scary.
2. Pick-username has `Skip for now` → goes to `/`. No username means `@auto_123456` gets surfaced elsewhere (leaderboard, comments) — users may not know a username is still required eventually.
3. /welcome carousel: 3 clicks, no auto-advance, skip is dim. Users speedrun past it.
4. First read: fine. Article body + quiz.
5. First quiz fail: free accounts get 2 attempts per article. This isn't explicitly signaled at attempt-1. User sees "Failed" with no "1 attempt left" counter (not inspected in quiz component but worth checking).
6. First comment: unlocks after 3/5 pass. Good moment.
7. First upgrade: happens organically at Bookmark #11 (cap) or article-paywall hit. No proactive "Your 7-day trial is a click away" prompt. Missed revenue.

## Exit / escape hatches

### Modals
- /story regwall — Close button (top-right), NO Escape key handling, NO backdrop click to close (actually the wrapper has no onClick; dismissed only via button). Softened by `sessionStorage` persistence of dismissal. OK.
- /story report modal — backdrop click DOES close (good), but keyboard Escape doesn't (I don't see an Esc handler).
- /messages search modal — `useFocusTrap` with `onEscape` — good.
- /home search overlay — has Cancel button, no Esc key handler.

### Dead-end screens
- /verify-email if the user's inbox is inaccessible and they can't change email: escape is /logout which destroys progress.
- /welcome if Skip fails (network error shown in finishError): user is stuck on carousel.
- /story 404: "Article not found." — no link back, no search, no related content.

## Page titles + social cards

### `<title>` per page
- EVERY PAGE: `Verity Post — Read. Prove it. Discuss.` — zero variation. Confirmed via curl on /, /login, /signup, /welcome, /bookmarks, /leaderboard, /notifications, /messages.
- This breaks tab identification, browser history, SR page announcements, and search result listing.

### OpenGraph
- Root metadata has og:title/description/site_name/type=website. Good baseline.
- `twitter:card: summary` — should be `summary_large_image` for news content.
- Only `/story/[slug]` has a dedicated `opengraph-image.js`. Category, leaderboard, profile, kids do not — all share the generic OG.
- `og:image` appears unset in root metadata I saw.

### Favicon
- `favicon.ico`, `icon-192.png`, `apple-touch-icon.png` declared. Apple-specific `apple-mobile-web-app-*` metas present. Manifest.webmanifest linked.

## Engagement principles I'd codify

1. **Every page gets a unique `<title>`.** Format: `[Page name] · Verity Post`. Non-negotiable — this is table-stakes.
2. **Every disabled button explains why on hover AND via aria-describedby.** "Enter email + password" / "Accept terms" / "Password must include…"
3. **Every destructive action requires a single ConfirmDialog with undo toast within 5 seconds.** No silent deletes, anywhere.
4. **Every modal supports three dismissal paths**: Escape key, backdrop click (unless destructive), visible Close. Focus returns to the trigger on close.
5. **Every loading state uses a skeleton of the content it is replacing**, not a text string. One `Skeleton` component, reused everywhere.
6. **Every iOS view uses `Font.system(.body)` / `.subheadline`** (Dynamic Type-aware), not `.font(.system(size: N))`. Every non-label button / icon gets `.accessibilityLabel` + `.accessibilityHint`.
7. **Tab-bar order reflects usage, not product org charts.** Bookmarks and Search deserve first-class tabs; move Leaderboard behind Profile.
