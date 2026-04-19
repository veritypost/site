# UI Improvements — Verity Post

**Compiled:** 2026-04-19
**Source:** 4 independent UI audits (Lead + 3 peers), consolidated.
**Scope:** web adult + web admin + kids web + iOS, at every breakpoint from 320px to 1920px.

## How to read this doc

- Items ranked by product-wide impact, not surface.
- Severity: **Critical** (shipping would embarrass) / **High** (user-visible, fix before 10k DAU) / **Medium** (polish) / **Low** (nit).
- Each item has: what, where, fix, effort, affected devices, auditor confidence (N/4 flagged).
- Principles at the bottom codify the thinking so new work doesn't regress.
- Where auditors disagreed on severity, I picked the defensible call and noted it.

---

## Top 20 priorities (fix these first)

| # | Severity | Surface | Item | Fix | Confidence |
|---|---|---|---|---|---|
| 1 | Critical | iOS global | No Dynamic Type, no accessibility labels, forced light mode | Replace every `.font(.system(size: N))` with `@ScaledMetric`/`.font(.body)` semantic tokens; add `.accessibilityLabel` to every icon-only button; delete `.preferredColorScheme(.light)`; move hex colors into asset catalog with dark variants | 4/4 |
| 2 | Critical | Global copy | Sign in / Sign In / Log In / Log in / Login / Sign Up Free / Sign up free — every CTA pair mixes casing AND verb | Canonicalize to **Sign in**, **Sign up**, **Sign out**, **Create free account** (primary signup button). Sweep every surface including iOS, email, push | 4/4 |
| 3 | Critical | Every web page | Every `<title>` renders the same root string; tab titles never change | Add page-specific metadata per route: `[Page] · Verity Post`. Non-negotiable for SR users, tab switchers, browser history, SEO | 1/4 (Peer 3 solo — kept; defensible and cheap) |
| 4 | Critical | Web global | No responsive behavior from 1024 → 1920px. Every page sits in a 680–960px column with white on both sides on laptop/desktop | Declare three breakpoints (768, 1024, 1440). At ≥1024 either widen the column to 900 with a card grid, or add a sidebar (related stories, trending, timeline). Stop presenting mobile-in-a-void on desktop | 3/4 |
| 5 | Critical | Home `/` | Double header — global NavWrapper top bar (44pt) PLUS home's own sticky brand nav (56pt). 100px of chrome before any content | Remove the home-page sticky nav. Rely on NavWrapper. Move any home-specific controls (search icon) into the global top bar | 3/4 |
| 6 | Critical | `/story/[slug]` regwall modal | Two CTA labels on the same wall (Sign up free / Sign Up Free), a 13px text "Close" control with no aria-label, no Escape handler, no focus trap, no backdrop-click dismiss | Unify label to **Create free account**, replace text close with an icon button (`aria-label="Close"`), add Escape + focus trap + backdrop-click per our standard modal | 4/4 |
| 7 | Critical | `/login` error + `/signup` error | "Invalid credentials" is the only signal for wrong password, unknown user, malformed input — cold and accusatory. `/signup` form has no `htmlFor` on labels, error div lacks `role="alert"` | Rewrite: "That email and password don't match. Check spelling or reset your password." Add `htmlFor`/`id` pairs on every signup label; wrap error in `role="alert"` | 3/4 |
| 8 | Critical | Touch targets — web pills, subcategory pills, search cancel, nav search icon, welcome skip, messages menu trigger, story source pill, breaking micro-pill, leaderboard tabs, footer policy links | Most interactive pills and icon buttons are 26–30px tall — below WCAG AAA 44×44 CSS | Enforce 44×44 minimum: pills get min-height 36 (secondary) or 44 (primary); icon buttons get 44×44 frames; add a dev-only lint that fails PRs with height<44 on clickable elements | 4/4 |
| 9 | Critical | iOS `TextTabBar` + session-expired banner dismiss + `SignInGate` | Tab bar at 14pt padding + 13pt text is ~42–44pt (borderline HIG fail). `Image(systemName: "xmark")` at 10pt with no explicit frame fails HIG. Bare-text buttons on LoginView/SignupView "Forgot password?" fail | Bump tab bar vertical padding to 16. Wrap every icon button in `.frame(minWidth: 44, minHeight: 44)`. Replace bare text buttons with a proper button style | 3/4 |
| 10 | Critical | `/messages` (free users) | Silent `router.replace` to `/profile/settings/billing` when a free user visits messages — no context, no explanation | Render the in-page explainer that already exists downstream; show "Direct messages are part of paid plans — view plans?" with a CTA. Never redirect-as-gate | 2/4 |
| 11 | High | Marketing/legal/help pages (`/how-it-works`, `/privacy`, `/terms`, `/cookies`, `/dmca`, `/help`, `/accessibility`, `/bookmarks`) | Triple header pattern: NavWrapper top bar + centered "Verity Post" wordmark at 28px + `<h1>`. Three brand/page lines before content | Remove the in-page wordmark on every surface that has NavWrapper. Keep it only on auth cards where NavWrapper is hidden | 4/4 |
| 12 | High | Whole web | Every page hand-codes its own `const C = { bg, card, border, text, dim, accent }` — the same six colors duplicated 20+ times. Accent is #111 in some, #000 (`Color.black`) in others. Danger is `#ef4444` inline vs the `--danger: #b91c1c` token in globals.css | Delete every inline `const C`. Import from shared `@/lib/tokens`. Do the same on iOS: replace `Color.black`, `Color(hex:)` with `VP.accent`, asset-catalog entries. Single source of truth | 4/4 |
| 13 | High | Whole web | Font-size soup — 16 distinct web sizes (9/10/11/12/13/14/15/16/18/20/22/24/26/28/36/60), 5 more unique iOS sizes. 11px alone carries 4 semantic roles. Weights 400/500/600/700/800/900 all in use | Collapse to a 7-step scale: 11 / 13 / 15 / 17 / 20 / 24 / 32. Weights 400 / 600 / 700 only. Delete 500, 800, 900 | 3/4 |
| 14 | High | Whole web | Container `maxWidth` sprawl — 20 distinct values (320–960). Route-to-route content jumps width. Footer sits in a 680 column beneath 900-column pages | Pick three: 480 (narrow form), 720 (feed), 960 (wide admin / story). Footer matches the route's content width | 2/4 |
| 15 | High | Bottom nav (web + iOS) | Tabs are Home / Notifications / Leaderboard / Profile. No Search, no Bookmarks, no Messages, no Browse. Bookmarks has zero entry point outside tapping from a story; Messages is URL-only | Reorder tabs by actual usage: Home / Browse / Bookmarks / Notifications / Profile. Move Leaderboard behind Profile or into Browse | 1/4 (Peer 3 solo — kept; high-impact retention win) |
| 16 | High | `/story/[slug]` action row | 4 controls (Listen, Save, at-cap banner, Share) on one flex row at 6px gaps. At 320/375 the "At cap (10)" banner wraps onto its own line and reads as a label, not a button. The 11px cluster is below 44pt | Move the cap banner ABOVE the article body (or into a tooltip on the disabled button: "Upgrade to save more"). Set action row to 13px text in 44pt frames | 3/4 |
| 17 | High | "Breaking" treatment | Three visual treatments for one concept — home banner (`#ef4444` bg, uppercase 10px letter-spacing 0.1em), in-card breaking badge (`#ef4444` solid, different padding), story page pill (another variant). Also the home banner is NOT a link despite reading like a headline | Define ONE Breaking chip: uppercase 11px, weight 700, tracking 0.05em, padding 2×8, radius 4, tinted `--danger` bg at 12%. Use it everywhere. Make the home banner link to the story | 3/4 |
| 18 | High | Empty states | 80% are informational ("No articles found", "No saved articles here") — no CTA, no explanation of what fills the slot. Only `/notifications` and `/profile/activity` do it right | Rewrite every empty state using the notifications pattern: "What goes here + how to fill it". See the rewrite catalog below | 4/4 |
| 19 | High | Error messages | "Failed to X. Please try again." appears 12+ times. "Invalid credentials", "Something went wrong", "Could not load …" — system voice, no next step | Rewrite in user voice with next step: "Couldn't X. [Specific fix]." Drop every "Please" — performative. See the error-rewrite catalog below | 3/4 |
| 20 | High | Radius + avatar + shadow sprawl | 21 distinct `borderRadius` values (2–999), 13 avatar sizes (28–180), every shadow a custom string | Radius: 4 / 8 / 12 / 20 / 999. Avatars: 32 (inline) / 48 (list) / 80 (hero). Shadows: `sm` / `md` / `lg`, three defined strings. Delete everything else | 1/4 (Peer 2 solo — kept; fixes visible sloppiness) |

---

## Findings by surface

### Global / cross-cutting

- **Sign in/up/out casing + verb chaos.** [4/4] One label per destination product-wide. "Sign in" / "Sign up" / "Sign out" / "Create free account". Sweep every surface: web nav, auth pages, story regwall, help footer, kids gate, iOS tab labels, iOS regwall button, iOS Sign in with Apple/Google. Already Top #2.
- **Inline `const C` palette in every public page.** [4/4] Consolidate into `@/lib/tokens`. Admin and iOS already have tokens; public web is the outlier. Top #12.
- **Font-size soup / weight sprawl.** [3/4] 7-step scale, 3 weights. Top #13.
- **Container width sprawl.** [2/4] Three widths total: 480 / 720 / 960. Top #14.
- **`<title>` never changes per page.** [1/4 but cheap + high-impact] Per-route metadata. Top #3.
- **Ellipses + smart quotes + arrows all mixed.** [1/4] Standardize to Unicode `…`, straight or curly apostrophes (pick one), `→` literal char.
- **Touch targets below 44pt everywhere.** [4/4] Dev-lint enforcement. Top #8.
- **Skip-link `.vp-skip-link` exists but several pages reinvent it inline (home search dialog sr-only h2 uses `position:-9999`).** [1/4] Delete the inline hacks.
- **Meta OG image.** [1/4] Use `summary_large_image` on Twitter. Add per-page OG for /browse, /leaderboard, /profile, /kids.
- **Focus ring regression.** [1/4] Many inputs override `outline:none` inline and drive a custom focused border via React state. That breaks `:focus-visible`. Let the global focus ring do its job.

### Home `/`

- **Double stacked header.** [3/4] Remove home's internal nav. Top #5.
- **Category pills horizontal scroll with `scrollbar-width: none` and no fade/chevron.** [3/4] Add a right-edge gradient fade; consider left/right chevrons at ≥768.
- **Breaking banner is not a link.** [1/4] Wrap it in `<a href={story.url}>`. Dead engagement moment today.
- **Empty state "No articles found."** [3/4] Rewrite: "Nothing matches this filter. Try All, or switch categories."
- **Loading state is text ("Loading articles…").** [3/4] Replace with skeleton cards.
- **"Day N" streak line lacks context on first visit.** [2/4] Show "Day 7 of your reading streak" the first time; collapse to "Day 7" thereafter.
- **First-5-seconds for anon user is empty.** [1/4] The logged-out home has no hero, no tagline. Surface "News with a quiz-gated comment section" line above the fold + a Sign up / Sign in pair in the top bar.
- **Load-more button visually matches story cards.** [1/4] Give it a clear button treatment — solid fill or strong outline.
- **Feed is 680px centered on a 1920px desktop.** [3/4] Widen to 900+ with a card grid at ≥1024. Top #4.
- **Vertical rhythm drifts** — card padding 14/16, gaps 0/12/14. Normalize to an 8-point grid (16/16/32).
- **Breakpoint where responsive bites:** 320 (category pill overflow), 1024+ (wasted width), 1440+ (mobile-in-void), 1920 (braking banner stretches but content doesn't).

### Browse + discovery `/browse`, `/category/[id]`, `/search`, `/leaderboard`, `/recap`

- **`/browse` H1 + subhead title case ("Trending Now", "Most Recent") vs sentence case elsewhere.** [2/4] All sentence case.
- **`/browse` `CAT_STYLE` has empty `icon: ''` strings — dead field on every render.** [1/4] Delete. `FEATURED_COLORS` cycles 5 arbitrary colors with no semantic meaning — either tie to category or remove.
- **`/browse` category drill CTA "Browse {name}" vs "View all {name} articles" — two labels for the same action.** [1/4] Pick "See all {name} articles".
- **`/browse` category empty ("No articles yet.").** [1/4] Rewrite: "No articles in this category yet. New stories arrive daily."
- **`/search` H1 is just "Search".** [1/4] "Search articles" to differentiate from the global search overlay.
- **`/search` placeholder "Search by keyword".** [1/4] "What are you looking for?" or "Search articles by keyword or phrase".
- **`/search` "Search by:" pill `Slug` is developer jargon.** [1/4] Rename to "URL" or remove from user-facing search entirely (admin-only feature).
- **`/search` "Source:" filter vs the story body's "sources".** [2/4] Rename filter to **Publisher**. Keep "cited sources" for story body.
- **`/search` advanced-filters upsell card is a 12px gray block.** [1/4] Either make it prominent or surface only on attempt to use a filter.
- **`/leaderboard` tabs "Top Verifiers / Top Readers / Rising Stars / Weekly" — three are Top-X, "Weekly" is a time window.** [2/4] Remove "Weekly" tab. Use the existing period toggle (All Time / This Month / This Week).
- **`/leaderboard` periods are title case ("All Time", "This Month").** [1/4] Sentence case.
- **`/leaderboard` anon CTA.** [1/4] Reuse the notifications-page hero pattern.
- **Recap card embedded in home feed at position 1.** [1/4 info] Check that `/recap` doesn't bury the quiz behind its own chrome block (common pattern here).
- **Breakpoint where responsive bites:** 768 (leaderboard 800 vs home 680 — route-to-route content jumps 120px), 1024+ (no sidebar or grid added).

### Reading `/story/[slug]` (adult)

- **Regwall modal issues.** [4/4] Already Top #6. Fix label, fix close affordance, add focus trap + Escape + backdrop dismiss.
- **Action row crowding on 320/375.** [3/4] Already Top #16.
- **Title in serif 26px, excerpt 15px sans — abrupt.** [1/4] Bump title to 28–30 or render excerpt in serif italic at 17px to bridge.
- **Desktop sidebar Timeline switches to tab row at <1025px; tabs don't preserve scroll position and the sticky tab bar hides content (40px hit target).** [2/4] Preserve scroll; bump tab height to 44.
- **Report modal labels mix Title Case and sentence case ("Hate Speech" / "Off Topic" vs "Harassment" / "Spam").** [1/4] Normalize to sentence case: "Hate speech", "Off-topic", "Misinformation", "Harassment", "Spam", "Impersonation".
- **Regwall copy has three verbs for the same action (title "Sign up", body "Create an account", button "Sign Up Free").** [3/4] One verb: "Create free account".
- **Post-article "You might also like" card is a dead end (Back to home / Browse articles).** [2/4] Either surface a real next-article recommendation or rename to "Keep reading" / "Where to next".
- **Bookmark + Share + Report at 11px is microscopic AND below 44pt.** [3/4] 13px text in 44pt frames.
- **"At cap (10)" disabled button is silent about why; the explanation is inline as spam.** [2/4] Put the reason into the disabled button label/tooltip: "Upgrade to save more".
- **Paywall body copy is generic ("Your current plan does not include full article access").** [1/4] Sell the plan: what you get (unlimited bookmarks, TTS, DMs, no ads). Link to `/browse/plans`, not `/profile/settings/billing`.
- **Quiz is BELOW the article body; anon users may never scroll to it.** [1/4] Add a top teaser pill: "Discussion earned by passing a 5-question quiz below."
- **"Saved" (state) next to "Share" (action) — mixed button-label conventions.** [1/4] Pick consistently (both state or both action).
- **Bookmark toggle gives no toast; Share gives a "Link copied!" toast.** [1/4] Match: toast on Save + a "Move to collection" picker on add.
- **Timeline CSS math is fragile** (paddingLeft 24 + absolute line left 4 + dots left -26). [1/4] Refactor to grid/flex with fixed gutters.
- **Story 404 is a dead end ("Article not found.") — no back link, no search, no related.** [1/4] Add three escape hatches.
- **Breakpoint where responsive bites:** 320/375 (action row wraps), 768 (sidebar missing), 1025 boundary (media query edge case), 1440+ (single column wider than 75 CPL is still acceptable at 15px but worth flagging).

### Auth cluster `/login`, `/signup`, `/signup/expert`, `/signup/pick-username`, `/forgot-password`, `/reset-password`, `/verify-email`, `/welcome`, `/logout`

- **Every auth card duplicates the `C` palette.** [4/4] Consolidate.
- **Card widths: 420 / 440 / 420 / 420 / 420 / 480.** [1/4] Pick 440 once.
- **Triple header on every auth card: "Verity Post" wordmark + h1 + subhead.** [3/4] Tighten into a single header block (brand OR h1, plus subhead). Keep brand only on auth because NavWrapper hides here.
- **`/login` button "Sign In" (Title Case); link "Sign up" (sentence).** [4/4] Sentence case: "Sign in" / "Sign up".
- **`/login` subhead "Sign in to your account to continue reading" — filler.** [2/4] "Sign in to continue reading."
- **`/login` lockout message does not link inline to password reset.** [1/4] Add "Forgot password?" as a link inside the lockout banner.
- **`/login` "Continue as guest" is a real option that's never mentioned.** [1/4] Add a secondary link: "Keep browsing without an account".
- **`/signup` button "Create Account" Title Case differs from login.** [4/4] "Create free account".
- **`/signup` labels lack `htmlFor`/`id`; error div lacks `role="alert"`.** [1/4 but Critical a11y] Fix. Already Top #7.
- **`/signup` email availability only checks on blur.** [1/4] Check on debounced change and on paste.
- **`/signup` password placeholder "Create a strong password."** [1/4] "Create a password" — the bars handle strength.
- **`/signup` confirm-password helper "Repeat your password" vs better "Type it again to check for typos".** [1/4] Rewrite.
- **`/signup` passwords-mismatch is signaled twice (red field + text).** [1/4] Pick one.
- **`/signup` agree-to-terms lines inconsistent punctuation.** [1/4] All three checkbox lines end with a period, or none do.
- **`/signup` Full name placeholder "Jane Doe" is culturally biased.** [1/4] "Your full name."
- **`/signup/expert` "Apply as an Expert Contributor" is stilted + Title Case.** [1/4] "Apply to be an expert" in sentence case.
- **`/signup/expert` success uses "regular reader" — second-class framing.** [1/4] "While we review, you can keep reading and using your account."
- **`/signup/pick-username` availability states have inconsistent punctuation.** [2/4] Align: "@name is available", "@name is taken", "@name is reserved".
- **`/signup/pick-username` has "Skip for now" but no explanation of what happens next.** [1/4] "You can change this later in settings."
- **`/signup/pick-username` onboarding path indicator is out of sync with `/signup` and `/welcome`.** [1/4] Unify step indicators across all three.
- **`/verify-email` "Didn't get it?" card duplicates the Resend button.** [2/4] Remove the card. Use a one-liner: "Check your spam folder. The link expires in 24 hours."
- **`/verify-email` button "Resend Email" (Title Case) vs cooldown "Resend in Xs" (sentence).** [2/4] All sentence case.
- **`/verify-email` "Use a different account" = `/logout`.** [1/4] Reframe as "I typed the wrong email" with a flow that keeps progress where possible.
- **`/forgot-password` body "Enter your email and we'll send you a link to reset your password." is wordy.** [2/4] "Enter your email. We'll send a reset link."
- **`/reset-password` subhead "Make it strong — you won't need the old one anymore." is too cute.** [1/4] "Choose a new password that you'll remember."
- **`/reset-password` success `Password updated!` overcelebrates.** [1/4] Drop the `!`.
- **`/reset-password` requirements list uses color only to indicate met state.** [1/4] Add a checkmark glyph + `aria-live` update.
- **`/welcome` slide titles are cryptic ("Discussions are earned", "Your Verity Score is a knowledge map", "Streaks reward showing up").** [2/4] Lead with user benefit: "Earn your way in", "See what you know", "Build a reading habit".
- **`/welcome` step indicator "Welcome to Verity Post \| 1 of 3" — pipe char, redundant with the progress bar.** [2/4] Drop the counter or drop the "Welcome to Verity Post".
- **`/welcome` Skip button in top-right at 13px gray is unfindable.** [4/4] Underline it or move to a bottom-right secondary button. 44pt hit box.
- **`/welcome` no keyboard nav (arrows), no click-to-advance, CTAs flip between "Next" and "Start reading".** [1/4] Click-to-advance per user preference; settle on "Got it" / "Start reading".
- **`/welcome` progress bars are decorative with no `role="progressbar"`.** [1/4] Add ARIA.
- **Breakpoint where responsive bites:** 320 (signup card 288px wide with 76px inner padding leaves ~212px for fields — tight), 410ish (420 card has 10–20px gap on sides reading as "dialog").

### Profile hub `/profile`, `/profile/[id]`, `/u/[username]`, `/card/[username]`, `/profile/card`, `/profile/contact`

- **LockedTab fallback always says "Verify your email or upgrade your plan to unlock this tab"; button always says "Verify email" regardless of actual gate.** [2/4] Branch on reason. Unverified → "Verify your email to see your activity". Plan-gated → "This tab is part of Verity and above" + button "View plans".
- **Profile header packs 8 semantic roles into one card; at 320px the tier badge slides under the display name.** [2/4] Simplify header hierarchy; allow badges to stack intentionally at narrow widths.
- **"My stuff" section heading is casual vs the rest of the page's formal tone.** [2/4] "Quick links" or "Shortcuts".
- **Shareable card subtitle uses "socials" slang.** [1/4] "Social media" or "anywhere online".
- **Profile is the ONLY public page using the admin token system + `ADMIN_C`.** [2/4] Either roll out admin tokens to everything, or pull profile back. Don't ship one consistent page in a sea of inconsistent ones.
- **Category drill modal CTA "Browse {X}" collides with `/browse` as a feature.** [1/4] "See all {X} articles".
- **Keyboard shortcuts exist (1-4, g+a/c/m/o) but no `?` help panel.** [1/4 info] Add a shortcuts help affordance (Linear pattern).
- **EmptyState "We couldn't load your profile" + "Something went wrong retrieving your account."** [2/4] "Couldn't load your profile. Refresh, or head back home."
- **Frozen status copy is good; keep.** [1/4 info]
- **Public card-not-found state "No user found."** [1/4] "We couldn't find that user. The username may have changed."
- **Breakpoint where responsive bites:** 320 (badges wrap under name).

### Settings `/profile/settings` (all sections)

- **3,761-line single file.** [2/4 info] Doesn't block launch; flagged for later split.
- **No visible "search settings" field above the fold even though the search filter exists in code.** [1/4] Surface the search.
- **Danger zone Delete-account copy: "Sign in before the deadline to cancel" has no subject.** [1/4] "Deletion runs after a 30-day grace period. You can cancel by signing back in before then."
- **"Sign out of every other session" button label is long and doesn't match the card title ("Sign out everywhere else").** [1/4] Match the card title.
- **No "this cannot be undone" at the card level on Delete-account — only inside the confirm dialog.** [1/4] Put it on the card so users see it before clicking.
- **Alert labels "Expert answered me" reads awkwardly.** [1/4] "Expert answers" or "An expert answered you".
- **Password change action probably silent on success; audit toast coverage.** [1/4]
- **Inconsistent use of `F.sm`, `F.xs`, `F.md` alongside raw `11` literals in some rows.** [1/4] Audit and align.
- **Breakpoint where responsive bites:** 720 (matchMedia cutoff — the ONLY matchMedia page in public web; consistent with Top #4).

### Family / kids parent side `/profile/family`, `/profile/kids`, `/profile/kids/[id]`

- **Remove-profile confirm copy reads as a threat ("Reading history and score for 'X' will be lost. This cannot be undone.").** [1/4] "Removing X erases their reading history and score. There's no undo."
- **Avatar color swatch 28×28 below 44pt hit target.** [1/4] Wrap in 44×44 touch frame.
- **Pause-change error "Could not change pause state".** [1/4] "Couldn't update the pause."
- **Kid parent dashboard activity empty copy is strong — keep.** [1/4 info]

### Social `/messages`, `/notifications`

- **`/messages` free-user silent redirect.** [2/4] Top #10.
- **`/messages` "Couldn't find the other participant." is accusatory.** [1/4] "Can't find the other user — refresh and try again."
- **`/messages` Report dialog copy is good; keep.** [1/4 info]
- **`/messages` user-search `No users found.`** [1/4] "No one matches that search. Try a different username."
- **`/messages` role filter "All Users" Title Case vs others sentence case.** [1/4] All sentence case.
- **`/messages` `verity_score` shown next to user without explanation.** [1/4] Tooltip or short descriptor.
- **`/messages` conversation view has no focus management when switching threads.** [1/4] Add focus restoration.
- **`/messages` empty states are generic ("No messages yet" twice).** [1/4] List: "No conversations yet. Message an expert, author, or friend to start." Thread: "Say hi. They'll see your first message when they open the chat."
- **`/messages` two-pane stays `maxWidth: 720` with no expansion ≥768.** [1/4] Let the panel grow; or keep at 720 and own the decision.
- **`/messages` avatar sizes 28 AND 44 on the same screen.** [1/4] Pick one per row type.
- **`/messages` "..." menu trigger and "Back"/"New" buttons fail 44pt.** [2/4] Fix.
- **`/notifications` anon empty state is the gold standard — USE as a template elsewhere.** [3/4 info]
- **`/notifications` `[!]` monospace icon reads as error.** [2/4] Swap for a small SVG bell or different glyph.
- **`/notifications` badge renders raw DB enum ("BREAKING_NEWS").** [2/4] Humanize: "Breaking news", "Reply", "@mention".
- **`/notifications` null `action_url` → `href="#"` causes scroll jump on click.** [1/4] Disable the link or point to the entity.
- **`/notifications` "Could not load notifications ({n})." surfaces a status code.** [1/4] Strip the status in production. Log it.
- **`/notifications` "Preferences" button could be labeled "Settings" since that's where it goes.** [1/4]
- **`/notifications` empty dead screen even with good copy — no CTA, no visual.** [1/4] Add a preferences link or a "Back to home" CTA.

### Feature `/bookmarks`, `/expert-queue`, `/appeal`

- **`/bookmarks` double header.** [2/4] Drop the wordmark.
- **`/bookmarks` H1 `Saved Stories · 2 of 10` — concept name mismatch with URL and nav ("Bookmarks").** [2/4] H1 = **Bookmarks**. Subtitle = "2 of 10 saved".
- **`/bookmarks` cap banner smart-quote + "You've hit the free bookmark cap".** [2/4] Rewrite: "Free plan limit reached. Upgrade to save unlimited articles."
- **`/bookmarks` "+ Collection" button.** [2/4] "New collection".
- **`/bookmarks` "Export JSON" is technical.** [1/4] "Download my bookmarks".
- **`/bookmarks` individual remove is onClick with no confirm, no undo.** [2/4] Add undo toast (5-second window). Silent deletion without undo violates our destructive-action pattern.
- **`/bookmarks` empty CTA "Browse articles" goes to `/`, not `/browse`.** [1/4] Fix or rename the button.
- **`/bookmarks` "View plans →" arrow convention is inconsistent with the rest of the app.** [1/4] Arrows everywhere or nowhere.
- **`/bookmarks` loading is text, not skeleton.** [2/4] Skeleton rows.
- **`/expert-queue` empty state is generic.** [1/4] "No questions from readers yet. Answered questions appear here."
- **`/appeal` has two near-identical empty states ("no penalty" page + in-list empty).** [1/4] Kill one.
- **`/appeal` subhead is wordy.** [1/4] "File one appeal per penalty. Approved appeals reverse the action."
- **`/appeal` status chip capitalization is inconsistent.** [1/4]
- **`/appeal` error "Appeal failed".** [1/4] "Couldn't file your appeal. Try again."

### Static / marketing `/help`, `/how-it-works`, `/status`, `/privacy`, `/terms`, `/cookies`, `/dmca`, `/accessibility`

- **Triple header on every one of these pages.** [4/4] Top #11.
- **`/help` heading "Help & Support" + subhead "Questions? We are here." — drop "& Support" and rewrite subhead.** [1/4] H1 = "Help". Subhead = "Answers, account help, and a way to reach us."
- **`/help` FAQs rendered as a wall of `<h3>`s — no `<details>`, no anchors, no search.** [1/4] Refactor to a proper accordion with anchors and optional in-page search.
- **`/how-it-works` step copy ("Contribute fact-checks", "distinguish facts from opinions") is heavy marketing vs `/help`'s sparse tone.** [1/4] Pick one voice.
- **`/how-it-works` "Get Started" button Title Case.** [1/4] Sentence case.
- **`/status` "System Status" + "All Systems Operational" / "Some Systems Experiencing Issues" Title Case.** [1/4] Sentence case across.
- **Policy page titles inconsistent Title Case.** [1/4] Sentence case: "Privacy policy", "Terms of service", "Cookie policy", "DMCA policy", "Accessibility statement".

### Admin console `/admin/**`

Admin is locked code-wise — audit is observational. Doesn't block launch.

- **"System & Infrastructure" vs "Runtime Settings" vs "Settings & Features" — three labels, similar jobs.** [1/4] Consolidate nomenclature.
- **`PageHeader` Title Case ("Webhook & Integration Logs") vs tabs sentence case ("Status", "Events", "Health").** [1/4] Sentence case.
- **`KBD` keyboard-hint chips have no `title` attribute.** [1/4] Tooltip: "Press G then A".
- **Admin uses a light palette (`ADMIN_C_LIGHT`); public uses dark. Cross-navigation is abrupt.** [1/4] Thin accent (amber top border) to signal "you're in admin" beyond the "Back to site" banner.
- **Users list truncates columns at 960 max-width.** [1/4 info] Consider fluid width on list-heavy admin pages above 1280.

### Kids web `/kids`, `/kids/story/[slug]`, `/kids/leaderboard`, `/kids/expert-sessions`, `/kids/expert-sessions/[id]`, `/kids/profile`

- **Copy voice across kids is warm, active, age-appropriate — keep.** [3/4 info] "Verity Post Kids", "Who is reading today?", "Hi, {name}! What do you want to explore today?", "No stories here yet. Try another category — new stories show up here as we add them." Use these as the template for all friendly empty states.
- **"Needs parent setup" in red uppercase when `pin_hash` is null is clear.** [2/4 info]
- **"Ask a Grown-Up" gate copy — keep, it's excellent for audience.** [2/4 info]
- **Kid tab bar uses per-profile accent via `Kid.tabAccent(for: auth.activeChildProfile)`. Orange profile `#f59e0b` on white bar creates 2.8:1 contrast on the active label.** [1/4] Auto-darken the profile color when below 3:1 contrast for active-state text.
- **Kid avatars at 72×72 with `borderRadius: 36` (half-round) vs adult avatars at 80×80 with `borderRadius: '50%'` — same intent, two encodings.** [1/4] Pick one encoding pattern.
- **Kid story page was not deep-read in any audit.** [1/4 info] Typical risk area: reading-time timer position, TTS control placement, exit-to-parent PIN flow. Schedule a pass.
- **Kids shadow token `KID.shadow` is the only shadow token in the app; adult surfaces hand-code shadows.** [1/4] Extend the token set to adult surfaces.
- **Kid profile page empty states ("No badges yet", "Nothing saved yet").** [1/4] Add a next step: "Read a story or pass a quiz to earn your first badge."
- **`/kids` profile picker `maxWidth: 440` on a 320 screen → horizontal scroll/overflow.** [1/4] Breakpoint where responsive bites: 320.
- **Kids layout lives inside adult layout shell; tab bar swaps contextually — works, but document the rule.** [1/4 info]

### iOS `VerityPost/VerityPost/*.swift` (38 views)

- **No Dynamic Type anywhere.** [4/4] Top #1. App Store accessibility blocker.
- **No `.accessibilityLabel` on icon-only buttons.** [2/4] Top #1. `Image(systemName: "xmark")` on the session-expired banner has no `.accessibilityLabel("Dismiss")`. Sweep every icon button.
- **`.preferredColorScheme(.light)` forced in `ContentView` AND `LoginView`.** [1/4] Top #1. Remove. Move hex colors to asset catalog with dark variants.
- **`VP.bg = Color.white`, `VP.text = Color(hex: "111111")` — hardcoded, no semantic binding.** [1/4] Asset catalog.
- **`TextTabBar` ~42pt — borderline HIG fail.** [3/4] Top #9.
- **Session-expired banner "X" at 10pt with no 44pt frame.** [2/4] Top #9.
- **`SignInGate` "Create account" bare text link; `LoginView`/`SignupView` "Forgot password?" bare text links.** [1/4] Top #9.
- **Tab labels inconsistent with web: iOS "Log In" tab vs web "Sign in" link.** [3/4] Top #2.
- **`LoginView` error state is raw `Text(err)` with no `.accessibilityLabel` or `UIAccessibility.post(.announcement, ...)`.** [1/4] VoiceOver users get nothing.
- **No `@Environment(\.accessibilityReduceMotion)` reads anywhere; SwiftUI `withAnimation` runs unconditionally.** [1/4]
- **No `.accessibilityAddTraits(.isHeader)` on any screen h1 equivalent.** [1/4] VoiceOver rotor has no headings.
- **`LoginView` presents `.sheet` for forgot-password but `.fullScreenCover` for signup.** [1/4] Pick one.
- **`ContentView` splash has `ProgressView` but no `UIAccessibility.post` announcement.** [1/4]
- **iOS sizes used: 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28 hardcoded.** [2/4] Consolidate to the 7-step scale AND use relative sizing.
- **LoginView / SignupView use `Color.black` instead of `VP.accent`.** [1/4] Route through tokens.
- **`HomeView` and `StoryDetailView` lack explicit top safe-area handling for the dynamic island.** [1/4 info] Verify scroll behavior on notched devices.
- **Confirm `.refreshable` is wired on LeaderboardView, ProfileView, NotificationsView.** [1/4] Audit.
- **`KidTabBar` padding unchecked for 44pt.** [1/4] Verify.
- **iOS signup tagline "Create your account" is cleaner than web's stacked "Join Verity Post" + "News you can trust — create your free account".** [1/4] Adopt iOS pattern on web.
- **Share with web: every shared string (Sign in, Sign up, Create free account, password rules, error messages) must live in one table, consumed by both clients.** [2/4]

---

## Cross-cutting findings (seen in 2+ surfaces)

### Copy / voice / microcopy

- **"Failed to X. Please try again."** appears 12+ times across auth, story, messages, notifications, bookmarks, appeals. Replace every instance with "Couldn't X. [Specific next step]." Drop "Please".
- **"Something went wrong"** — vague error across profile load, messages load. Rewrite with specific next step.
- **"Invalid credentials"** — cold and accusatory. Replace with "That email and password don't match. Check spelling or reset your password."
- **Title Case creep** on buttons, section headers, tab names. Lock sentence case for every product surface. Title Case reserved for proper nouns and legal-document names.
- **"Log in" vs "Sign in" vs "Login"** — Sign in wins product-wide.
- **"Saved Stories" / "Bookmarks" / "Saved articles"** — Bookmarks wins.
- **"Source" filter vs story "sources"** — Publisher wins for the filter; cited source for story body.
- **Empty states are 80% informational.** Every empty state must explain what fills it and offer a next action.
- **Punctuation drift** — smart quotes `'`, HTML entity `&apos;`, ASCII `'` all in use. Pick one and sweep.
- **Ellipses** — `...` vs `…` mixed. Use `…`.
- **Arrows** — `→` vs `&rarr;` vs `›` mixed. Use `→`.
- **"Please"** — drop it everywhere.

### Typography / spacing / visual system

- **7-step type scale** (11/13/15/17/20/24/32) replaces 21 sizes across platforms.
- **3 weights** (400/600/700) replaces 5.
- **Spacing scale 4/8/12/16/24/32/48/64** — no 5/6/7/10/14/18/20/26/28 paddings.
- **Radius scale 4/8/12/20/999** — delete 21 other values.
- **Shadow scale sm/md/lg** — delete ad-hoc shadow strings.
- **Avatar sizes 32/48/80** — delete 10 other sizes.
- **Letter-spacing** — standardize at `-0.01em` (display 20+), `0` (body), `0.05em` (uppercase badges). Kill 0.03 / 0.06 / 0.1.
- **Badges** — one treatment: uppercase 11px, weight 700, tracking 0.05em, padding 2×8, radius 4, tinted bg at 12% of semantic color.
- **Button system** — primary / secondary / tertiary / pill. One definition each. Pills only for filters, never for verbs.

### Information architecture / navigation

- **Bottom nav omits Search, Bookmarks, Messages, Browse.** Reorder by actual usage.
- **Home has a second sticky nav duplicating the global one.** Remove.
- **Three admin groups sound like they do the same thing** ("System & Infrastructure" / "Runtime Settings" / "Settings & Features"). Consolidate.
- **"Browse {X}" CTA collides with `/browse` as a feature.** Rename drill CTAs to "See all {X} articles".
- **Onboarding step indicators are out of sync** across signup / pick-username / welcome.
- **Reg-wall + paywall + cap banner** each have their own upgrade story. Unify under one plan-comparison moment on `/browse/plans` (or similar).

### Accessibility (both platforms)

- **Every page needs a unique `<title>`.**
- **Every web `<button>` and `<a>` relies on the global `:focus-visible` ring. Multiple components override inline.** Fix.
- **Every disabled button explains why** (aria-describedby + tooltip).
- **Every modal supports Escape + backdrop dismiss (unless destructive) + visible close + focus return to trigger.** Today 3 of ~10 modals do this.
- **Every iOS view needs Dynamic Type + `.accessibilityLabel` on icon buttons + `.accessibilityAddTraits(.isHeader)` on headings + `UIAccessibility.post(.announcement)` for error state changes.**
- **Reduce-motion honored on web via globals.css; not honored on iOS.** Fix iOS.
- **Color contrast:** `#666` hardcoded on `#f7f7f7` = 4.47:1 (fails AA). Migrate to `--dim: #5a5a5a`.
- **"At cap (10)" disabled button is `#ccc` on white — fails badly.** Stronger disabled treatment.
- **Bottom nav `<nav>` has no `aria-label`.** Add one.
- **Breaking banner lacks a role.** It's a headline; make it a link.
- **Horizontal-scroll category strip lacks arrow-key nav / `aria-roledescription="carousel"`.**
- **`/` and `/login`/`/signup` form error divs are inconsistent — login has `role="alert"`, signup doesn't.**

### Responsive behavior

- **320px** — signup card tight; home category pill strip overflows with no fade; story action row wraps unpredictably; kids profile picker overflows; messages list avatar+badge collide.
- **375px** — mostly fine; story action row still wraps; story page padding inconsistent between states.
- **390–430px (modern iPhones)** — fine, minor 420 card centered-dialog feel.
- **768px (iPad portrait)** — leaderboard 800 vs home 680 creates content-width jumps; messages stays 720 with visible side rails; admin cards at auto-fill 220 renders 3 columns.
- **1024px** — story desktop layout activates at 1025 (edge-case media query); home feed still 680 in a 1024 viewport; admin breathes; everywhere else feels empty on the sides.
- **1440px** — public pages are mobile-in-a-void. Admin fluid. Story page 960 with 65ch column still acceptable.
- **1920px** — top bar stretches wall-to-wall, bottom nav stretches, banners stretch, content stays at 680–960. Broken intent.

### iOS-specific system debt

- **Dynamic Type** — zero coverage. Blocker for App Store accessibility.
- **Forced light mode** — `.preferredColorScheme(.light)` global + redundant per-view overrides.
- **Hardcoded hex colors** — no asset catalog, no dark variants.
- **Accessibility labels** — missing on every icon button.
- **Headings** — `.accessibilityAddTraits(.isHeader)` absent.
- **Error announcements** — `UIAccessibility.post` never called.
- **Reduce-motion** — no `@Environment(\.accessibilityReduceMotion)` reads.
- **Touch targets** — session banner X, bare-text "Create account", bare-text "Forgot password?" fail.
- **Presentation inconsistency** — `.sheet` for forgot vs `.fullScreenCover` for signup.
- **Pull-to-refresh coverage** — audit leaderboard, profile, notifications.
- **Safe-area top** — verify `StoryDetailView` doesn't render under the dynamic island on scroll.
- **Tab-bar active-state weight flip** — 500→700 causes reflow; use color shift at constant 600.

---

## Consistency matrix — same concept, different words

| Concept | Variants found across surfaces | Pick |
|---|---|---|
| Sign-in action | "Sign in", "Sign In", "Log In", "Log in", "Login", "Signing in..." | **Sign in** |
| Sign-up action (nav/link) | "Sign up", "Sign Up", "Sign Up Free", "Sign up free", "Join Verity Post" | **Sign up** |
| Sign-up action (primary button) | "Create Account", "Create free account", "Sign Up Free", "Join Verity Post" | **Create free account** |
| Sign-out action | "Sign out", "Log out", "Sign out of every other session" | **Sign out** (card button matches card title: "Sign out everywhere else") |
| Saved article | "Saved Stories", "Bookmarks", "Saved articles", "Saved" | **Bookmarks** |
| Save action (verb) | "Save", "Saved" (button also acts as state toggle) | **Save** / toggle to **Saved** — or pick both as actions ("Save" / "Unsave") product-wide |
| Category vs Topic | "Category", "Topic", "Areas of expertise" | **Category** (public), **Topic** (discussion), **Expertise area** (expert profile) |
| Source vs Publisher | "Source" filter, "Source publisher", "Publisher" | **Publisher** (filter), **Cited source** (story body) |
| Kids profile | "Kid profile", "Kids profile", "Supervised kid profile" | **Kid profile** (singular) / **Kids Mode** (feature name) |
| Upgrade copy | "Upgrade", "Subscribe", "View plans", "Resubscribe" | **Upgrade** (free→paid), **Resubscribe** (returning), **Change plan** (tier swap), **View plans** (informational CTA) |
| Streak | "Current streak", "Streak", "Day X streak", "Day X" | **Day X streak** first render; **Day X** thereafter |
| Verify cooldown label | "Resend Email", "Resend in Xs", "Sending..." | **Resend email** / **Resend in Xs** / **Sending…** (all sentence) |
| Back to home | "Back to home", "← Back to login", "Back" | **Back to home** (explicit); **Back** only with step context |
| Notification channels | ad-hoc | **Push notifications / In-app / Email** |
| Settings | "Settings", "Profile settings", "Account settings", "Preferences" | **Settings** (top-level), **Preferences** (subsection) |
| Browse drill CTA | "Browse {X}", "View all {X} articles" | **See all {X} articles** |
| Top-level policy names | "Privacy Policy", "Privacy policy", ... | Sentence case: **Privacy policy, Terms of service, Cookie policy, DMCA policy, Accessibility statement** |
| Advanced filters | "Source", "Slug" (developer term) | Rename "Slug" → **URL** or remove for users |
| Notification badge enum | `BREAKING_NEWS`, `REPLY`, `MENTION` | **Breaking news, Reply, @mention** |
| Breaking treatment | banner red #ef4444 / badge red #ef4444 / story pill #b91c1c | **Single Breaking chip** at 12% tint of `--danger` `#b91c1c` |

---

## Empty-state rewrite catalog

| Surface | Current | Rewrite |
|---|---|---|
| `/` no articles | `No articles found.` | `Nothing matches this filter. Try All, or switch categories.` |
| `/` loading | `Loading articles...` | Replace with skeleton cards. If text must stay: `Loading…` |
| `/search` | `No matches. Try a different keyword.` | Keep. |
| `/bookmarks` | `No saved articles here` | `You haven't saved anything yet. Tap Save on any article to find it here later.` |
| `/bookmarks` target mismatch | `Browse articles` → `/` | Point to `/browse`, or rename to `Open home feed`. |
| `/messages` list | `No messages yet` | `No conversations yet. Message an expert, author, or friend to get started.` |
| `/messages` thread | `No messages yet. Start the conversation.` | `Say hi. They'll see your first message when they open the chat.` |
| `/messages` search | `No users found.` | `No one matches that search. Try a different username.` |
| `/notifications` all | current copy | Keep — gold standard. |
| `/notifications` unread | `You're all caught up.` | Keep. |
| `/profile` activity | current copy | Keep. |
| `/profile` categories | current copy | Keep. |
| `/profile` milestones | current copy | Keep. |
| `/browse` no category match | `No categories found.` | `No categories match that search.` |
| `/browse` zero articles in category | `No articles yet.` | `No articles in this category yet. New stories arrive daily.` |
| Category contributors | `No contributors yet.` | `No active contributors in this category yet.` |
| `/story` timeline | `No timeline yet.` | `No timeline for this story yet — check back as it develops.` |
| `/expert-queue` | `No messages yet.` | `No questions from readers yet. Answered questions appear here.` |
| `/kids` no profiles | current | Keep. |
| `/kids` stories empty | current | Keep. |
| `/kids/profile` badges | `No badges yet` | `No badges yet. Read a story or pass a quiz to earn your first.` |
| `/kids/profile` saved | `Nothing saved yet` | Keep. |
| Kid parent dash activity | current | Keep. |
| Kid sessions | `No sessions scheduled right now.` | Keep. |
| Kid quiz activity | `No quiz activity yet.` | Keep. |
| Kid achievements | `Nothing earned yet.` | Keep. |
| `/appeal` no penalties | duplicated two ways | Keep only one: `No active penalties. Nothing to appeal.` |
| `/card/[username]` not found | `No user found.` | `We couldn't find that user. The username may have changed.` |
| Home search verify gate | `Verify your email to search articles.` | `Search is for verified readers. Confirm your email to unlock it — takes 30 seconds.` |

---

## Error-message rewrite catalog

| Surface | Current | Rewrite |
|---|---|---|
| `/login` | `Invalid credentials` | `That email and password don't match. Check the spelling or reset your password.` |
| `/login` network | `Network error. Please try again.` | `Can't reach the network. Check your connection and try again.` |
| `/login` lockout | `Too many failed attempts. Try again after X.` | Keep — but add inline "Forgot password?" link. |
| `/signup` create | `Failed to create account. Please try again.` | `Couldn't create your account. Check your details and try again.` |
| `/signup` email taken | `An account already exists for that email. Log in instead.` | `That email already has an account. Sign in instead.` |
| `/signup/pick-username` | `Failed to save username. Please try again.` | `Couldn't save that username. Try again.` |
| `/reset-password` | `Failed to update password. Please try again.` | `Couldn't update your password. Try again.` |
| `/verify-email` resend | `Failed to resend email. Please try again.` | `Couldn't send the email. Try again in a moment.` |
| `/verify-email` rate | `Too many verification resends. Try again in an hour.` | `You've hit the resend limit. Try again in an hour.` |
| `/verify-email` email change | `Too many email-change attempts. Try again later.` | `Too many email-change attempts. Try again in an hour.` |
| `/signup/expert` | `Failed to submit application. Please try again.` | `Couldn't submit your application. Try again.` |
| `/story` load | `Failed to load article. Please try again.` | `Couldn't load this article. Refresh or try again.` |
| `/story` save bookmark | `Could not save bookmark. Please try again.` | `Couldn't save this bookmark.` (if over cap: `You've hit the free bookmark limit.`) |
| `/story` remove bookmark | `Could not remove bookmark. Please try again.` | `Couldn't remove this bookmark. Try again.` |
| `/profile` load | `Something went wrong` | `Couldn't load your profile. Refresh to try again.` |
| `/notifications` | `Could not load notifications (X).` | `Couldn't load notifications. Try again.` (strip status code) |
| `/messages` load | `Couldn't load messages` + `Something went wrong loading your messages.` | `Couldn't load your messages. Refresh and try again.` |
| `/messages` block | `Could not block this user. Please try again.` | `Couldn't block this user. Try again.` |
| `/messages` report | `Could not submit report. Please try again.` | `Couldn't send your report. Try again.` |
| `/messages` participant | `Could not find the other participant.` | `Can't find the other user — refresh and try again.` |
| `/profile/kids` | `Could not change pause state` | `Couldn't update the pause.` |
| `/appeal` | `Appeal failed` | `Couldn't file your appeal. Try again.` |
| Passwords mismatch | `Passwords do not match.` / `Passwords don't match` | `Passwords don't match.` |
| Resend home banner | `Could not send. Try again later.` | `Couldn't send the email. Try again in a moment.` |

---

## Design principles to codify going forward

### Copy

1. **Active voice only in product surfaces.** Passive voice okay in legal pages; never in buttons, errors, or microcopy.
2. **Verbs on buttons, sentence case.** "Sign in", "Sign up", "Create free account", "Save article", "Copy link". Never "Submission", never "Sign In", never "Sign Up Free".
3. **One concept, one label, product-wide.** Pick once, enforce via shared string table consumed by web + iOS + email + push.
4. **Errors explain the fix.** "Try again" alone is acceptable only when there's nothing else to do. Otherwise: "Check your spelling", "Check your connection", "You've hit the free limit".
5. **No "Please" in microcopy.** Performative politeness — always drop.
6. **Empty states explain what goes there + how to fill it.** Never just "No X yet." — always "No X yet. Do Y to see them here."
7. **Sentence case for all UI.** Title Case reserved for proper nouns (Verity Post, Apple, Google) and legal document names.
8. **Brand wordmarks once per page.** NavWrapper owns brand. Auth cards own brand when NavWrapper is hidden. Never both.

### Typography

1. **One type scale: 11 / 13 / 15 / 17 / 20 / 24 / 32.** Seven sizes max. Anything else is a bug.
2. **Three weights: 400 / 600 / 700.** Drop 500, 800, 900.
3. **Letter-spacing: `-0.01em` (display 20+), `0` (body), `0.05em` (uppercase badges).** Nothing else.
4. **iOS uses semantic text styles + `@ScaledMetric` for numeric sizes.** No raw `.system(size: N)`.

### Color + tokens

1. **Import from `@/lib/tokens` on web and `VP.*` on iOS.** Never redeclare inline. Delete every `const C = {...}`.
2. **iOS colors live in asset catalog** with explicit light and dark variants.
3. **Danger is `#b91c1c`, dim is `#5a5a5a`.** Not `#ef4444`, not `#666`.
4. **One accent (`#111`).** Not "#000", not "`Color.black`" sprinkled inline.
5. **Semantic color families scoped to their surface.** Tier colors live on leaderboard + profile; category pastels live on browse; kid per-profile accents stay in kids. Don't leak into the home feed.

### Layout

1. **Touch targets ≥44×44 on mobile. Always.** Primary buttons 44h; secondary pills 36h when inline, 44 when standalone. Dev-lint enforcement.
2. **Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.**
3. **Radius scale: 4 / 8 / 12 / 20 / 999.**
4. **Container widths: 480 (form) / 720 (feed) / 960 (admin + story).** Pick one per page, stop inventing.
5. **Max-width for reading surfaces 680px (article content column at 65ch).** Dashboards 960+.
6. **Breakpoints: 768 / 1024 / 1440.** Every route must widen its column or add a sidebar at ≥1024.
7. **Shadows: `sm` / `md` / `lg`.** Three defined strings. Kill ad-hoc.
8. **Avatars: 32 / 48 / 80.** Three sizes total.

### Engagement

1. **Every empty state has a CTA** — a verb button pointing to the filling action.
2. **Every error explains the fix.** Not "Something went wrong" — "We couldn't send that. Check your connection and try again."
3. **Every destructive action has a ConfirmDialog + an undo toast within 5 seconds.** No silent deletes anywhere.
4. **Every modal supports three dismissal paths**: Escape key, backdrop click (unless destructive), visible close button. Focus returns to the trigger on close.
5. **Every loading state uses a skeleton of the content it replaces.** One `Skeleton` component, reused. Text spinners are for network fetches, not initial loads.
6. **Every disabled button explains why** (tooltip + `aria-describedby`).
7. **Every paywall sells the plan.** The page behind the wall is the teaser; the wall itself surfaces what the plan unlocks.

### Accessibility

1. **Every SwiftUI view with icon-only buttons has `accessibilityLabel` + `accessibilityHint`.**
2. **Every web `<button>` respects the global `:focus-visible` ring.** No inline `outline: none` overrides driven by React state.
3. **Every page has a unique, descriptive `<title>`.** Format: `[Page name] · Verity Post`.
4. **Every iOS view declares headings via `.accessibilityAddTraits(.isHeader)`.**
5. **Every iOS error posts `UIAccessibility.post(.announcement, ...)`.**
6. **Every SwiftUI view honors `@Environment(\.accessibilityReduceMotion)`.**
7. **Color contrast AA minimum: 4.5:1 normal text, 3:1 large text.** Auto-darken kid per-profile accents below 3:1 when used for active-state text.
8. **Every `<nav>` has `aria-label`.**
9. **Every modal traps focus.**
10. **Every horizontal-scroll carousel gets `aria-roledescription="carousel"` + arrow-key navigation.**

---

## Implementation roadmap (suggested order)

### Phase A — "Won't ship without these" (estimated 1–2 days)

1. iOS Dynamic Type + accessibility labels + remove forced light mode.
2. Unify Sign in / Sign up / Create free account across every surface.
3. Page-level `<title>` per route on web.
4. Fix story regwall: unified label, icon close button, focus trap, Escape, backdrop dismiss.
5. Fix `/login` error copy + `/signup` label `htmlFor` / error `role="alert"`.
6. Remove double header on home + triple header on static pages.
7. `/messages` free-user silent redirect → in-page explainer.
8. Bump all sub-44pt touch targets (web pills, icon buttons, iOS tab bar + banners + bare-text buttons).

### Phase B — "Ship with these quickly after launch" (3–5 days)

1. Consolidate inline `const C` into `@/lib/tokens`; iOS into asset catalog.
2. Collapse type scale, weight set, radius set, avatar set, shadow set, container widths.
3. Unified Breaking chip; make the home breaking banner a link.
4. Skeleton loaders for home, bookmarks, messages, story, kids.
5. Empty-state rewrite catalog (every surface).
6. Error-message rewrite catalog (every surface).
7. Nav bar reorder (Home / Browse / Bookmarks / Notifications / Profile).
8. Story paywall sells the plan; upgrade routes to `/browse/plans` not `/profile/settings/billing`.
9. Bookmarks: H1 = Bookmarks, undo toast on remove, skeleton loader, empty CTA points to `/browse`.
10. `/welcome` copy + click-to-advance + keyboard nav + skip affordance.
11. Add focus trap + Escape + backdrop dismiss to every modal; focus return to trigger on close.
12. Kid per-profile accent auto-darken below 3:1.
13. Unify kid avatar encoding; extend shadow tokens to adult surfaces.

### Phase C — "Quarterly polish" (ongoing)

1. Responsive overhaul: pick three breakpoints; every route widens or adds sidebar ≥1024.
2. Admin nomenclature consolidation (Features / Settings / Runtime).
3. `/help` FAQ → accordion + anchors + in-page search.
4. OG image per category/leaderboard/profile/kids; `summary_large_image` Twitter.
5. Shared string table consumed by web + iOS + email + push.
6. Split `/profile/settings` monolithic file.
7. Story paywall: plan comparison UI on `/browse/plans`.
8. Linear-style `?` keyboard shortcut help panel on `/profile`.

---

## Out of scope for this audit (flagged for product / owner decision)

- Should iOS support dark mode? (Enables a real migration, not just "remove the override".)
- Is `/card/[username]` a public share surface or gated profile card? (Audit behavior assumes public; confirm.)
- Is Rising Stars / Weekly on `/leaderboard` meant as a separate tab type or a time window? (Owner decides the IA.)
- Should `/signup/pick-username` be required at signup rather than skippable? (Impacts onboarding path.)
- Should home feed widen to grid on desktop, or stay single-column by design? (Brand decision.)
- Should `/kids` story reader share the adult reading pattern (TTS, bookmark, share) or use a kid-specific set? (Product decision; Peer audits flagged as risk area not audited.)
- Should the admin panel get a visible "you're in admin" treatment (amber accent) beyond the current bottom banner? (Internal-UX trade-off.)
- Are Verifier / Reader / Rising Star / Luminary / Newcomer / Contributor / Trusted / Distinguished tier names the right ladder? (Mixed demographic + honorific + role terms — recommend all activity-based OR all honorific, not mixed.)

---

## Auditor agreement summary

4 auditors covered the same product independently. Issues flagged by multiple auditors:

- **4/4 agreement:** 7 items — iOS Dynamic Type/accessibility, Sign in/up casing mess, touch targets below 44pt, double/triple header on static pages, inline `const C` palette duplication, story regwall label + close issues, empty-states 80% informational.
- **3/4 agreement:** 12 items — responsive breakpoint failure 1024–1920, double header on home, type-scale sprawl, story action row crowding, Breaking-treatment inconsistency, iOS tab bar 44pt, error-message system voice, kids empty-state pattern as gold standard, sign-in label drift on iOS specifically, bookmarks double header + title, loading state inconsistency (text vs skeleton), paywall/upgrade story fragmentation.
- **2/4 agreement:** ~28 items — card-width sprawl, welcome skip affordance, verify-email redundancy, reset-password tone, browse filter title case, leaderboard Weekly tab, admin naming overlap, bookmarks remove-no-undo, messages silent redirect, notifications badge enum, LockedTab copy, profile "My stuff" casual tone, kid avatar encoding, iOS `Color.black` vs `VP.accent`, messages avatar size mix, notifications empty dead screen, and more.
- **Solo findings (1/4):** ~40+ items, kept when defensible, dropped when pure preference. Notable solo items kept: per-page `<title>` (Peer 3), nav bar reorder (Peer 3), home breaking banner not a link (Peer 3), `/signup` label `htmlFor` missing (Peer 3), radius/avatar/shadow sprawl (Peer 2), `/help` FAQ accordion (Peer 3), OG `summary_large_image` (Peer 3), `FEATURED_COLORS` arbitrary (Lead), browse `CAT_STYLE` empty icons (Lead).

The high-confidence 4/4 and 3/4 items are where you get the most per-fix lift. Attack Top 20 in order — 17 of the 20 come from 3/4 or 4/4 agreement.

---

## iOS runtime fixes — do not forget

Carried from a separate iOS code review (2026-04-19). These are not UI polish — they're real runtime correctness issues. Keep them visible so they don't slip past launch.

### Definitely fix (small, real bugs)

1. **`StoreManager.listenForTransactions` — `transaction.finish()` skipped on sync failure.** Current flow: `await syncPurchaseToServer(...)` then `await transaction.finish()`. If the sync throws, finish never runs and Apple redelivers the transaction on every launch (infinite retry). **Fix**: move `transaction.finish()` into a `defer` (or always-fire branch) so it runs regardless of sync outcome. Server-side idempotency on `iap_transactions.original_transaction_id` already handles double-sync. File: `VerityPost/VerityPost/StoreManager.swift:168-190`.

2. **`MessagesView` — realtime subscriptions never torn down.** `.task` starts Supabase channel subscriptions but nothing stops them on `.onDisappear`. Channels accumulate as the user navigates in and out. **Fix**: explicit cleanup block on disappear (or capture the channel handle and `.unsubscribe()` in a `defer` / task-cancellation path). File: `VerityPost/VerityPost/MessagesView.swift:120-122` + 571-577 + 735-741 (three channel sites).

3. **`NotificationsSettingsView.save()` — metadata write not atomic.** Reads existing `metadata`, merges, re-writes via `update_own_profile` RPC. If the user toggles settings rapidly, two concurrent read-merge-write cycles drop one update. **Fix**: send only the delta keys (not the full merged blob) — the RPC already does server-side `||` merge on `metadata` (added in Round 5 Item 2), so the client shouldn't pre-merge at all. File: `VerityPost/VerityPost/SettingsView.swift:904-938`.

4. **`AlertsView` — Manage tab still renders dead UI.** Subscription-topic writes are `#if false`-gated (schema can't support them yet), but the Manage tab still renders pickers that silently no-op. Crew 5 added a placeholder; confirm the dead pickers are fully hidden, not just the write paths. File: `VerityPost/VerityPost/AlertsView.swift:232-252`.

### Worth fixing if time

5. **`AuthViewModel` deep-link fragment parsing** — manual `#`/`&` splitting. Replace with `URLComponents(url:resolvingAgainstBaseURL:)`. File: `AuthViewModel.swift:296-303`.
6. **`PushRegistration.lastUserId` not cleared on logout** — previous user's device row stays attributed on the server after switch. Add `setCurrentUser(nil)` on logout + server-side delete of stale tokens. File: `PushRegistration.swift:18-22`.
7. **`SettingsService` — TTL updates on fetch success even when parse fails**; broken data cached for full interval. **Fix**: only set `lastFetch` after successful parse. File: `SettingsService.swift:22-27`.

### Post-launch refactor candidates (not bugs)

- DateFormatter + regex caching as static properties (`HomeView`, `StoryDetailView`, `ProfileView`, `KidViews`, `Models`, `Password`)
- Extract API calls from views into ViewModels (testability; not launch-blocking)
- Centralize bearer-token handling into a single API client (currently duplicated in `StoreManager`, `KidViews`, `FamilyViews`, `SubscriptionView`)
- De-duplicate quiz pass formula (`correct * 10 / max(total, 1) >= 7`) between `KidViews`, `FamilyViews`, `StoryDetailView`
- `ProfileView` milestones tab — 5 separate queries → one aggregation RPC
- `RecapQuizView` — 75+ `@State` properties → `@StateObject` ViewModel

### Dismissed — not acting on

- Alleged `StoryDetailView:362` array-index crash — reviewer misread; line 362 is a `Text("Listen")` Button label, no array access.
- "No in-flight guards on loads" (items #14, #15) — valid pattern concern in UIKit-era thinking but fine in SwiftUI async/await.
- "No certificate pinning" (#60) — overkill for an app that delegates payment to Stripe + Apple IAP.
