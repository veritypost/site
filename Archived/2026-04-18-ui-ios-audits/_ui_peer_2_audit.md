# UI Peer Audit #2 — Verity Post
Date: 2026-04-19
Focus: spacing + hierarchy + visual system

## Severity rubric

- **P0 (system)** — failure of the visual system itself. Violates platform minimums (WCAG, Apple HIG, Material touch targets), breaks a whole breakpoint, or locks out a user group. Ship blockers.
- **P1 (consistency)** — value is used in so many variations the product looks like four products glued together. Same element sized/colored/padded differently on two adjacent routes. Users feel it as "sloppy" without knowing why.
- **P2 (polish)** — reasonable decision, just not the one I would make. Fix when touching the file.
- **P3 (nit)** — label drift, one-pixel rounding mismatches, unused tokens.

## Top issues (ranked)

| # | Severity | Surface | Issue | Device/breakpoint |
|---|----------|---------|-------|-------------------|
| 1 | P0 | iOS, all views | `preferredColorScheme(.light)` is forced in `ContentView`; dark mode is hard-disabled across the whole app | All iOS |
| 2 | P0 | iOS, all views | Zero uses of `@ScaledMetric` / `dynamicTypeSize`. Every font is `.system(size: N)` — Dynamic Type is completely broken for vision-impaired readers | All iOS |
| 3 | P0 | Web, every page | Entire public web ships with 5 total media queries. No responsive behavior between 320 → 1920. The 680/720/800/900 `maxWidth` containers just sit in the middle of a desktop with nothing on either side | 1024 / 1440 / 1920 |
| 4 | P0 | Web home `/`, search dialog | Search close button "Cancel" is a bare text link with padding:0 (line 565-569 of page.tsx). Hit area is roughly 45×18 — fails Apple's 44×44 mobile minimum | 320–414 |
| 5 | P0 | Web home `/`, subcategory pills | Subcat pills at `padding: '4px 12px'` + fontSize 12 → ~26px tall. Fails 44×44 iOS minimum. Same pattern recurs on leaderboard, search dialog, and story reader | 320–414 |
| 6 | P0 | Web home `/`, nav search icon | `<button padding: 6>` wrapping an 18×18 SVG = 30×30 hit area. Fails mobile minimum | 320–414 |
| 7 | P1 | Whole web | There are two parallel design systems in use — raw inline `C = { bg, card, border… }` per-page, and `@/components/admin/*` + `ADMIN_C` + `F` + `S` tokens. Only `/profile` and `/profile/settings` use the admin system; everything else duplicates colors inline. Identical tokens, three naming conventions | All |
| 8 | P1 | Whole web | 16 distinct `borderRadius` values in use: 2, 3, 4, 6, 7, 8, 9, 10, 12, 14, 16, 20, 22, 24, 26, 28, 36, 48, 70, 99, 999. There is no radius system — this is 21 choices | All |
| 9 | P1 | Whole web | 16 distinct `fontSize` values (9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 36, 60). iOS adds 17, 30, 32, 34, 40. Combined system has 21+ type sizes with no documented scale | All |
| 10 | P1 | Whole web | Container `maxWidth` sprawl: 320, 340, 360, 380, 400, 420, 440, 480, 520, 560, 600, 640, 680, 720, 760, 800, 820, 880, 900, 960. That's twenty container widths across a product that only has three page classes (narrow form, feed, wide admin) | All |
| 11 | P1 | Web home `/` vs `/browse` vs `/leaderboard` | Sticky top nav on `/` is `height: 56`. Top bar from `NavWrapper.tsx` is `height: 44`. Home draws its OWN logo nav BELOW NavWrapper's logo bar, producing a 100px-tall stacked double header on that route | 320–1920 |
| 12 | P1 | Web home `/` | `CategoryBadge` uses `color: C.accent` (black) but letterspacing 0.03em uppercase at 11px. Breaking badge right next to it is red background + white text at 10px. Two badges, two different sizing/color systems in the same 20px row | All |
| 13 | P1 | Web | Avatar sizes: 28, 32, 40, 44, 48, 56, 64, 72, 80, 88, 96, 140, 180. Thirteen avatar sizes across the product. Messages uses 28 AND 44 in the same screen. Profile settings uses 26, 28, 56, 88 in the same form | All |
| 14 | P1 | Web home, search dialog, leaderboard | Two pill styles: "radius 99" AND "radius 999", both treated as full-round. Same component, inconsistent token | All |
| 15 | P1 | Web | Bottom nav height is 64px + safe-area inset. Text tabs at fontSize 13, padding vertical 8. Text on white (blur 12) with opacity 0.97. Each tab button is ~48×48 touch target but the label text itself is 13px — active state weight flip from 500→700 is jarring and causes 1px layout shift between tabs | 320–414 |
| 16 | P1 | Web home, story, messages | The accent color "black" is used for: primary buttons, active pill state, bold body text, badge text, and the VP logo square. The system has no way to distinguish "primary CTA" from "active filter" from "emphasized text" — everything is #111111 | All |
| 17 | P1 | Web home `/` breaking banner | Banner uses raw `#ef4444` background inline, while globals.css declares `--danger: #b91c1c` (DA-055 intentional fix). Home page ignores the token and uses the old red. Same in breaking badge on story cards | All |
| 18 | P1 | Web welcome page | Carousel card at `padding: '32px 24px', minHeight: 320` then "Skip" button in top-right at padding 4 — Skip hit area is ~30×20. Ironic on a first-touch onboarding screen | Mobile |
| 19 | P1 | Messages page | Two-panel iMessage-style layout at `maxWidth: 720`, fixed. Below 600px effective width, panels animate between 0/100% width, but above 720px the entire app sits dead-center in a white void with no panel expansion | 768 / 1024 / 1440 |
| 20 | P1 | Web home + iOS | The top-bar logo `height: 44`, the bottom nav `height: 64`. The iOS TextTabBar uses `padding: .vertical 14` producing ~44pt tabs. iOS and web disagree on bottom-nav height by 20px and on typography weight of active tab | Cross-platform |
| 21 | P2 | Web home `/`, search overlay | Sr-only h2 dialog title is inlined with `position: 'absolute', left: -9999, width: 1, height: 1`. The repo already declares `.vp-skip-link` for sr-only — the inline pattern reinvents it instead of using a shared class | All |
| 22 | P2 | Web all pages | Footer (NavWrapper.tsx line 224) is `maxWidth: 680` but nav bar is at 680 too, while `/bookmarks` uses 900, `/leaderboard` uses 800, `/search` uses 820 — footer sits inside a narrower column than the content above it on 5 routes | ≥768 |
| 23 | P2 | Web home category pills | Pills render in a horizontally-scrollable strip with `scrollbarWidth: 'none'`. No fade gradient on right edge, no scroll indicator — users on mouse-only desktop can't tell the strip scrolls | Desktop |
| 24 | P2 | Web story page | `maxWidth: 960` on story reader vs 680 on home vs 720 on browse. Two-column story has no grid — it's a single column that gets wider than comfortable (75+ CPL) at 1440+ | 1440 / 1920 |
| 25 | P2 | iOS tabs | Active tab flips from `.medium` (500) to `.bold` (700) on tap. Causes a small reflow in the tab row. Either animate the weight or keep constant weight + color shift only | iOS |
| 26 | P3 | iOS LoginView / SignupView | Buttons use `Color.black` directly (LoginView:132, SignupView:203) instead of `VP.accent`. Same color today, not tomorrow | iOS |

## Spacing + rhythm findings

### Home `/`
- Vertical rhythm between sections is arbitrary. Breaking banner is `padding: 10px 16px`. Category pills strip has `padding: 14px 0`. Subcategory strip has `padding: 0 0 12px`. Story card `marginBottom: 12`. "Day N" streak header has `margin: '0 0 12px'` only when articles are loaded. So page gaps are 10, 12, 14 with no justification per row.
- The sticky top nav at `height: 56` inside a page that is also wrapped by NavWrapper's `height: 44` top bar means the home has a 100px tall stacked header. Double brand. Fix: remove home-page nav, rely on the global NavWrapper top bar alone.
- Category badge (11px uppercase, tracking 0.03em) sits at 4px above title (15px, weight 700). That 4px is too tight — the label visually collides with the title. Rhythm for cards: 8/4/4/6 (label, title, excerpt, date). 8 between label and title would read better.

### Story `/story/[slug]`
- `padding: 18, borderRadius: 12` on some cards, `padding: '18px 20px', borderRadius: 12` on adjacent cards. Same treatment, two different padding values on one page.
- Timeline uses `paddingLeft: 24` with an absolute-positioned 1px line at `left: 4`. Dots at `left: -26`. The math is fragile; adjust one side and the other breaks. Refactor to CSS grid or flex with fixed gutters.

### Profile `/profile`
- This page is the only public page that opts into `@/components/admin/*` + `ADMIN_C` + `S[n]` spacing tokens. So profile has a consistent scale (S[2]=8, S[3]=12 ADMIN_C palette) but it doesn't match the rest of the app. If profile is the vision, roll it out. If it isn't, pull it back.

### Kids `/kids`
- Kid avatars at 72×72 with borderRadius 36 (proper half-round). Adult avatars at 80×80 with borderRadius '50%'. Same intent, two encodings.
- Kid profile page uses `KID.shadow` from a kid theme module; nobody else in the app has access to a shadow token. So shadows on kids are decorative, but the adult-surface shadow is ad-hoc (`boxShadow: '0 16px 48px rgba(0,0,0,0.12)'` on /profile, `0 6px 24px rgba(0,0,0,0.08)` on /messages menu, `0 4px 20px ${avatarColor}40` on profile/[id]).

### Settings `/profile/settings`
- Desktop left-nav + mobile accordion via `matchMedia` at 720 cutoff — this is one of only FOUR matchMedia calls in the entire public app. So this page is responsive while the rest is not.

## Touch target violations

Apple HIG: 44×44pt. Google MDC: 48×48dp. WCAG AAA: 44×44 CSS. I'll fail anything <44.

| Surface | Element | Measured | Min required |
|---------|---------|----------|--------------|
| `/` nav | Search SVG button | 30×30 | 44×44 |
| `/` search header | "Cancel" text button | ~50×18 | 44×44 |
| `/` search header | "Search" solid button | ~88×32 | 44×44 (height fail) |
| `/` search, date presets | Preset pill | 80–90 × ~30 | 44×44 (height fail) |
| `/` subcategory pills | Subcat pill | variable × ~26 | 44×44 (height fail) |
| `/` search, source chips | Source chip | variable × ~26 | 44×44 (height fail) |
| `/welcome` | Skip button | ~40×24 | 44×44 |
| `/messages` | Convo "..." menu trigger | ~34×28 | 44×44 |
| `/messages` | "Back" button top-left | ~56×20 | 44×44 |
| `/messages` | "New" button | ~58×28 | 44×44 (height fail) |
| `/story/[slug]` | Source publisher pill | ~70×22 | 44×44 (height fail) |
| `/story/[slug]` | Breaking/Developing micro-pill | ~60×18 | 44×44 (height fail) |
| `/profile/kids` | Avatar color swatch (28×28) | 28×28 | 44×44 |
| `/kids` nav | Kid profile avatar pick (72×72) | 72×72 | PASS |
| `/leaderboard` | Period/tab chip | variable × ~26 | 44×44 (height fail) |
| `NavWrapper` footer | Policy links (Help, Privacy, etc.) 11px | auto × ~14 | 44×44 |
| Home breaking banner dismissal (`x`) | `style={{ background: 'none', border: 'none', fontSize: 18 }}` | ~20×20 | 44×44 |
| iOS `TextTabBar` | Tab target ~48×44pt | 48×44 | PASS (barely) |
| iOS `sessionExpiredBanner` Sign in + X | Sign in ~60×22, X ~14×14 | — | 44×44 (fail) |

## Typographic scale audit

Current inventory (web inline styles):
- Body sizes used: 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 36, 60 → 16 unique
- Admin palette (`F`) declares xs/sm/md/lg/xl but is only consumed on 4 pages
- Line heights shown: 1.4, 1.5 (story page also has unspecified)
- Letter-spacing: -0.03em (logo), -0.01em (top-bar logo), 0.03em (category badge uppercase), 0.05em (timeline NOW, breaking), 0.06em (search result count), 0.1em (BREAKING text)

Proposed 7-step scale (to replace all 21 sizes across web+iOS):

```
xs   11  captions, labels, dates
sm   13  body small, pill text, secondary UI
base 15  primary UI, body default
md   17  article body (reading), strong UI
lg   20  section headers
xl   24  page h1, card h1
2xl  32  marquee, recap heroes
```

Weights: 400, 600, 700 only. Drop 500, 800, 900 (currently using all five).

Letter-spacing: standardize at `-0.01em` (display 20+), `0` (body), `0.05em` (uppercase badges). Kill the 0.03 / 0.06 / 0.1 outliers.

## Color / palette audit

Every page declares its own `C = {...}` constant — the same six colors repeated 20+ times. This is the single biggest visual-system failure. Examples:

- `bg` → `#ffffff` repeated in `/`, `/browse`, `/login`, `/signup`, `/welcome`, `/messages`, `/leaderboard` (and so on)
- `accent` → `#111111` in every page, but several pages use `Color.black` or raw `#111` inline
- `dim` → `#666666` in every page-level C const, but globals.css overrode it to `#5a5a5a` (DA-054 fix). So CSS vars say #5a5a5a, inline styles still ship #666
- `danger` → globals.css says `#b91c1c` (DA-055 fix), but `/` home, story breaking badge, and login error all use `#ef4444`

Accent creep detected:
- Kids palette imports `KID.*` and uses per-profile accents (kidColors 8 values)
- Category colors on `/browse` (`CAT_STYLE`) declare pastel+accent pairs for 10 categories — nowhere else in the product uses these
- Leaderboard tier colors (64748b, 3b82f6, 0d9488, d97706, fbbf24) exist only on `/profile`
- Auth badges use `#22c55e` (Verified) vs `#111111` (Expert); messages red dot uses `#dc2626`; home breaking banner uses `#ef4444`; verify banner uses `#fffbeb`/`#fde68a`/`#92400e` — four distinct amber family colors

Proposed tighter mapping (web and iOS share):

```
bg            #ffffff
surface       #f7f7f7
border        #e5e5e5
border-strong #222222
text          #111111
text-soft     #444444
text-dim      #5a5a5a      (consolidate from 666)
text-muted    #999999
accent        #111111
accent-ink    #ffffff
success       #16a34a      (consolidate from 22c55e + dc)
danger        #b91c1c      (consolidate from ef4444 everywhere)
warn          #b45309      (consolidate from f59e0b + d97706)
```

Then ONE tier/category accent family scoped to leaderboard, browse, and kids per route — but never mixed into the home feed.

Action: delete every local `const C = {...}` at the top of every page and import `tokens.ts` from a shared module.

## Button hierarchy audit

I counted five distinct "primary button" treatments in the public web:

1. `padding: '11px 22px', borderRadius: 9, fontSize: 14, fontWeight: 700, background: '#111', color: '#fff'` (messages upgrade)
2. `padding: '10px 22px', background: '#111', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600` (messages error retry)
3. `padding: '12px 28px', background: '#111111', color: '#ffffff', borderRadius: '8px', fontSize: '15px', fontWeight: 700` (help page)
4. `padding: '12px 32px', borderRadius: 10` (story CTA)
5. `padding: '8px 16px', borderRadius: 8, background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600` (home search Search button)

Three different paddings, three different fontSizes (13, 14, 15), two radii (8, 9, 10), three weights (600, 700, no-weight). They're all the same button.

Secondary button variants: "cancel" as bare text link (home search), "cancel" as border-only (appeal), "cancel" with padding 4 (welcome skip). Three treatments.

Tertiary: pill filters, chip filters, ghost buttons with transparent background — pills ALSO used as "Search" submit verb inside the search overlay. Pill hierarchy is muddled.

Proposed:

```
Primary:   h=44, padding=0 24, radius=10, weight=600, bg=accent,  fg=bg
Secondary: h=44, padding=0 20, radius=10, weight=600, bg=surface, fg=text, border=1 border
Tertiary:  h=44, padding=0 16, radius=10, weight=600, bg=transparent, fg=text, no border
Pill:      h=32, padding=0 14, radius=pill, weight=600, fg=dim, bg=bg, active→fg=white,bg=accent
```

One primary, one secondary, one tertiary, one pill. Pills only for filters, never for verbs.

## Responsive behavior per breakpoint

### 320px (iPhone SE 1st gen)
- Home category pill strip overflows. `padding: 14px 0` + 8 pills with whitespace nowrap + pill padding '6px 16px' means users must horizontally scroll to see past "World" category. Acceptable but no fade indicator.
- Welcome page: card minHeight 320 + padding '32px 24px' + page padding '24px 16px' = 64px of horizontal padding consumed. Content column ~256px. Body copy wraps tightly.
- Messages: conversation list and chat view fight for width. At 320 there's no tablet split — panel is full-width, but 44×44 avatar + 16px horizontal padding leaves ~244px for username + timestamp + unread badge. Unread badge collides with timestamp.
- Kids home: profile picker at `maxWidth: 440` on a 320 screen = horizontal scroll or overflow. No explicit fallback.
- Login inputs at fontSize 15, padding '11px 14px' are fine, but the field width is 100% - 32px page padding = 288px. Fine.

### 375px (SE 3rd / mini)
- Mostly works. Home category pills still overflow but that's by design.
- Story page side padding sometimes '24px 16px', sometimes '40px 32px' (error state) — inconsistent.

### 768px (iPad portrait)
- `maxWidth: 680` home content now sits in a 680px column with 44px of white on each side. Fine.
- `/leaderboard` maxWidth: 800 vs `/` maxWidth: 680 → when switching routes the content column width JUMPS 120px. Disorienting.
- `/profile` uses the admin system and renders a multi-column layout that doesn't trigger until mobile<720. So at 768 the profile shows desktop chrome.
- `/messages` two-pane stays at maxWidth: 720 with borderLeft + borderRight — visible rails on iPad. Ok.

### 1024px+
- Public home stays in a 680px column. Leaderboard in 800. Search in 820. Bookmarks in 900. Story in 960. Every page picks a different column. User shifts route → content jumps between widths.
- No `/` layout adds a sidebar, related stories, or anything the extra width could carry. Pure waste above 900.
- Admin pages expand to fit (good). But the boundary between "public mobile-first" and "admin desktop-first" is abrupt and uncrafted.

### 1440px+
- Same as 1024 — content column stays fixed. Entire product effectively presents as mobile-in-a-void on a laptop.
- No max-width safety on text: at 1920 `/browse` headline ("Browse") stays at fontSize 22 weight 800. Should scale up.
- Footer sits aligned to content column (680) but NavWrapper bottom nav spans full viewport → visual mismatch where nav is wall-to-wall and content is centered.

### 1920px+
- Story detail at maxWidth 960 is borderline acceptable (~80 CPL at 15px). But the top bar stretches, bottom nav stretches, banners stretch — only the content doesn't. Feels broken.

## iOS-specific

### Dynamic Type coverage
- **0 usages of `@ScaledMetric`, `dynamicTypeSize`, `textStyle(.body)`, or semantic font sizes across the entire iOS app.** Every font is `.system(size: N, weight: .X)`. Users with Accessibility → Larger Text enabled get no benefit. This is a hard fail for App Store accessibility review.
- Fix: introduce `VPFont` helpers that wrap `Font.system(.body)` + `.relativeTo(size: N, textStyle: .body)` and swap all `.font(.system(size: 13))` to `.font(VPFont.sm)`.

### Safe Area handling
- `ContentView` uses `.safeAreaInset(edge: .bottom)` for both adult and kid tab bars. Correct.
- `HomeView` and `StoryDetailView` use raw `.padding(.horizontal, 20)`. Edge-to-edge visuals (the black search overlay, specifically) rely on `.ignoresSafeArea()` via `Color.black.opacity(0.5).ignoresSafeArea()` (HomeView:216) — acceptable but sparse.
- No top safe-area handling for a hidden-nav status bar on iPhone X+: top of screen is flush with the notch on scroll in StoryDetailView. Needs an inset.

### Dark Mode support
- `ContentView.body` ends with `.preferredColorScheme(.light)` — forces light mode system-wide. Dark mode is effectively disabled.
- `VP.bg = Color.white`, `VP.text = Color(hex: "111111")` — hardcoded hex, not semantic (`Color("vp/bg")` asset catalog entries). So even if dark mode were enabled, there's no way to swap.
- `LoginView` also has its own `.preferredColorScheme(.light)` (line 185) — redundant override.

### Touch target conformance
- `TextTabBar`: 48×44 tappable area (vertical padding 14 × fontSize 13 ≈ 44pt). Barely passes.
- `sessionExpiredBanner`: "X" dismiss is 10pt font `Image(systemName: "xmark").font(.system(size: 10, weight: .bold))` wrapped in a Button with no explicit `.frame(minWidth: 44, minHeight: 44)` — fails.
- `SignInGate` "Create account" Button is a bare text link (no bg, no padding). Fails.
- `LoginView`/`SignupView` "Forgot password?" text buttons lack minimum frame. Fail.
- `KidTabBar` padding unchecked — likely passes given text size 14+, but no frame guarantee.

### iOS vs Web parity
- Web top bar = 44, iOS does not have a top bar at all (NavigationStack). Logo parity is broken.
- Web bottom nav = 64 (includes safe area), iOS `TextTabBar` padding 14 + 13pt text ≈ 42-48. Bars are ~20pt taller on web.
- Web "Search" entry = SVG icon button; iOS HomeView uses an equivalent magnifyingglass. Icon style roughly matches (stroke-based).

## Cross-cutting visual-system proposals

Adopt these as hard rules:

1. **Spacing scale**: 4, 8, 12, 16, 24, 32, 48, 64. Nothing else. No 5/6/7/10/14/18/20/26/28 padding anywhere.
2. **Radius scale**: 4 (micro), 8 (chip), 12 (card/input), 20 (modal), 999 (pill). Delete all of 2/3/6/7/9/10/14/16/22/24/26/28/36/48/70.
3. **Type scale**: 11, 13, 15, 17, 20, 24, 32 — seven sizes. Weights 400/600/700 only.
4. **Color tokens**: enforce `var(--token)` in CSS and `VP.*` in Swift. Delete every `const C = {...}` inline map — import a shared `tokens.ts`.
5. **Container widths**: pick three (narrow=480 form, feed=720, wide=960 admin). No other maxWidth values allowed.
6. **Touch targets**: every interactive element must be ≥44 CSS / 44pt. Add a dev-only lint that fails PRs with height<44 on anchor/button/input.
7. **Shadows**: define three — `sm=0 1 2 rgba(0,0,0,.06)`, `md=0 4 16 rgba(0,0,0,.08)`, `lg=0 16 48 rgba(0,0,0,.12)`. Every current shadow is a different custom string; consolidate.
8. **Bottom nav parity**: web = 56, iOS = 56 (SafeArea auto). Text-only, fontSize 13, weight flip 500→700 on active replaced with color shift at constant 600.
9. **Breakpoints**: declare 3 — 768 (tablet), 1024 (small desktop), 1440 (large). Every page must at minimum widen its column or add a sidebar at ≥1024, not sit at 680.
10. **Dark mode on iOS**: remove `.preferredColorScheme(.light)`. Move every `Color(hex:)` to asset catalog with a dark variant. Ship dark mode or don't claim to be accessible.
11. **Dynamic Type on iOS**: wrap every `.font(.system(size: N))` in a helper that passes `relativeTo: .body|.callout|.caption`. Non-negotiable for App Store compliance.
12. **Kill the double top bar on home**: `/` page renders its own sticky nav inside a surface that already has `NavWrapper`'s top bar. Remove the home-local one.
13. **Avatar sizes**: three only — 32 (inline), 48 (list row), 80 (profile hero). Delete 26/28/40/44/52/56/64/72/88/96/140/180.
14. **Badges**: one size, one treatment. Uppercase 11px, 0.05em letter-spacing, weight 700, padding 2×8, radius 4, tinted bg at 12% opacity of semantic color. Apply to Breaking, Developing, Expert, Verified, Tier. Stop inventing per-badge paddings.
15. **Skip link & sr-only**: one CSS class (`.vp-skip-link` already exists), everyone uses it. Delete the inline `position: -9999` hacks in `page.tsx` search dialog heading.
