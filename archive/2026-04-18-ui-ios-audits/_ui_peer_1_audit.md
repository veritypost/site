# UI Peer Audit #1 — Verity Post
Date: 2026-04-19
Focus: copy + information hierarchy (independent, written before seeing the Lead or peer audits)

## Severity rubric

- P0 — breaks trust or comprehension the first time a user sees it. Wrong on-brand concept, accusatory error, locked empty state with no exit, or a button whose label does not match what it does.
- P1 — clearly fixable with a better word or order. User finishes the task but has to re-read, hesitate, or guess.
- P2 — polish. A stylistic inconsistency or weak microcopy that would survive launch but I would fix before a marketing push.
- P3 — nitpick. Wording I prefer; defensible either way.

## Top issues (ranked)

| # | Severity | Surface | Issue | Proposed fix |
|---|---|---|---|---|
| 1 | P0 | All auth pages | "Invalid credentials" is the only signal for bad password, unknown user, wrong username, and malformed input. It is terse, cold, and reads as accusatory. | "That email and password don't match. Check the spelling or reset your password." Keep it single-copy (no enumeration) but use human voice. |
| 2 | P0 | Home `/` search gate banner | "Verify your email to search articles." is clipped and missing the why. | "Search is for verified readers. Confirm your email to unlock it — takes 30 seconds." Pair with the Resend button already there. |
| 3 | P0 | `/profile` LockedTab fallback | Copy says "Verify your email or upgrade your plan to unlock this tab." even when the real reason is known. Button always says "Verify email" regardless of actual gate. | Branch on reason: if unverified → "Verify your email to see your activity"; if plan-gated → "This tab is part of Verity and above." Button label tracks the reason. |
| 4 | P0 | `/messages` billing dead-end | Free user visiting `/messages` is **redirected** to `/profile/settings/billing` with no context. | Show the in-page explainer (which already exists further down) instead of `router.replace`. Redirect-as-gate is a trust hit. |
| 5 | P1 | Signup CTA inconsistency | Button says "Create Account" but page says "Join Verity Post." Microcopy underneath says "create your free account." Three different verbs for one action. | Settle on "Create free account" button + "Create your account" H1 everywhere. |
| 6 | P1 | Signup vs iOS signup | Web says "News you can trust — create your free account." iOS says "Create your account." Web has age + terms copy, iOS matches but uses slightly different phrasing. | Canonicalize the signup tagline. Pick one. |
| 7 | P1 | Story page regwall / interstitial | "Sign up to keep reading" vs "Create your free account" vs "Start reading" — same concept, three labels. | One canonical: **"Create free account"** as the primary button across interstitials, regwalls, and empty states. |
| 8 | P1 | `/how-it-works` | H1 is "How It Works" with the logotype "Verity Post" stacked on top of it — double header. | Drop the logotype in the body; rely on nav branding. Keep H1 only. |
| 9 | P1 | `/help` | Heading reads "Help & Support" and subhead is "Questions? We are here." — the subhead is cute but vague. | "Answers, account help, and a way to reach us." Tells the user what the page contains. |
| 10 | P1 | `/welcome` copy | "Discussions are earned" / "Your Verity Score is a knowledge map" / "Streaks reward showing up" — titles are cryptic out of context. | Lead with the user benefit: "Earn your way into discussions", "See what you know", "Build a reading habit." |
| 11 | P1 | `/bookmarks` | Title "Saved Stories · 10 of 10" concatenates heading and counter; cap copy is `You've hit the free bookmark cap.` with smart-quote. | H1 = "Bookmarks". Move `10 of 10` to a subtitle. Cap copy: "You've saved 10 articles — the free limit. Upgrade to keep saving." |
| 12 | P1 | `/messages` "Messages" empty state | "No messages yet" twice (list and thread). Subtitle "Start a conversation with another user." is generic. | List empty: "No conversations yet. Message an expert, author, or friend to start." Thread empty: "Say hi. They'll see your first message when they open the chat." |
| 13 | P1 | `/notifications` empty state | "No notifications yet. When someone replies, mentions you, or an article breaks, it lands here." is good; "You're all caught up." is good. But the page subhead is the H1 "Notifications" with no explanation. | Sub-title under H1: "Replies, mentions, and breaking news you opted into." |
| 14 | P1 | `/reset-password` success | "Password updated! Your password has been changed. Redirecting you to login..." — three sentences saying one thing. | "Password updated. Signing you out of other devices and taking you to login." |
| 15 | P1 | `/verify-email` explainer | "Didn't get it?" block precedes the Resend button and duplicates its intent. | Remove the "Didn't get it?" card. Replace with one-liner under H1: "Check your spam folder. The link expires in 24 hours." The button is the action. |
| 16 | P1 | `/appeal` | Two empty states with almost identical copy: the "no penalty" page ("No active penalties / You do not have any active penalties…") AND the in-list empty state ("No penalties on your account. Nothing to appeal."). | Kill one. Page-level branch only. |
| 17 | P1 | `/profile/kids` remove-profile | "Reading history and score for "X" will be lost. This cannot be undone." — correct but reads as a threat. | "Removing X erases their reading history and score. There's no undo." Same info, less cop. |
| 18 | P1 | Signup password placeholder | Says "Create a strong password." Reset-password says the same. iOS says "Password" as the label and uses `PasswordPolicy.hint` as placeholder. | Use "Create a password" (drop "strong" — the requirements list handles strength). Keep placeholder short. |
| 19 | P1 | "Newcomer / Reader / Contributor / Trusted / Distinguished / Luminary" tier ladder | Tier names are inconsistent levels of formality ("Reader" is a role; "Luminary" is honorific; "Newcomer" is demographic). | Either all activity-based (Reader → Active Reader → Contributor → Expert → Top Contributor → Founder-tier) OR all honorific. Don't mix. |
| 20 | P1 | "Sign In" vs "Sign in" vs "Log in" vs "Login" | Login button `Sign In`; nav says `Sign in`; verify-email success says `Continue`; footer / links say `Sign in`. iOS says `Sign In`. Some flows say `Login`. | Canonical: **"Sign in"** (sentence case) everywhere, including the button. Never "Login" as a verb. Never "Log in" (chose Sign in for consistency with Sign up). |
| 21 | P2 | Pill label "Search by:" | Precedes four pills (Headline/Keyword/Slug/Quiz). "Slug" is developer jargon visible to end users. | Rename to "URL" or remove the Slug option from end-user search; it should be an admin feature. |
| 22 | P2 | CategoryBadge + breaking chip | UPPERCASE tiny badges stack next to each other — visually repetitive. | Pick one. If a story is breaking, the BREAKING chip is enough; drop the category badge when breaking is true. |
| 23 | P2 | "Check your email" confirmation copy | Forgot password says `If an account exists for j***@example.com we have sent a password reset link.` Long, awkward contraction. | "If that email has an account, we just sent a reset link. Expires in 1 hour." |
| 24 | P2 | "Start reading" button | Welcome carousel CTA says "Start reading" but the primary action everywhere else is "Browse articles" or "View all X articles". | Standardize to "Start reading" on entry flows, "Browse" on directory pages. The home feed button should say "Read now" or "Open feed". |
| 25 | P2 | "You've hit the free bookmark cap." | Smart quote + passive scold. | "Free plan limit reached. Upgrade to save unlimited articles." |
| 26 | P2 | Expert signup submitted copy | "Thanks, X. Our editorial team will review your application within 48 hours." is fine, but "In the meantime, you can browse Verity Post as a regular reader." calls out "regular" — which is implicit second-class framing. | "While we review, you can keep reading and using your account." Drop "regular reader." |
| 27 | P2 | Tooltip / aria-label for `x` dismiss on verify banner | The dismiss button is literally the string `"x"` — not an icon, not aria-labelled cleanly. | Use an SVG or a cross glyph and keep `aria-label="Dismiss"`. `x` as visible text reads as a typo. |
| 28 | P2 | Category drill-down CTA | `Browse {category.name}` lives inside the modal — fine. But the "View all {name} articles" button on `/browse` expansion says the same thing with different words. | Pick one: "View all Politics articles" or "Browse Politics" — site-wide. |
| 29 | P2 | Source filter label | Chip header says "Source:" then chips say publisher names. The word "Source" is often a euphemism for "where the story came from." Users might think it means the story's *cited sources*. | Rename to "Publisher." That's what the data is. |
| 30 | P3 | Copyright / legal footer consistency | `/privacy`, `/terms`, `/cookies`, `/dmca`, `/accessibility` use varying title case. | Settle on sentence case for all policy pages: "Privacy policy", "Terms of service", "Cookie policy", "DMCA policy", "Accessibility statement". |

## Findings by surface

### `/` (home feed)

- Double search entrypoints: the search SVG in the nav opens the overlay, but the `/search` page also exists. Decide which is canonical; having both confuses muscle memory.
- "Load more articles" is the right verb. Keep.
- "Day {n}" streak badge with no explanation is opaque on first render. Replace with "Day {n} streak" the first time a user sees it (new user only).
- The search verify banner text "Verify your email to search articles." is clipped. Expand to explain the gate and take credit for the service (see Top Issue 2).
- `"No articles found."` is the blank-filter empty state. Under what circumstance? The filter selector? A DB outage? Make it actionable: "No articles match this filter. Clear filters or pick a different category."
- Loading copy `Loading articles...` uses an ellipsis. Elsewhere the codebase uses the Unicode `…` glyph. Pick one site-wide.

### `/login`

- H1 "Welcome back" assumes a returning user. If someone lands here via a ?next= link on signup flow, it's jarring. Acceptable but worth a one-liner fallback.
- "Email or username" label is correct; placeholder `you@example.com or yourname` is good. Keep.
- `Invalid credentials` — see Top Issue 1. The security rationale for single-copy is fine, but the tone isn't.
- Lockout error `Too many failed attempts. Try again after {time}.` is good. Keep.
- Generic network error copy `Network error. Please try again.` — swap "Please try again" (over-polite) for `Try again when your connection is back.`

### `/signup`

- H1 "Join Verity Post" + subhead "News you can trust — create your free account" — two taglines fighting. Keep one.
- Email taken message: `An account already exists for that email. Log in instead.` — good. Microcopy consistency check: it says "Log in" here but button elsewhere says "Sign in." (Top Issue 20.)
- Passwords don't match uses `don&apos;t` — fine in output, but matches/mismatches could be more helpful: "Passwords match" (success) vs just "Passwords don't match" is imbalanced. Keep success confirmation.
- "Keep me signed in on this device." — good copy.
- Button says `Create Account` (title case) but heading is sentence case. Pick sentence case: `Create free account`.

### `/signup/expert`

- H1 "Apply as an Expert Contributor" — title case + "as an" is stilted. "Apply to be an expert" is crisper.
- Subhead on step 1: "Create your account first, then describe your expertise." Good.
- Subhead on step 2: "Help us verify your professional background." Good.
- "Sample responses" explainer: "Pick three topics you could answer as an expert on Verity Post, and draft a short representative reply for each (2–4 sentences)." — long and tells users to do three things in one sentence. Split: "Pick three topics you'd answer as an expert. For each, write a 2–4 sentence sample response."
- Success screen: "Application received!" — fine. "In the meantime, you can browse Verity Post as a regular reader." — drop "regular" (Top Issue 26).
- Footer link "Not an expert? Regular signup" — same word "regular" leaking. Say "Not an expert? Sign up as a reader."
- Expert queue warning yellow card mixes bold + non-bold awkwardly.

### `/signup/pick-username`

- H1 "Choose your username" — good.
- Subhead "This is how other readers will know you" — warm, correct.
- Availability states: `@name is available!` + `@name is already taken` + `@name is reserved and can't be used` — three different sentence structures. Align: "@name is available", "@name is taken", "@name is reserved".
- Suggestions label: `Suggestions` — ok. Could be `Try one of these` for warmth.
- "Skip for now" underline link + the `Continue` button is ok; but a user reading this after email verify might want to know *why* username matters. Add a sentence: "You can change this later in settings."

### `/verify-email`

- H1 "Verify your email" — good.
- "Didn't get it?" card is redundant with the Resend button (Top Issue 15).
- "Link expires after 24 hours" and the reset link says "expires in 1 hour" — two different expiry windows for related flows; confirm intentional, otherwise document.
- "Resend Email" button title case, but resend-cooldown text `Resend in Xs` is sentence case. Align: "Resend email" and "Resend in Xs".
- "Use a different account" link is a good escape hatch. Keep.
- Error `Failed to resend email. Please try again.` — replace with "Couldn't send the email. Check your connection and try again."

### `/forgot-password`

- H1 "Reset your password" — good.
- Success H1 "Check your email" — good.
- Expiry banner: "The link expires in 1 hour. Check your spam folder if you don't see it within a minute." — two hops. "Link expires in 1 hour. Check your spam folder if it doesn't arrive within a minute."
- Resend button title "Resend email" (sentence case) and `Sending...` — good.

### `/reset-password`

- H1 "Create new password" — ok. Could be "Set a new password."
- Subhead "Make it strong — you won't need the old one anymore." — too clever. Replace with "Choose a new password that you'll remember."
- Success H1 "Password updated!" — acceptable; trailing `!` feels like over-celebration for a routine security action. Drop the bang.
- Requirements checklist uses color only to indicate met state — DA concern; verify the checkmark glyph renders or add an aria-live update.

### `/welcome` (onboarding carousel)

- Screen 1 title "Discussions are earned" — reads as scold. Replace with "Earn your way in."
- Screen 2 title "Your Verity Score is a knowledge map" — mixed metaphor. "See what you know" is cleaner.
- Screen 3 title "Streaks reward showing up" — OK.
- Copy is long for a three-screen carousel. Per my notes on click-to-advance, prefer shorter bodies with a single visual. If the team wants a walkthrough, each screen should answer one question.
- "Skip" is discoverable in the corner — good.
- Progress bar and "Welcome to Verity Post | 1 of 3" label are redundant with the bar. Drop the counter, keep the bar.

### `/help`

- H1 duplicated with the "Verity Post" logotype above (Top Issue 8).
- "Help & Support" — drop "& Support". Just "Help."
- Subhead "Questions? We are here." — replace with "Answers, account help, and a way to reach us."
- FAQ copy is strong overall. One spot to tighten: "We send a verification link after signup." → "We email a verification link after you sign up."

### `/how-it-works`

- H1 doubled with logotype (Top Issue 8).
- Steps Read / Quiz / Discuss / Earn — the active-voice verbs work. But the descriptions use heavy marketing language ("Contribute fact-checks", "distinguish facts from opinions"). Acceptable on a pre-auth page, but tone doesn't match the sparse Help page. Pick one voice.
- "Get Started" button title case + "" Sign Up button on signup = inconsistent. Use sentence case.

### `/browse`

- H1 "Browse" — clean.
- "Search categories..." placeholder — good.
- Filters `Most Recent`, `Most Verified`, `Trending` — title case, sentence case elsewhere. Use sentence case ("Most recent", "Most verified", "Trending").
- H2 "Trending Now" is title case; elsewhere "Your categories" is sentence case. Align to sentence case.
- Category drill button "View all {X} articles" — OK but see Top Issue 28.
- `No articles yet.` inside category card — actionable CTA missing. Say: "No articles here yet. Check back soon, or try another category."

### `/story/[slug]`

- "No timeline yet." — flat. "No timeline for this story yet." is clearer.
- Sources pill: `Source` fallback when `src.publisher` is missing — fine. But user-facing word "Source" collides with citations language. See Top Issue 29.
- Bookmark error `Could not save bookmark. Please try again.` — swap "Please try again" for a concrete next step: "Couldn't save — you may be over the free limit."
- Report modal and regwall wording aren't in this sample; flagging for sweep.

### `/bookmarks`

- See Top Issue 11.
- "Saved Stories" vs elsewhere "Bookmarks" — two names for the same concept. Pick "Bookmarks" (it matches the URL + the nav).
- "Export JSON" button — audience is technical. A plain user wants "Download my bookmarks."
- `+ Collection` button — "+ New collection" is clearer.
- Collection pill count suffix `All (12)` vs `Tech (5)` — works.
- `Remove` action on a bookmark row + confirm dialog for collections but not for a single bookmark. Inconsistent destructive-action pattern. Either confirm both or neither.
- Empty state `No saved articles here` followed by CTA `Browse articles` — clean.

### `/messages`

- See Top Issues 4, 12.
- "Messaging is paused" placeholder when DM is locked — good (neutral, not accusatory).
- "Couldn't find the other participant." — accusatory-leaning. "Can't find the other user — refresh and try again."
- Report dialog copy "Tell us briefly what's wrong. A moderator will review." — crisp, correct.
- `No users found.` in search — add a hint: "Try a different username or role."
- "All Users" / "Experts" / "Educators" role filter: "All Users" is title case + plural, others are sentence case + plural. Settle on "All users" lowercased. Also: reader-facing users will not know what a Moderator is — add tooltip or short descriptor on hover.

### `/notifications`

- Anon CTA: "Keep track of what matters" / "Sign up to get notified when your favorite authors post, when your comments get replies, and when weekly recaps are ready." — good.
- "Preferences" button next to "Mark all read" — fine; could be "Settings" since that's where it leads.
- "Mark all read" is sentence-case, correct.
- Notification type badge uppercase tokens like `REPLY` / `MENTION` / `BREAKING_NEWS` — the last one displays with underscore. Convert to "Breaking news" before render.
- Error copy `Couldn't load notifications ({n}).` with the status code surfaced — this is developer-leaning. Strip the status in production, log it.

### `/profile` (unified)

- See Top Issue 3 for LockedTab.
- H1 falls back to "Profile" when no name — OK.
- "Your reading, activity, and achievements" subtitle — good.
- Tab labels "Overview / Activity / Categories / Milestones" — clean.
- EmptyState "We couldn't load your profile" + "Something went wrong retrieving your account." — accusatory-leaning "something went wrong" is a vague error. Replace with "Couldn't load your profile. Refresh to try again, or head back home."
- "Frozen" status copy `Score frozen on X. Resubscribe to resume tracking progress.` — good.
- "My stuff" section heading is casual; the rest of the page is formal. Pick one tone. "Your tools" or "Shortcuts" or just "Quick links."
- Shareable card subtitle "A preview of your public card. Share it on socials or link to your public profile." — "socials" is slang; use "social media" or "anywhere online."
- Category drill modal button "Browse {X}" conflicts with /browse feature. Rename button to "See all {X} articles."

### `/profile/settings`

- Section names "Account / Preferences / Privacy & Safety / Billing / Expert / Danger zone" — good.
- "Danger zone" is appropriate for destructive actions.
- Alert rows use "Breaking news / Replies to me / @mentions / Expert answered me / Weekly reading report / Kid trial ending / Appeal outcome" — these labels are good and consistent.
- "Expert answered me" is awkward. Better: "An expert answered you" (read as a sentence) or "Expert answers."
- Sub-section ids exposed in keyword search strings like `profile display name username bio avatar banner visibility` — fine as a hidden search corpus; verify not rendered.

### `/expert-queue`

- "No messages yet." — replace with context-aware: "No questions from readers yet. Expert DMs appear here when readers ask."

### `/search`

- H1 "Search" — ok. Could be "Search articles" to differentiate from the global search overlay on home.
- Placeholder "Search by keyword" — good.
- Advanced filters message `Advanced filters (date range, category, source) are available on paid plans. View plans →` — good; matches the bookmark cap tone.
- `No matches. Try a different keyword.` — good.
- Source filter placeholder `Source publisher…` — see Top Issue 29.

### `/leaderboard`

- Tab names "Top Verifiers / Top Readers / Rising Stars / Weekly" — "Weekly" is an odd sibling (time-window) to three leaderboard types. Rename to "This Week" and make the time-window separate from the ranking type.
- Periods "All Time / This Month / This Week" — title case, should be sentence case.
- Copy not shown here but worth sweeping "Top Verifiers" — is "Verifier" a known user-facing role? If not, switch to "Top fact-checkers" or "Top contributors."

### `/appeal`

- See Top Issue 16.
- H1 "Appeal a penalty" — good.
- Subhead "If a moderator took action on your account and you think it was a mistake, you can file one appeal per penalty. Approved appeals reverse the penalty." — clear but long. Tighten: "File one appeal per penalty. Approved appeals reverse the action."
- "Tell us why this was wrong." — good.
- Status chip "Appeal: pending / approved / denied" — capitalization inconsistent with the rest.

### `/kids`

- H1 fallback state "Verity Post Kids" + subhead "Who is reading today?" — warm, correct.
- "Needs parent setup" red tag — fine.
- Follow-up text "Some profiles need a parent PIN before kids can use them. Set it up." — "Set it up" is an underlined link — ok.
- Greeting "Hi, {name}! What do you want to explore today?" — warm, correct.
- Empty category: "No stories here yet" / "Try another category — new stories show up here as we add them." — good, kid-appropriate.

### `/kids/profile`

- `No badges yet` / `Nothing saved yet` — good kid voice.

### `/status`

- "System Status" title case + headings inconsistent with sentence case elsewhere.
- "All Systems Operational" vs "Some Systems Experiencing Issues" — title case. Standardize: "All systems operational" / "Some systems degraded."
- Incident severity chips: `minor`, `major`, `critical` lowercase inside a chip — fine.

### iOS

- `SignupView`: H1 "Verity Post" + subhead "Create your account" — cleaner than web (single tagline). Adopt this pattern on web.
- `LoginView`: "Sign in to continue" subhead — matches "Welcome back" on web? No — inconsistent. Pick one.
- `VerifyEmailView`: "Check your email" / "We sent a verification link to {email}" / "Tap the link in the email to finish setting up your account." — clean; web has an extra "Didn't get it?" card that iOS omits. Web should match iOS's simplicity.
- Password error messages in Swift use Unicode curly apostrophe `don\u{2019}t match` — correct rendering. Web uses `don&apos;t` in JSX — same outcome, but the source style differs. Not a user-visible issue.

## Cross-cutting copy patterns

- **"Please try again"** appears 10+ times. Drop it or replace with the specific next step. "Please" is performative politeness that lengthens every error.
- **"Failed to X"** pattern in ~12 error messages. This is system-voice, not user-voice. Rewrite in user voice: "Couldn't X" / "We couldn't X" (verb first).
- **Title-case vs sentence-case** is non-deterministic across the app. Buttons are inconsistent ("Create Account" vs "Sign in" vs "Create free account"). Lock sentence case.
- **"Upgrade to paid plan"** copy varies: "available on paid plans", "Verity or above", "Verity+ plan", "upgrade to Verity". Pick canonical names and use them every time.
- **Emoji-equivalent ASCII art** (`[!]` in notifications anon state) — works, but the surrounding codebase is otherwise iconless. Use an inline SVG bell instead.
- **Smart quotes vs straight quotes** mixed. Codebase has `don&rsquo;t`, `don&apos;t`, `don\u{2019}t` — pick ASCII straight or Unicode curly and standardize.
- **Ellipses** `...` vs `…` — site uses both in loading states and cooldown labels. Standardize on `…`.
- **Arrows** `→` literal char in JSX vs `&rarr;` entity vs `›` chevron — three patterns. Pick `→` or use an SVG icon.

## Consistency audit (same concept, different words)

| Concept | Variants found | Pick |
|---|---|---|
| Sign in action | "Sign in", "Sign In", "Login", "Log in", "Signing in..." | **Sign in** (sentence case) |
| Sign up action | "Sign up", "Sign Up", "Create Account", "Create free account", "Join Verity Post", "Regular signup" | **Create free account** (button) / **Sign up** (nav link) |
| Saved article | "Saved Stories", "Bookmarks", "Saved articles", "Saved" | **Bookmarks** |
| Category vs Topic | "Category", "Topic", "Areas of expertise" | **Category** (public), **Topic** (discussion thread), **Expertise area** (expert profile) |
| Source vs Publisher | "Source" (search filter + story sources), "Publisher", "Source publisher" | **Publisher** (filter), **Cited source** (story body) |
| "Verify" in two flows | "Verify your email" (confirm address), "Verified" (verified public figure badge) | Keep both, but never abbreviate "verification" to "verify" as a noun |
| Kids profile | "Kid profile", "Kids profile", "Supervised kid profile" | **Kid profile** (singular) / **Kids Mode** (feature) |
| Upgrade copy | "Upgrade", "Subscribe", "View plans", "Resubscribe" | **Upgrade** (free→paid), **Resubscribe** (returning), **Change plan** (tier swap), **View plans** (informational) |
| Username handle | "@name", "Username", "yourname" | **Username** (label), **@name** (public reference) |
| Ads | "Ad-free", "Reduced ads", "No ads" | **Reduced ads** (Verity), **Ad-free** (Pro+) |
| Streak | "Current streak", "Streak", "Day X streak", "Day X" (home) | Normalize home to "Day X streak" first visit |
| Login button copy on submit | "Sign In", "Signing in..." | Match case to resting label |
| Verify cooldown | "Resend Email" (title case) / "Resend in Xs" (sentence) / "Sending..." | All sentence: "Resend email", "Resend in Xs", "Sending…" |
| Back to home | "Back to home", "← Back to login", "Back" | **Back to home** (explicit); **Back** only when paired with step context |
| Notification channels | "Push / In-app / Email" on alerts page, other channels unclear | **Push notifications / In-app / Email** |
| Settings | "Settings", "Profile settings", "Account settings", "Preferences" | **Settings** (top-level), **Preferences** (subsection) |

## Empty-state audit

Rewrites below. Every empty state should be active, tell the user what they're missing, and offer a next action.

| Surface | Current | Rewrite |
|---|---|---|
| Home feed no articles | `No articles found.` | `No articles match this filter. Clear filters or pick a different category.` |
| Home loading | `Loading articles...` | `Loading…` (drop "articles" — context is obvious). |
| Search no matches | `No matches. Try a different keyword.` | Keep. |
| Bookmarks empty | `No saved articles here` + `Browse articles` | Keep; add one-liner: `Save articles from any story page.` |
| Messages list empty | `No messages yet / Start a conversation with another user.` | `No conversations yet. Message an expert, author, or friend to get started.` |
| Messages thread empty | `No messages yet. Start the conversation.` | `Say hi. They'll see your first message when they open the chat.` |
| Messages search | `No users found.` | `No one matches that search. Try a different username.` |
| Notifications empty (all) | `No notifications yet. When someone replies, mentions you, or an article breaks, it lands here.` | Keep. Strong. |
| Notifications empty (unread filter) | `You're all caught up.` | Keep. |
| Profile activity empty | `No activity yet` + `Read an article, leave a comment, or save a bookmark to see it here.` | Keep. Strong. |
| Profile categories empty | `No categories yet` + `Choose topics you care about to personalize your feed and unlock category scoring.` | Keep. |
| Profile achievements empty | `No achievements yet` + `Complete a quiz or hit your first streak to start collecting badges.` | Keep. |
| Browse no categories match | `No categories found.` | `No categories match that search.` |
| Browse category with zero articles | `No articles yet.` | `No articles in this category yet. New stories arrive daily.` |
| Category contributors empty | `No contributors yet.` | `No active contributors in this category yet.` |
| Story timeline empty | `No timeline yet.` | `No timeline for this story yet — check back as it develops.` |
| Expert queue empty | `No messages yet.` | `No questions from readers yet. Answered questions appear here.` |
| Kids profile no profiles | `No profiles yet / Create a kid profile in your account settings to get started.` | Keep. |
| Kids stories empty | `No stories here yet / Try another category — new stories show up here as we add them.` | Keep. |
| Kids badges empty | `No badges yet` | Keep; optional: "Read a story or pass a quiz to earn your first badge." |
| Kids saved empty | `Nothing saved yet` | Keep. |
| Kid parent dashboard activity | `Nothing yet — activity shows up here as soon as {kid.display_name} starts reading.` | Keep. |
| Kid sessions | `No sessions scheduled right now.` | Keep. |
| Kid quiz activity | `No quiz activity yet.` | Keep. |
| Kid achievements | `Nothing earned yet.` | Keep. |
| Appeal no penalties | `No active penalties / You do not have any active penalties on your account. There is nothing to appeal.` | Delete one — there are two. Keep: `No active penalties. Nothing to appeal.` |
| Public card not found | `No user found.` | `We couldn't find that user. The username may have changed.` |
| Logout recent reads | (appears to show no hardcoded fallback) | Keep. |

## Error-message audit

Every string below is accusatory, vague, or system-voice. Rewrites.

| Current | Where | Rewrite |
|---|---|---|
| `Failed to create account` / `Failed to create account. Please try again.` | /signup | `Couldn't create your account. Check your details and try again.` |
| `Failed to save username. Please try again.` | /signup/pick-username | `Couldn't save that username. Try again.` |
| `Failed to update password. Please try again.` | /reset-password | `Couldn't update your password. Try again.` |
| `Failed to send reset email` | /forgot-password | Silent-swallowed for enumeration; keep. |
| `Failed to resend email. Please try again.` | /verify-email | `Couldn't send the email. Try again in a moment.` |
| `Failed to submit application. Please try again.` | /signup/expert | `Couldn't submit your application. Try again.` |
| `Failed to load article. Please try again.` | /story error boundary | `Couldn't load this article. Refresh or try again.` |
| `Invalid credentials` | /login | `That email and password don't match. Check the spelling or reset your password.` |
| `Too many failed attempts. Try again after X.` | /login | Keep. |
| `Too many attempts. Try again in a minute.` | /login | Keep. |
| `Too many verification resends. Try again in an hour.` | /verify-email | `You've hit the resend limit. Try again in an hour.` |
| `Too many email-change attempts. Try again later.` | /verify-email | `Too many email-change attempts. Try again in an hour.` (be specific) |
| `Too many attempts. Try again in an hour.` | home search banner | Keep. |
| `Network error. Please try again.` | /login, various | `Can't reach the network. Check your connection and try again.` |
| `Something went wrong` | /profile load error | `Couldn't load your profile. Try refreshing.` |
| `Could not load notifications (X).` | /notifications | `Couldn't load notifications. Try again.` (strip status code) |
| `Couldn't load messages` + `Something went wrong loading your messages.` | /messages | `Couldn't load your messages. Refresh and try again.` (one line) |
| `Could not remove bookmark. Please try again.` | /story, /category | `Couldn't remove this bookmark. Try again.` |
| `Could not save bookmark. Please try again.` | /story, /category | `Couldn't save this bookmark.` If over cap, say so: `You've hit the free bookmark limit.` |
| `Could not block this user. Please try again.` | /messages | `Couldn't block this user. Try again.` |
| `Could not submit report. Please try again.` | /messages | `Couldn't send your report. Try again.` |
| `Could not find the other participant.` | /messages | `Can't find the other user — refresh and try again.` |
| `Could not change pause state` | /profile/kids | `Couldn't update the pause.` |
| `Could not record read` | API | (server only) — fine as JSON. |
| `Could not file report` | API | (server only) — fine. |
| `Appeal failed` | /appeal | `Couldn't file your appeal. Try again.` |
| `Tell us why this was wrong.` | /appeal validation | Keep. |
| `Passwords do not match.` / `Passwords don't match` | multiple | Canonicalize: `Passwords don't match.` (contraction, one dot). |
| `Verification email sent.` | home banner | Keep. |
| `Could not send. Try again later.` | home banner resend | `Couldn't send the email. Try again in a moment.` |
| `An account already exists for that email. Log in instead.` | /signup | `That email already has an account. Sign in instead.` (match canonical verb) |
| `Unable to ...` patterns | scan needed | Replace all with `Couldn't ...`. |

## Tone audit

Per-surface, the tone I read and whether it fits:

- **Public pre-auth** (`/`, `/browse`, `/how-it-works`, `/help`, `/status`, `/status`) — warm, marketing-y. Fits; slightly more declarative copy would tighten trust. A news app selling credibility should err toward confident understatement.
- **Auth flows** (`/login`, `/signup`, `/signup/expert`, `/verify-email`, `/forgot-password`, `/reset-password`, `/signup/pick-username`, `/welcome`) — mostly correct, but mixed. "Welcome back" (/login) is warm; "Invalid credentials" (same page) is cold. Pick a tone per-surface and keep it.
- **Reading** (`/story`, `/category`, `/search`, `/leaderboard`) — neutral-factual. Fits.
- **User utilities** (`/profile`, `/bookmarks`, `/messages`, `/notifications`, `/recap`) — businesslike with flashes of warmth ("My stuff"). The `/profile` unified page borrowing admin component copy is noticeable — it's drier than public pages. Acceptable.
- **Kids** (`/kids/*`) — warm and second-person. Fits. Keep the "Hi, Name! What do you want to explore today?" pattern.
- **Admin** (`/admin/**`, read-only here) — dry, utilitarian, correct for internal operators.
- **Appeal / Danger zone** — calibrated serious. Appeals page reads appropriately procedural. Danger zone label is correct.
- **Error states** — too system-voice across the board (see error audit). Should be user-voice everywhere.
- **iOS** — slightly more terse than web (which is fine for mobile) but also slightly inconsistent with web phrasing. Canonicalize the shared strings.

## Copy principles I'd codify

1. **Write in active voice.** Subject + verb + object. "Couldn't save your bookmark" not "Bookmark was unable to be saved."
2. **User-first, never system-first.** Replace `Failed to X` with `Couldn't X`. Replace "Something went wrong" with "Couldn't X — try Y."
3. **Sentence case for buttons and headings.** "Create free account" not "Create Free Account." Exception: proper nouns (Verity Post, Apple, Google).
4. **One concept, one word.** Never use two labels for the same thing. Decide once and keep it across web, iOS, email, push.
5. **Error messages must include a next step.** "Try again" is acceptable only when there's literally nothing else to do. When possible, point to the fix: "Check your spelling", "Check your connection", "You've hit the free limit".
6. **Cut "Please."** Politeness performed in microcopy feels hollow. "Try again" beats "Please try again" every time.
7. **Empty states tell the user what goes there and how to fill it.** Never just "No X yet." Always "No X yet. Do Y to see them here."

---

End of audit.
