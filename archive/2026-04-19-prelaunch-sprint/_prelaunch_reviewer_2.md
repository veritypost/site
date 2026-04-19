# Pre-launch review — Reviewer 2 (user-flow focus)

Compiled cold, no access to prior audits.

## Critical — users will hit these and bounce

- **Home feed is test data, visibly.** Only 5 published articles exist in the DB. Every single one starts with "Test:" — e.g. "Test: Congressional Hearing on Federal Reserve Independence", "Test: EU Passes Comprehensive AI Act…". This copy renders unmodified to every anon visitor on `/`, `/story/[slug]`, `<title>`, OG/Twitter meta, everywhere. No real user would stay on a news site whose headlines all say "Test:". The category pill row also shows every category (24 parents) while 22 of them return empty lists. `/Users/veritypost/Desktop/verity-post/site/src/app/page.tsx` lines 284-319 render whatever is in `articles` with no filtering of seed titles. This alone is ship-no.

- **`/billing` is a 404 and several dead-state banners link to it.** `AccountStateBanner.tsx` (lines 81, 93) sends users in the "frozen_at" (Resubscribe) and "plan_grace_period_ends_at" (Resume billing) states to `/billing`, which does not exist (`curl -I /billing` → 404). `kids/page.tsx` line 97 also sends a logged-in user without Family plan to `/billing` when they tap through the kid profile gate. These are the worst possible 404s — they hit users who are (a) about to lose their paid features, (b) just bought a family plan and want to add a kid. Real-money friction. File: `/Users/veritypost/Desktop/verity-post/site/src/components/AccountStateBanner.tsx`, `/Users/veritypost/Desktop/verity-post/site/src/app/kids/page.tsx`.

- **0 sources, 0 comments, 1 bookmark, 1 timeline row across the whole DB.** Source links on stories render as empty chip rows. Timelines render "No timeline yet." Comments, the product's headline feature, are entirely absent — nobody has ever passed a quiz and posted. The home page's hero selling point ("quiz-gated comment section") will look vacant to the first 1000 visitors. Either seed real discussion or hide the feature shell until there's content.

- **Bookmark limit copy contradicts itself.** Story page line 735 renders "You've used 10 of 10 free bookmarks" AS INLINE TEXT beside the bookmark button, on every article, for any free user who has hit the cap — not just as a tooltip on the disabled button. On mobile that wraps oddly under the share button. The toast-on-hit pattern in `toggleBookmark` (line 478) and this inline banner both fire; doubled messaging. Minor but visible on day one.

- **Family signup dead-end for Family-plan buyers without kid profiles.** A user who just bought `verity_family_monthly` and navigates to `/kids` sees "Kid profiles live on Verity Family. Your grown-up can add them from their account." with a button to `/billing` (404) — not to `/profile/kids` where they'd actually add a profile. They just paid for Family and are told to buy Family. `kids/page.tsx` lines 90-100.

## High — user friction that'll hurt retention/conversion

- **DM free-user silent redirect.** `/messages` for any user without `messages.dm.compose` calls `router.replace('/profile/settings/billing')` with no message. A free user who clicks Messages in the nav just lands on billing with no "DMs require Verity" explanation. File: `site/src/app/messages/page.tsx` line 162. Contrast that with the kinder regwall overlay used on `/story/[slug]` — same team, different UX.

- **`/profile/settings/billing` is a client-side redirect stub.** It's a React component that renders null and `router.replace('/profile/settings#billing')` on mount. Every upgrade CTA across the app (15 hrefs in 12 files — search, bookmarks, recap, kids, quiz, comments, story paywall, messages, family, card, kids/[id]) triggers login check → then this stub → then settings#billing anchor. Multi-hop with a visible flash. Either make it a server redirect or link directly to `/profile/settings#billing`.

- **Home page shows a "Verify your email to search" banner, but no search button on home.** Comment in `page.tsx` line 491-498 says the sticky home search was removed and nav wrapper owns it now — but the `searchVerifyPrompt` state and banner are still wired up for a caller that no longer exists. Dead UI. Also: top-nav search icon is gated on `canSearch && path === '/'`, so a signed-in verified user on `/story/[slug]` can't get to search from the top bar; they have to go home first.

- **Anon "2nd article" interstitial copy says "unlock quizzes".** `Interstitial.tsx` line 80: "Sign up to save your streak, unlock quizzes, and comment on articles." Quizzes don't actually unlock at signup — a free account's quiz unlocks the comments. Two gates collapsed into one ambiguous sentence.

- **Regwall dismissal is per-session but "Sign up to keep reading" still blocks the background article.** After the user clicks Close, the dialog vanishes but the story below was loaded already (`canViewBody` is computed off permissions, not regwall state), so the text is there. Fine. But the same sessionStorage key never clears on signup, so a user who signs up in another tab and comes back still sees the dismissed-once state. Minor.

- **Quiz "View plans" CTA after free attempt exhaustion.** `ArticleQuiz.tsx` line 318 sends users to billing when they've failed both attempts. No explanation that quizzes are on a per-article pool and there's an alternative (e.g., try another article, wait X days). A user who failed their first quiz hits a paywall with no other exit.

- **Bookmark cap copy uses a curly apostrophe in a fenced string** (`'You\u2019ve hit the 10-bookmark limit…'`) that renders fine but demonstrates inconsistent formatting — other error strings use plain quotes. Polish issue.

- **Story page uses `var(--wrong)` / `var(--accent)` / `var(--amber)` CSS vars** but the page is rendered inside a `.vp-dark` theme. No stylesheet imports visible in the route. If the var chain breaks (theme toggle, a11y high-contrast), colors fall back to inherited defaults which would make the "Breaking" / "Developing" badges invisible. I didn't verify in live DOM that the vars resolve — worth a spot check.

- **Top-level footer link `/profile/contact` returns 302 to login for anon users.** Anon visitor clicks "Contact" in the footer and is sent to login rather than to a public contact form. App Store-review liability.

## Medium — polish that'd matter at scale

- **Home `FALLBACK_CATEGORIES` constant ships ~30 hardcoded categories merged with DB results.** When DB loses a row or a slug changes, stale fallback still shows. The comment calls it "for layout review" but this is production code. If an admin actually removes "Crime & Justice" from categories, it's still visible in the home pill row forever. Either remove fallbacks pre-ship or gate them behind a flag.

- **Home adult feed filter strips kids-only categories via slug prefix `kids-`** (line 273-276). But DB also has categories named "Science (Kids)" with presumably different slugs — I saw both "Science" and "Science (Kids)" in the categories list. If admins edit kid categories without the `kids-` slug prefix, they leak into the adult feed. Data-entry tripwire.

- **Home page feed fetch loads 100 articles, slices 50, renders 50 — but in production only 5 exist.** When real content lands, the `/api/stories/read` beacon is fired on every open (not just unique views) and client-side filtering is 100-row JS scan. Works for day one, won't scale — not a launch blocker.

- **Anon homepage has no "Sign up" CTA above the fold.** Top bar says "Sign in" (subtle grey). The breaking banner, category pills, recap card, then article cards scroll. A real anon would have to tap Sign in → switch to Sign up. Typical news sites have both entry points on the home. Misses conversion from lead with high intent.

- **Kid story page dead-ends badly when a kid's profile is paused or removed.** The kid_profiles `paused_at` check in `/kids/page.tsx` filters profiles, but an activated `vp_active_kid_id` stored in localStorage from a prior session continues to route to `/kids/story/[slug]` which then `router.replace('/kids')` when the profile isn't found. The user sees a flicker of the previous kid-branded UI, then the picker. A kid won't understand.

- **Quiz `QuizPassCelebration` renders on kid story** but `ArticleQuiz` below it *also* renders its own "Quiz passed!" card (lines 161-177 of ArticleQuiz.tsx). Two green celebration boxes stacked. A kid sees redundant UI.

- **The article body "complete" beacon fires at 30s OR 80% scroll.** A short article (600 words) scrolls 100% in <10s so the 80% path fires first, which is fine. A longer article where the reader opens and tabs away for 30s also fires — counting that as "reading complete" inflates the score. Low-stakes gaming vector.

- **`/profile/settings#billing` anchor depends on the settings page rendering the billing section on a single scroll. `profile/settings/page.tsx` is ~3000 lines (the grep caught 4 TODOs in it).** A code smell; also suggests the anchor target may move as the page is edited. Fragile.

- **`AskAGrownUp` component's "View family plans" button href is the broken `/billing`.** On kid profile add path, and on family-plan denied path. Design system component has a hardcoded wrong href; fixing one caller isn't enough — fix the default.

- **Adult `/story/[slug]` tabs (Article/Timeline/Discussion) on mobile stay visible even when the target section is empty.** Tapping Discussion when there are 0 comments AND you haven't passed the quiz shows… nothing. `discussionSection` is `null` for unverified users without quiz pass. The tab should either hide or show a "Start the quiz first" state.

- **The `<title>` tag never updates past "Verity Post — Read. Prove it. Discuss." even on `/story/[slug]` pages.** SEO + browser-tab UX.

- **Home loading copy says "Loading articles..." (line 887) but shows nothing else — no skeleton, no shimmer.** On slow connections a blank white page for 2-3s. Standard fix is 2-3 skeleton cards.

## Low — nits

- Copy: signup CTA says "Create free account" with a lowercase "free" — fine. Welcome carousel line 32: "Streaks reward showing up." Solid. Line 35: "Miss a day without a freeze and you start over — so make the habit stick." Slightly lecture-y; softer tone on onboarding would help.

- Home category pill "All" is first; DB-order places "Science (Kids)" and "Animals" at sort_order 100+ but the adult feed excludes them. No user impact, just weird visible ordering in admin.

- Story "Share" button copies URL to clipboard. No `navigator.share` path for mobile (which gets the native share sheet). On iPhone this is a missed win.

- `CommentComposer.tsx` uses `MENTION_RE` to detect `@user` mentions. If permissions fail (`comments.mention.insert` not held) the component silently drops mentions without telling the user. Quiet data loss.

- Forgot password, reset password, verify email all render `loading` text with no skeleton. Fine but looks empty on first paint.

- `Interstitial.tsx` signup variant CTA href is hardcoded `/signup` — doesn't carry the `next=` param so the anon gets bounced home after creating account rather than back to the article they were interested in.

- Home `hasActiveFilters` uses `||` over `searchQuery, datePreset, …` which returns the first truthy — fine, but means the search summary shows only the value, not a consistent string. Aesthetic.

## Flow-by-flow notes

### Anon visitor → first article → sign-up
- Land on `/` → see a wall of "Test: …" headlines. Deflate.
- Tap any article → story page loads with real body. Bookmark/Share buttons present. "Take the quiz" CTA with "Sign up" link-out. OK flow.
- Hit 2nd article → `Interstitial` with signup variant pops. Close or Sign up. Functional, but CTA copy is off.
- Hit 5th article → regwall overlay blocks. "Create free account" button. Can close, persists for session.
- **Friction**: no "Sign up" visible from home, no signup CTA on the breaking banner, no context after signup for where to go.

### Free user → comment attempt → quiz → comment
- Log in, find an article with `quiz_count >= 10` (all 5 current articles qualify; each has 12 quizzes).
- Quiz card appears with "Take the quiz" CTA, 2 attempts messaging for free users. Solid UX.
- Pass: green "Discussion unlocked" banner, comment thread below.
- Fail twice: View plans CTA — no alternative, no hint that picking a different article works.
- **Friction**: Post-pass state shows a duplicate green banner on kid stories.

### Paid conversion moment
- Every upgrade goes via a 15-CTA constellation all pointing at `/profile/settings/billing` — a React redirect stub to `/profile/settings#billing`. Works, but flash.
- `/billing` (plain) is 404. Multiple states send here; real users will get 404 screens.
- Stripe checkout success URL is correct (`/profile/settings/billing?success=1`), which triggers the redirect stub, which fires on `?success=1` — probably works but I didn't trace.

### Kid mode entry + exit
- Parent creates kid profile at `/profile/kids`. COPPA consent form present. Under-13 date check present. PIN required. Thorough.
- Kid picks profile at `/kids`, kid-mode activates (localStorage `vp_active_kid_id`).
- Kid reads `/kids/story/[slug]`. Simpler chrome. Quiz component is the adult `ArticleQuiz` — uses "Discussion unlocked" copy for kids, which is wrong (kids don't have discussions).
- Exit kid mode via `/kids/profile` → PIN prompt. Good.
- **Friction**: Paused kid profile + stale localStorage → flicker and redirect. Shared `ArticleQuiz` component leaks adult copy.

### Admin daily workflow (stories, moderation, users)
- `/admin` hub page is dense (48 admin routes enumerated). Role gate at client + middleware.
- Admin categories include everything I'd expect — stories, moderation, users, plans, ads, feeds, analytics, webhooks. Broad surface.
- Editor/moderator roles reach admin without the "Back to site" banner (confirmed in NavWrapper). That's a good call.
- **Gap**: no visible admin feature to *seed real articles* or bulk-edit the "Test:" prefix. Admin can create 1-at-a-time via `/admin/story-manager` but no import path surfaced. If the plan is to hand-write 20 real articles pre-launch that's fine; if you want to cold-start with 500, there's no tool.

## What I couldn't assess

- **Real DM / notification delivery.** 0 notifications in DB; can't exercise the queue.
- **Stripe webhook path end-to-end.** Code looks intact but I didn't simulate a paid signup.
- **iOS parity in depth.** iOS source files are present (HomeView, StoryDetailView, KidViews, etc.) but I didn't curl/run the iOS app. The `REVIEW.md` in `/VerityPost/VerityPost/` I skipped per instructions. Risk: web has 24 categories from DB + 30 fallbacks; iOS likely has its own list. Drift probable.
- **RLS correctness.** Anon can clearly read articles (home renders). Didn't probe edge cases (paused kids, soft-deleted articles).
- **Real-time comment subscription.** `CommentThread` does its own realtime; 0 comments in DB, can't watch a new row arrive.
- **Ads pipeline.** `Ad` component renders on home every 6 rows and on story bottom. `ads` table doesn't exist by that name; I didn't trace the placement lookup.
- **Email verification delivery.** No email sent through the test flow.

## Verdict

**Ship today: NO**

The single biggest reason: **every headline on the public home page begins with "Test:"**. That is literally the first impression for 100% of visitors, and it kills the product's credibility before they read a sentence. Fix that one thing and the site looks 10x more real. This is not a "polish after launch" — it's hostile to the brand name ("Verity" promising truth, while "Test:" screams unfinished).

The second blocker: **`/billing` 404s** on the two most lucrative states (resubscribe, resume billing, family plan upsell). This is the money path. 404s on the money path block ship.

Unblock a yes with:
1. Real published articles (target: 15-20) with correct titles, summaries, at least 1 source link each, ideally a timeline entry or two. Remove the 5 "Test:" articles or relabel them.
2. Fix `/billing` to redirect to `/profile/settings#billing` (or set it as an actual page). Update `AccountStateBanner.tsx` and `AskAGrownUp` default href.
3. Seed 5-10 real comments across 3-5 articles so the discussion shell isn't empty on day one.
4. Fix the Family-plan-but-no-kid-profile dead-end: `kids/page.tsx` should route to `/profile/kids` when a Family plan is held but zero profiles exist, not `/billing`.
5. Remove or rewrite the home `FALLBACK_CATEGORIES` block so the pill row matches live DB state.
6. Replace the silent `/messages` → billing redirect with a friendly upgrade prompt matching the `regwall` pattern.

With those six fixes this is ship-able. Without them, it's a demo.
