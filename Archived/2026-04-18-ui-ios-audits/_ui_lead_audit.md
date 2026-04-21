# UI Lead Audit — Verity Post
Date: 2026-04-19
Auditor: Lead (solo first pass)

Scope covered: adult web (23 public/authed surfaces), kids web (5 surfaces), admin console (sampled the hub + 4 representative pages; the rest inherit the same chrome), iOS (sampled 8 core views + Theme). Live dev server probed at localhost:3000; source read against each route in `site/src/app/**` and `VerityPost/VerityPost/*.swift`.

---

## Scoring rubric I used

- **Critical** — blocks the intended action, misrepresents state to the user, or causes a self-inflicted error (wrong copy on a destructive action, invisible CTA, etc.). Ship stopper.
- **High** — noticeably wrong on first sight: double headers, broken hierarchy, inconsistent labels that make the user doubt the product. Not a blocker, but it's the kind of thing peers notice in a 30-second demo.
- **Medium** — polish: widows, spacing drift, Title Case/sentence case leakage, minor a11y gaps with a fallback path.
- **Low** — nits / "while we're in there". Hover states, subtle rhythm, icon-text alignment off by 1px.
- **Info** — observation only, not necessarily a defect.

---

## Top 15 issues across the product (all severities, ranked by impact)

| # | Severity | Surface | Issue | Device(s) |
|---|---|---|---|---|
| 1 | Critical | Story page — regwall | Two different CTA labels on the same wall at different moments ("Sign up free" on the quiz-block, "Sign Up Free" on the hard regwall) and the "Close" control is a 13px text button top-right with no icon, no aria-label describing what gets dismissed. Critical because the "Close" affordance reads as metadata, not action; users hunt for an X. | all |
| 2 | Critical | Global copy | "Sign In" / "Sign in" / "Log In" / "Log in" / "Sign up" / "Sign Up Free" / "Sign up free" — every CTA pair mixes casing AND verb. Nav says "Log In", login page button says "Sign In", signup page bottom link says "Sign in", story page says "Log in", kid gate says "Sign in", notifications says "Sign in". A user sees three different labels for the same action in one session. | all |
| 3 | High | Home `/` | The top chrome shows "Verity Post" in the main layout top-bar (NavWrapper) AND the home page renders its own sticky nav immediately below with another "VP" logo square + "Verity Post" wordmark. **Double brand lockup stacked vertically — 2 logos, 2 titles, 100px of pure chrome before any content.** | all |
| 4 | High | `/how-it-works`, `/privacy`, `/terms`, `/cookies`, `/dmca`, `/help`, `/accessibility` | Classic double header: centered "Verity Post" wordmark at 28px bold, then an `<h1>` immediately below at the same 28px weight. The wordmark is decoration (the NavWrapper already puts a top-bar on screen with the brand), so the page reads as "brand / brand / content". Pick one. | all |
| 5 | High | `/bookmarks` | Same pattern — 28px "Verity Post" centered wordmark, then `<h1>` "Saved Stories · 0 of 10". Bookmarks is a logged-in surface; the top-bar already carries the brand. Remove the wordmark. | all |
| 6 | High | Signup / Login / Forgot / Reset / Verify-email / Pick-username | Every auth card renders "Verity Post" at 20px 800-weight, then an h1. These pages have no top-bar (NavWrapper hides on auth routes), so a brand line is legitimate — but the card adds 28px bottom margin to the wordmark and then the h1 immediately afterwards, so the user eye reads "Verity Post" → "Welcome back" → "Sign in to your account to continue reading" — three short banner-weight lines before any form. Tighten into a single header block. | all |
| 7 | High | Home / Story page | Breaking banner vs. Breaking badge — the home banner uppercases "BREAKING" with letter-spacing 0.1em and a dark inner chip; the in-card breaking badge uses a different red tone (`#ef4444` solid vs. the banner's red) and different padding. Same word, 3 visual treatments across the product (banner, in-card pill, story page pill). Pick one chip style. | all |
| 8 | High | Settings / Bookmarks / Profile / Home | Font-size soup. Home alone uses 10, 11, 12, 13, 14, 15, 16, 22 px across the sticky nav, banners, pills, cards, and buttons. 11px is used for 4 different semantic roles (category label, timestamp, breaking banner chip, post-match result count). Collapse to a 4-step scale (11, 13, 15, 22) and pick one per role. | all |
| 9 | High | Story `/story/[slug]` | Action row under the dateline crams 4 controls (Listen, Save, at-cap banner, Share) onto one flex row with 6px gaps. At 320/375px this line-wraps in ways that put "At cap (10)" on its own line above the other buttons and looks like a label, not a button. Also, the "You've used 10 of 10 free bookmarks. Upgrade for unlimited" banner renders INLINE with the action row instead of above the article — the reader doesn't see it until after they scroll. | 320, 375 |
| 10 | High | iOS — all views | Every font size is `font(.system(size: 13))`, `size: 14` etc. — no `.dynamicTypeSize` or `@ScaledMetric`. Users running Accessibility Larger Text get no scaling. App Review Guideline 2.5.13 (Accessibility) expects Dynamic Type. | iOS |
| 11 | High | iOS — TextTabBar | Tab bar at `padding(.vertical, 14)` with 13pt text. Effective hit target is ~42pt — below the 44pt HIG minimum. Home indicator inset is provided by `safeAreaInset(.bottom)` but the 14pt vertical padding means the top half of the tab label is only 36pt from the bottom of content. | iOS |
| 12 | Medium | Signup | Password strength meter and the confirm field sit on top of each other with 14px gap, confirm password field has no contextual explanation ("Type it again to check for typos" would be better than the placeholder "Repeat your password"). When the passwords mismatch, the message "Passwords don't match" appears but the field itself turns red — the message is redundant to the color. Use one signal. | all |
| 13 | Medium | Welcome carousel | The "Skip" button is top-right in 13px gray with no affordance — reads like a label. A reader tapping it skips the entire onboarding, which is actually fine — but frame it as "Skip intro" with an underline so it reads as action. Also: the "Start reading" CTA only appears on the last screen; every other screen shows "Next". Consider "Got it →" on last screen so the button always feels like forward motion, then "Start reading" only once onboarding has net-new information left. | all |
| 14 | Medium | Admin hub + all admin pages | "Admin" has 8 groups, 32 pages, most at the same visual weight (PageSection cards with identical titles, similar descriptions). There's no primary/secondary; everything is tier-1. Users bounce between Features/Settings/System because the naming overlaps ("Settings & Features", "Runtime Settings", "System & Infrastructure"). Consolidate nomenclature — settings and features and runtime are all the same kind of thing. | 768+ |
| 15 | Medium | Browse | The `CAT_STYLE` map has `icon: ''` empty strings for every category — legacy field that ships as an unused variable on every render. Also, `FEATURED_COLORS` cycles through 5 arbitrary colors (black, mint, salmon, yellow, gray) for the featured cards with no semantic meaning — just random. Remove or tie to category. | all |

---

## Findings by surface

### Home (/)

**Layout**
- Two stacked headers (global top-bar + home's own sticky nav). Remove home's internal nav; the global top-bar already anchors brand. If the search icon needs to live on home specifically, move it into the global top-bar as a right-side affordance.
- Max-width 680px. Good for reading, wasteful on 1440px desktops — the feed is a narrow column on a sea of white. Either center intentionally with a visible design choice, or widen to 920px with a two-column cards layout at >1024px.
- At 320px, category pills horizontal-scroll with `scrollbar-width: none` — no visual hint that there's more. Add a right-edge fade.

**Copy**
- Empty state: "No articles found." — informational, not actionable. Rewrite: "Nothing matches this filter. Try All, or switch categories."
- Loading state: "Loading articles…" — vague. Either remove (skeleton is sufficient) or "Pulling the latest stories".
- `Day X` streak line — just "Day 7". No context. Try "Day 7 of your reading streak" once, then truncate to "Day 7" on subsequent visits. Also this line is rendered ABOVE the Recap card but BELOW the category pills, orphaning it from the greeting that should own it.
- Breaking banner uses solid red #ef4444 with white text at 13px — readable, but the banner is sticky while the breaking BADGE inside cards is a different `#ef4444` red on translucent bg. Pick one.

**CTA hierarchy**
- Search is a 18px magnifying glass icon in the top nav. When logged out, the icon is hidden entirely. When logged in but unverified, clicking it opens an amber verify banner. Good. Flag: the Resend button inside that banner uses `color: #92400e` on `transparent background`, border `1px solid #92400e` — that's 4.4:1 contrast on `#fffbeb` which technically passes, but at 12px barely. Pick a stronger border.
- "Load more articles" button: card-card-card-button layout with the button styled identically to the empty-card background. The user reads it as another story card. Make it obviously a button — solid fill or a clear outline style, not `background: C.card` which matches the cards above.

**Rhythm**
- Card padding 14/16, card gap 12px, banner gap 0, pill row gap 14/0/12 — vertical rhythm jumps around. Normalize to an 8-point grid: cards 16, gap 16, pill rows 16, section 32.

### Auth (/login, /signup, /forgot-password, /reset-password, /verify-email, /welcome, /signup/pick-username, /signup/expert)

**Consistency**
- Every auth page hand-codes the same C palette object. Six copies of the same literal — when someone changes accent, it'll flicker across pages for weeks. Consolidate.
- Card width: 420 on login, 440 on signup, 420 on forgot, 420 on reset, 420 on verify, 480 on welcome. No reason. Pick 440 once.
- `maxLength={30}` on pick-username, but no maxLength on signup full name — a user can type 200 characters before discovering the DB will reject it.

**Copy**
- Login: "Sign in to your account to continue reading" — "to your account" is filler. "Sign in to continue reading." is cleaner.
- Login: button "Sign In" (Title Case), sibling link "Sign up" (sentence case) — pick one. I'd pick sentence case: "Sign in" / "Sign up". Verbs, lowercase, parallel.
- Signup: Button "Create Account" (Title Case). Different verb AND casing from the login form's "Sign In". Rename to "Create account" — matches a sentence-case standard.
- Signup: Password strength bars animate color on change — good. "Weak / Fair / Good / Strong" labels swap without transition, so the label flashes. Cross-fade.
- Signup: "I confirm I am 13 or older." — period ends the sentence, but "I agree to the Terms of Service and Privacy Policy" below has no period. Parallel grammar.
- Signup: "Keep me signed in on this device." — the period here is inconsistent with the agree-to-terms line. All three checkboxes should end with a period, or none should.
- Forgot-password: "Enter your email and we'll send you a link to reset your password." — slightly wordy; "Enter your email. We'll send a reset link." Two short sentences read faster.
- Verify-email: button "Resend Email" (Title Case) but form body says "request a new link from the verify email page" in help — two different labels for the same thing.
- Pick-username: "@yourname is available!" with exclamation, "@yourname is already taken" without, "@yourname is reserved and can't be used" without. Normalize punctuation.
- Welcome: step indicator says "Welcome to Verity Post | 1 of 3" — pipe char is unusual. Use "1 of 3 · Welcome to Verity Post" or drop the "Welcome to" (redundant — they're IN the onboarding).
- Welcome: Skip button top-right, 13px gray, `background: none, border: none` — reads as a metadata label. Add an underline or move to the bottom-right as a secondary button.

**Form hygiene**
- Login: single "Email or username" combo field is smart, but the placeholder "you@example.com or yourname" reads awkward. Try "Email or @username" with the label remaining "Email or username".
- Signup: no inline "Already have this email?" check until blur — a user types their existing email, tabs to password, types a password, confirms, then finds out on submit. Trigger the availability check on paste + debounced on change, not only on blur.
- Signup: Full name field with placeholder "Jane Doe" — culturally biased placeholder. Use a non-personal one like "Your full name" and let the label do the semantic work.
- Reset-password: does not surface password rules until the user types; signup shows bars as the user types. Pick one pattern.
- Verify-email: "Check your spam folder, or wait a minute and try resending." — soft. "Didn't get it? Check spam, then resend." is shorter and active.

### Story page (/story/[slug])

**Hierarchy**
- Title in `var(--font-serif)` serif 26px — good editorial feel. Excerpt at 15px sans — abrupt. Consider the excerpt in serif italic at 17px to bridge, or leave sans but bump the serif title to 28-30 for clearer hierarchy.
- Desktop sidebar Timeline is 260px wide, sticky top 60 — good. On 1024-1280 widths the 40px gap between article and timeline is generous; on 1440+ it's fine. Below 1025px switches to a tab row (Article/Timeline/Discussion) that doesn't preserve scroll position when switching. Sticky tab bar hides content too — 10px padding vertical, 13px text, active indicator is a 2px border on the bottom. Hit target is ~40px. Make it 44+.

**Copy**
- Report modal: 6 radio options labeled "Harassment", "Misinformation", "Spam", "Hate Speech" (two words Title Case), "Off Topic" (two words), "Impersonation". "Hate Speech" and "Off Topic" are Title Case; the others are single words that happen to start capitalized. Normalize to sentence case: "Hate speech", "Off-topic" (hyphenated).
- Regwall title: "Sign up to keep reading" — active voice, good. Body: "You've reached the free article limit. Create an account to continue." — use one verb throughout. Title says "Sign up", body says "Create an account", button says "Sign Up Free". Three different verbs for the same action.
- Post-article "You might also like" card shows a primary "Back to home" and a secondary "Browse articles". Title implies related articles, but the card actually just pushes navigation. Rename the label: "Where to next" or "Keep reading".

**Engagement**
- Bookmark + Share + Report are a cluster at 11px — microscopic. 11px is below the 44pt touch target even with padding. Move to 13px text and 44pt min hit box.
- "At cap (10)" button disables silently. Good it's disabled, but the chip-sized label doesn't say why. The 11px banner that does explain ("You've used 10 of 10 free bookmarks") appears inline in the action row — move it BEFORE the article body or as a tooltip on the disabled button. Inline next to the share button reads as spam.

### Profile + Settings

**Profile page (/profile)**
- Four-tab interface (Overview / Activity / Categories / Milestones). Nice. Tab bar uses a 2px underline — good Linear/Stripe feel.
- Keyboard shortcuts (1-4 and g+a/c/m/o) — Info: great for power users, but there's no tooltip, docs page, or "?" help that surfaces them. Linear has a `?` key that opens a shortcuts panel. Consider.
- Header: tier ring (conic gradient) + avatar + display name + tier badge + role badges + username/member-since line + bio + 3 score blocks. Eight semantic roles in one card — info-dense. On 320px the badges line-wrap and the tier badge ends up under the display name, which looks accidental.
- "My stuff" section title — too casual for a settings context. "Quick links" (which the code comment says) is accurate.

**Settings page (/profile/settings)** (3761 lines in one file)
- Left-nav + right-content long-scroll pattern — good.
- Anchor links (`#emails`, `#password`, etc.) — good.
- Search filters subsections — good.
- Delete-account copy inside ConfirmDialog: "This schedules a 30-day grace period. Sign in before the deadline to cancel." — the sentence has no subject (`Sign in [yourself] before…`) and treats the user as the executor of their own cancellation. Try: "Deletion runs after a 30-day grace period. You can cancel by signing back in before then."
- "Sign out of every other session" — long label for a button. Shorten to "Sign out everywhere else" (already the card title; match the button).
- Inconsistent use of `F.sm`, `F.xs`, `F.md`, `F.xxl` across cards — look unified, but a few Row headers use inline `11` literals where the tokens would be 12. Audit.
- Danger zone cards use `tone="danger"` border styling — good. But there's no "this cannot be undone" sentence on Delete-account at the card level, only inside the dialog. Move the irreversibility callout to the card so users see it before clicking.

### Bookmarks / Messages / Notifications / Recap / Search / Leaderboard

**Bookmarks (/bookmarks)**
- Double header (logged-in surface with brand wordmark + h1). Remove wordmark.
- `Saved Stories · 2 of 10` — · separator followed by plain count, no framing. "2 of 10 saved" or "Saved (2 of 10)" reads cleaner.
- "+ Collection" button with a literal "+" before the word — fine, but inconsistent with the rest of the app which uses sentence-case verbs without the + prefix. Use "New collection".
- Cap banner copy: "You've hit the free bookmark cap. Unlimited bookmarks, collections, notes, and export are available on paid plans. View plans →" — the arrow on "View plans →" is a different convention than the rest of the app. Either add arrows everywhere or nowhere.
- Empty state: "No saved articles here" → "You haven't saved anything yet. Tap Save on any article to see it here." is more instructive.
- Remove button: 12px red text, 600 weight, no confirmation. One click deletes. For a bookmark it's recoverable (re-save) so probably fine, but worth noting.

**Messages (/messages)**
- Long/complex page with conversation list + thread + compose. Block/report overflow menu — good.
- When users try to compose without permission, the page quietly redirects to `/profile/settings/billing`. Silent redirect from a navigated-to page is jarring. Show a banner first: "Direct messages are part of paid plans — view plans?" with a button.

**Notifications (/notifications)**
- Anon empty state is well-crafted — hero icon, headline, body, primary CTA, sign-in secondary. One of the best empty states in the product. Use this as the template elsewhere.
- `[!]` as the icon rendered in monospace. Clever escape from emojis, but it reads as "error". Use a different glyph or a small SVG bell.
- Authed empty-unread copy: "You're all caught up." — good, active.
- Authed empty-all copy: "No notifications yet. When someone replies, mentions you, or an article breaks, it lands here." — good.
- Badge on notification card `NotificationType` rendered as the raw DB enum uppercased (e.g. `BREAKING_NEWS`). Humanize: "Breaking news", "Reply", "@mention".
- Per-notification card click records read AND navigates. If `action_url` is null, `href="#"` — clicking "#" changes URL to `/notifications#` and causes a scroll jump. Handle null action_url: no link, or link to the entity.

**Search (/search)**
- Single `<h1>Search</h1>` at 24px 800 — good.
- Advanced filters upsell card is a 12px gray block — too quiet for a conversion moment. Either make it more prominent or remove and surface only when user tries to use a filter.
- Empty state copy: "No matches. Try a different keyword." — good.
- Placeholder "Search by keyword" — the input is already obviously a search box because of context. Use "What are you looking for?" or "Search articles by keyword or phrase".

**Leaderboard (/leaderboard)**
- Tab names: "Top Verifiers", "Top Readers", "Rising Stars", "Weekly" — the first three are parallel (Top X), "Weekly" is the time-window for Top Verifiers. Not parallel. Rename "Weekly" → "This Week (Top Verifiers)" or split into a proper period toggle (which the code has — All Time / This Month / This Week), and remove the "Weekly" tab entirely.
- Anon "Sign up to see where everyone ranks" — use the notifications-page hero pattern instead.

**Recap (/recap + /recap/[id])** (not read in this pass — spot check from links in home feed only)
- RecapCard is embedded in the home feed at position 1 — good promotion. Check that the linked-to /recap page doesn't bury the quiz behind a chrome block (common pattern in this codebase).

### Admin console

Admin is locked code-wise, so these are observational only. They do NOT block a launch.

- Hub (`/admin`) groups 32 pages into 8 categories. Good IA. Flag: "System & Infrastructure" vs "Runtime Settings" vs "Settings & Features" — three places that sound like they do the same thing. Internal users will learn; external auditors won't.
- `PageHeader title="Webhook & Integration Logs"` — Title Case ampersand. Same page's tab labels use "Status", "Events", "Health" in sentence case. Pick one convention.
- `KBD` component (keyboard hint chip) shown on 5 quick links in hub — only G A, G N, G U, G R, G S are wired. That's fine, but the chip has no `title` attribute explaining what `G A` means. Tooltip: "Press G then A".
- Admin pages use the light palette (`ADMIN_C_LIGHT`) vs the dark public palette. When admin + public pages link to each other, the visual shift is abrupt. Consider a subtle accent that tells you you're in admin (e.g. thin amber top-border) beyond the "Back to site" black bottom banner.

### Kids web

- `/kids` picker: "Verity Post Kids" at big type + "Who is reading today?" subtitle. Good question, action-oriented.
- Kid profile cards: 160×~110 minimum, 72px avatar with initial, name, "Needs parent setup" label in red uppercase when `pin_hash` is null. Clear.
- The "Ask a Grown-Up" gate for upgrade / sign-in is well-done. Copy "Kid profiles live on Verity Family. Your grown-up can add them from their account." — great tone for the audience.
- `/kids` home after profile selection: "Hi, {name}! What do you want to explore today?" — warm, active voice, age-appropriate.
- Categories are shown in a 2-column grid with large button cards. Each is `KID.font.h3` — good big text. On selection, cards get the accent background. This works.
- Empty state for a category with no stories: "No stories here yet. Try another category — new stories show up here as we add them." — good.
- Flag: the kids layout has its own 3-tab bar at the bottom (Home / Leaderboard / Profile) drawn by NavWrapper. The kid tab bar uses `Kid.tabAccent(for: auth.activeChildProfile)` — per-profile accent color. Cute. But contrast varies by profile color; the orange profile (#f59e0b) on the white tab bar creates 2.8:1 contrast for the active label. Run an auto-contrast darkening when the profile color is below 3:1.
- Kid story page not read in this pass; typical risk area: reading-time, TTS placement, exit-to-parent PIN flow.

### iOS

**Typography**
- Every `.font(.system(size: N, weight: .X))` is hardcoded. No Dynamic Type. **Blocker for App Store accessibility review (Guideline 2.5.13 suggests).** Wrap with `@ScaledMetric` or use `.font(.subheadline)` / `.font(.body)` tokens.
- Sizes used: 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28. Consolidate to a smaller set.

**Touch targets**
- `TextTabBar` at 13pt text + 14pt vertical padding = ~41pt total. **Below HIG 44pt minimum.** Bump vertical padding to 16 (brings total to ~45pt).
- `LoginView` Apple/Google buttons at 48pt height — good.
- Show/hide password in web equivalent is 12px; iOS has `SecureField` that manages its own — no comparable button. Fine.

**Safe area**
- `ContentView` uses `.safeAreaInset(edge: .bottom, spacing: 0) { TextTabBar }` — good, home bar handled automatically.
- No explicit handling of `safeAreaInset(edge: .top)` for the dynamic island — mostly fine because SwiftUI handles it, but verify `StoryDetailView` doesn't render content under the island on newer devices.

**Modal / sheet consistency**
- LoginView: `.sheet` for forgot-password, `.fullScreenCover` for signup. Inconsistent presentation — signup is a longer form so full-screen makes sense, but forgot-password also feels commitment-y. Pick the pattern: either both full-screen or both sheet.
- Session-expired banner is a red horizontal bar that pushes content down. Not dismissable without tapping the small X. Accessible name is `Image(systemName: "xmark")` but no `.accessibilityLabel("Dismiss")` — fix.

**Pull-to-refresh**
- HomeView uses `.refreshable { await loadData() }` — good default iOS 15+ behavior.
- LeaderboardView, ProfileView, NotificationsView — audit to confirm all have `.refreshable`. (Not read in this pass.)

**Empty states**
- HomeView: "No stories found" / "Check back soon for new stories, or try a different category." — good; active and suggests action.
- LoginView error: `Text(err)` just the raw string — the server returns "Invalid credentials" which is better than most, but a format like "Invalid credentials. Check email and password, or reset." gives the user a recovery path.

**Tab labels**
- `items`: "Home", "Notifications", "Leaderboard", "Profile" / "Log In". When logged out the last tab says "Log In" (Title Case), but the sign-in button on the gate says "Sign in". Two labels, same destination. Pick "Sign in" across the board.

---

## Cross-cutting patterns I noticed

### The Sign-in / Sign-up / Log-in mess
This is the #1 inconsistency in the product:
- Web NavWrapper: "Log In"
- Web Login page button: "Sign In"
- Web Login page link to signup: "Sign up"
- Web Signup page: title "Join Verity Post", button "Create Account", link back: "Sign in"
- Signup email-taken warning: "Log in instead"
- Story regwall: "Sign Up Free" (Title Case)
- Story quiz block: "Sign up free" (sentence case)
- Story comments locked CTA: "Already have an account? Log in"
- Notifications anon hero: "Sign up" button, "Sign in" secondary
- Help page anon footer: "Sign up" / "Sign in"
- Kids sign-in gate: "Sign in"
- iOS: "Log In" tab / "Sign in" gate button / "Sign up" bottom link / "Sign Up Free" regwall button / "Sign in with Apple" / "Sign in with Google"
- Settings signout card: "Sign out" (sentence case, consistent)

**Proposed rule**: verb + sentence case, no second word capitalized. "Sign in", "Sign up", "Sign out". Never "Log in" (pick one of the two), never "Sign In" (Title Case), never "Sign Up Free" (marketing shout).

### Double headers everywhere
Every static content page (how-it-works, privacy, terms, cookies, dmca, help, accessibility) renders:
1. `NavWrapper` top-bar with "Verity Post" (44pt tall, fixed)
2. In-page centered "Verity Post" wordmark at 28px 800
3. `<h1>` at 28px 800 or 700

Three brand/page lines before content. Kill the middle one on pages that have the top-bar. Keep it on auth cards (which hide the top-bar).

### Empty-state copy is 80% informational, 20% actionable
- "No articles found." (home) — just informs
- "No saved articles here" (bookmarks) — just informs
- "No stories here yet" (kids) — adds "Try another category" — good
- "No matches. Try a different keyword." (search) — informs + suggests
- "No notifications yet. When someone replies, mentions you, or an article breaks, it lands here." (notifications) — explains WHAT triggers the empty to fill — the gold standard

Rewrite all the informational ones with the notifications pattern: what is this, how does it fill.

### Inline styles vs. design tokens
- Public pages: hand-coded `C = { bg, card, border, text, dim, accent }` literal, duplicated in every file. 15+ copies.
- Admin pages: `ADMIN_C`, `ADMIN_C_LIGHT`, `F` (fonts), `S` (spacing) — actual tokens.
- iOS: `VP.` namespace with tokens.

Admin and iOS have tokens. Public web is the odd one out. Consolidate the public palette into `@/lib/publicPalette` with the same structure as `ADMIN_C`.

### Passive voice in product copy
- "Your session expired." (iOS) — passive construction, but acceptable as a neutral state.
- "Discussion is locked until you pass the quiz above." (story page) — passive. Active: "Pass the quiz to unlock the discussion."
- "Your account doesn't have access to the notifications inbox yet." (notifications) — passive blame-deflection. Active: "We haven't turned on notifications for your account yet. Contact support."
- "Verification email sent." (home banner) — passive but that's fine for a confirmation.
- "Failed to save username. Please try again." (pick-username) — the verb "failed" puts the error on the software, good. But then "Please try again." is filler — the button itself is the retry.

Rule: every user-facing action-taken message should be active. Every system error that the user caused should say what to do, not just that something failed.

### Button labels that describe state vs. action
- "Saved" (bookmarked article) — state. Click toggles back. Inconsistent because the button next to it says "Share" (action).
  - Either both state ("Saved" / "Copied") or both action ("Unsave" / "Copy link") depending on state.
- "At cap (10)" — state, disabled. The tooltip "Upgrade for unlimited bookmarks" is the action. Move the tooltip text into the button when disabled: "Upgrade to save more".

### Touch targets
- Web: pill buttons at `padding: 6px 14px` — vertical ~30px — below 44pt. Applies to every page with pills (home, browse, leaderboard, story tabs, search mode pills, date preset pills, source chips).
- iOS: confirmed 13pt TabBar sits ~42pt tall.

Audit every `padding:` on a clickable: min-height 44px for primary actions, 36px acceptable for secondary inline chips.

### Loading states
- Home: "Loading articles…" text.
- Bookmarks: "Loading bookmarks…" text.
- Notifications: skeleton cards (good!)
- Profile: skeleton bar + spinner (good!)
- Settings: spinner
- iOS: `ProgressView()` everywhere

Two different loading patterns (text, skeleton) coexist. Prefer skeletons everywhere — skeleton keeps the user oriented to layout.

### Focus states
- The layout.js includes `*:focus-visible { outline: 2px solid #111111; outline-offset: 2px; }` — good global default.
- Many components override with `outline: 'none'` inline on inputs and then set a `border-color` change on `onFocus={() => setFocused(true)}`. This swaps a system focus ring for a custom one, which breaks keyboard-only users. The focus ring on tab should come back on keyboard focus at minimum — `:focus-visible` is what the global CSS targets, but React state-driven `focused` doesn't play with it.

---

## Responsive behavior notes

### 320px (iPhone SE 1st gen)
- Signup card: `padding: 40px 36px` + `maxWidth: 440px` — at 320, the card takes full width minus 32px outer padding (24+16 = 40 from the `32px 16px` container padding × 2 = 32). Card renders at 288px wide. 40+36 = 76px inner padding means only ~212px for form fields. Still OK but tight.
- Home feed: category pills `whiteSpace: nowrap; overflow-x: auto` — works.
- Story page action row: wraps unpredictably at 320 (bookmark+share+cap banner). Break.
- Admin hub group cards: fine, stacked.
- Kid profile picker: 2 profiles side-by-side at `minWidth: 160` would be 320+, so wraps to 1 column. Fine.

### 375px (iPhone SE 3rd gen, Mini)
- Everything fits. No specific breaks.
- Story page mobile tab bar 3 buttons: Article/Timeline/Discussion — at flex: 1 each, ~125px wide. Fine.

### 390-430px (current iPhones)
- All fine.
- One issue: login card at 420 maxWidth doesn't hit edges on ~410px viewport minus 32px padding; there's a 10-20px gap on sides that reads as "dialog" rather than "page". That's probably intentional given the card-on-page design, but worth confirming.

### 768px (iPad portrait)
- Home feed still 680px centered with massive white space to the sides.
- Admin hub: 8 group cards laid out as `gridTemplateColumns: repeat(auto-fill, minmax(220px, 1fr))` — at 768 that's 3 columns. OK.
- Story desktop sidebar kicks in at `min-width: 1025px` — so 768-1024 is mobile-tab mode, which means iPad portrait gets the mobile-style tabbed story page. Fine but surprising.

### 1024px (iPad landscape)
- Story desktop 2-column kicks in just above (1025). 1024 exactly is still mobile layout. Edge-case quirk of the media query.
- Home feed at 680px in a 1024 screen = huge side margins. Consider widening.

### 1440-1920px (desktop)
- Home feed: 680px centered. Reads like a mobile app in a desktop frame. Either embrace mobile-centric design explicitly (then don't make the admin console 960+ max-width — different intentions), or widen the public pages to at least 900px with card grid.
- Admin pages at 960 max-width: readable, but sections like the Users list truncate columns. Consider fluid width beyond 1280 for list-heavy admin pages.
- Story page layout.js has `max-width: 960` on the container, article column at `maxWidth: '65ch'` — good editorial choice, keeps line length readable.

---

## Copy principles this product should adopt (proposed)

1. **Verbs, always active, sentence case.** "Sign in", "Sign up", "Sign out", "Create account", "Save article", "Copy link". Never "Sign In", never "Login" as a verb, never "Submission" (use "Submit").

2. **Title Case only for proper nouns and page titles of truly-branded things.** Product page titles in sentence case: "How it works", "Help & support", "Your profile". Only "Verity Post" itself and legal document names ("Privacy Policy", "Terms of Service") deserve Title Case.

3. **Empty states tell the user what fills them, not just that they're empty.** Bad: "No bookmarks yet." Good: "Tap Save on any article to find it here later."

4. **Errors say what to do, not just what failed.** Bad: "Invalid input." Good: "Pick a password with at least 8 characters, a number, and a symbol." Bad: "Failed to save. Please try again." Good: "We couldn't save that — check your connection and try again." (The filler "Please try again" only adds weight if the button itself isn't an obvious retry.)

5. **Buttons commit. Links navigate. Don't blur the line.** `<a href="/logout">Sign out</a>` that POSTs via middleware = button styled as link. User reading a link-weighted control doesn't expect state change. Either use a real `<button>` or accept the styling cost.

6. **One label per destination, product-wide.** Pick "Sign in" OR "Log in", not both. Pick "Save" OR "Bookmark", not both. The nav, the CTAs, and the buttons all reach for the same verb. This is the #1 fixable issue in the product.

---

## Wins if the Top-15 land

1. Kill the triple-header on marketing/help/legal pages → immediate polish lift across 7 public pages.
2. Normalize Sign in/Sign up/Log in casing → kills the "is this product built by different teams?" signal.
3. Fix the iOS Dynamic Type gap → unblocks accessibility review for App Store submission.
4. Bring the notifications empty-state pattern to all empty states → +engagement on pages users currently leave.
5. Bump sub-44pt touch targets (pills, story action row, iOS tab bar) → lower mis-tap rates + passes accessibility auditing.

End.
