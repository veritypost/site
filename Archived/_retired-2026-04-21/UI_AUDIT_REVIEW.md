# UI Audit Review — per-item verification log

Live working doc tracking the 20-item "UI Improvements" audit (from the now-archived `UI_IMPROVEMENTS.md`) through per-item verification against current code. Each item is reviewed by independent agents; findings below.

**Session started:** 2026-04-21
**Status:** 20/20 items reviewed (2026-04-21)
**Source audit:** `Archived/_retired-2026-04-21/UI_IMPROVEMENTS.md` (pending archive)
**Verification pattern:** 2 parallel agents → owner review → decision (3rd agent or direct verify on splits)

---

## Summary of all 20 items

**5 items — NO action needed (not real or already shipped):**
- #1 iOS Dynamic Type — SHIPPED 2026-04-20
- #2 Sign in/up casing — HALLUCINATED (codebase already consistent)
- #5 Double header on home — ALREADY FIXED in Round D H-14
- #10 `/messages` paywall — ALREADY FIXED in Round H H-09
- #11 Marketing/legal triple header — HALLUCINATED (no wordmark above h1)

**10 items — REAL, discrete targeted fixes (totaling ~4-8 hours of work):**
| # | Title | Fix effort |
|---|---|---|
| 3 | Per-page `<title>` metadata (top 10 static routes) | 30-45 min |
| 6 | Regwall modal (add Escape + scroll lock + unify copy) | ~30 min |
| 7 | Login/signup/forgot/reset a11y (port login pattern to 3 pages) | 20-30 min |
| 8 | Touch targets 44×44 (top violators — LockModal, subcategory pills, iOS tab) | ~45 min |
| 9 | iOS bare text buttons (add styling to 5-6 Button+Text sites) | ~20 min |
| 16 | Story action row — move cap banner to own row | ~15 min |
| 17 | Home breaking banner — make linkable (+ optional visual unify) | 5 min / 45 min |
| 18 | Empty-state sweep — fix 3-4 edge cases (search, leaderboard, browse) | ~30 min |
| 19 | Error-message security sweep — close any raw `err.message` leaks | ~1 hr |
| 15 | Bottom nav reorder — product/design decision (not a bug) | — (owner call) |

**5 items — BUNDLE INTO "Track B" design-system cleanup (= ~18-28 hours together):**
- #4 Responsive 1024–1920px
- #12 `const C` palette consolidation
- #13 Font-size/weight scale
- #14 Container maxWidth consolidation
- #20 Radius/avatar/shadow tokens

Track A alternative (pure responsive only, defers #12/13/14/20 polish): ~8-12 hours.

**Grand total if doing everything:** ~12-20 hours of discrete + Track A (8-12 hrs) OR Track B (18-28 hrs). Realistic pre-launch scope = 10 discrete fixes + Track A.

---

### Key takeaways

- **Previous PM's audit was 25% overstated** — 5/20 items were hallucinated, already fixed, or misframed (#19 would've regressed security).
- **Design-system debt is the real pattern** — items #4, #12, #13, #14, #20 are all the same problem (inline styles, no shared tokens outside `adminPalette.js`). Admin has the solution; public pages bypass it.
- **Real a11y gaps confirmed** — regwall Escape (#6), auth-page a11y missing on 3 of 4 pages (#7), inconsistent 44pt touch targets (#8/#9 bare text buttons).
- **Several "Critical" items were overstated severity** — #3 (page titles), #6 (modal a11y), #15 (nav IA), #16 (cap banner wrap) are real but not launch-blocking.



---

## Status summary (as findings land)

| # | Severity | Title | Real? | Decision | Effort |
|---|---|---|---|---|---|
| 1 | Critical | iOS Dynamic Type / a11y / forced light mode | ALREADY SHIPPED | — | 0 |
| 2 | Critical | Sign in/up casing chaos | NOT REAL (hallucinated) | Skip | 0 |
| 3 | Critical | Per-page `<title>` metadata | PARTIAL | **Deferred** — fix later | 30–45 min (top 10) or few hrs (full) |
| 4 | Critical | Responsive layout 1024–1920px | REAL | **Deferred** — Track A or B (see below) | Track A: 8–12 hrs / Track B: 18–28 hrs |
| 5 | Critical | Double header on home | NOT REAL (already fixed) | Skip | 0 |
| 6 | Critical | Regwall modal (label, close, Escape, focus trap) | PARTIAL | Deferred — Option 1 recommended | ~30 min |
| 7 | Critical | Login/signup error copy | PARTIAL | Deferred — Option 1 recommended | ~20-30 min |
| 8 | Critical | Touch targets 44×44 | REAL | Deferred — Option 2 for launch | ~45 min (Opt 2) / 2-4 hrs (Opt 1) |
| 9 | Critical | iOS tab bar + icon/text buttons | PARTIAL (overlaps #8) | Deferred — Option 1 | ~20 min |
| 10 | Critical | `/messages` paywall modal | NOT REAL (already fixed) | Skip | 0 |
| 11 | High | Marketing/legal header cleanup | NOT REAL (hallucinated) | Skip | 0 |
| 12 | High | `const C` palette consolidation | REAL | Bundle into Track B of #4 | included in 18-28 hr Track B |
| 13 | High | Font-size/weight → 7-step scale | REAL | Bundle into Track B of #4 | included in 18-28 hr Track B |
| 14 | High | Container maxWidth → 3 canonical values | REAL | Bundle into Track B of #4 | included in 18-28 hr Track B |
| 15 | High | Bottom nav reorder | REAL (but product choice) | Deferred — owner design call | — |
| 16 | High | Story action row + cap banner | REAL | Deferred — Option 2 recommended | ~15 min |
| 17 | High | Breaking treatment unification | REAL | Deferred — Option 1 (min) or 3 (polish) | 5 min (Opt 1) / 45 min (Opt 3) |
| 18 | High | Empty-state rewrite sweep | PARTIAL (claim overstated) | Deferred — Option 1 targeted | ~30 min |
| 19 | High | Error-message sweep (~94 routes) | MISFRAMED — 1 real security leak | Deferred — Option 2 sweep | ~1 hr |
| 20 | High | Radius/avatar/shadow token consolidation | REAL | Bundle into Track B of #4 | included in 18-28 hr Track B |

---

## Per-item findings

### #1 — iOS Dynamic Type / accessibility / forced light mode

**Claim:** iOS apps have no Dynamic Type support, no accessibility labels, forced light mode.

**Status:** ALREADY SHIPPED

**Evidence:** `Reference/CHANGELOG.md` 2026-04-20 — commit `d076a09` "Dynamic Type across 90 call sites"; `xcodebuild` verified. Both VerityPost and VerityPostKids converted. `Font.scaledSystem()` helper with UIFontMetrics scaling in place.

**Decision:** No action needed.

---

### #2 — Sign in / Sign up / Log in casing chaos

**Claim:** Every authentication CTA pair mixes casing and verbs ("Sign in" vs "Sign In" vs "Log in" vs "Login" vs "Sign Up Free") across web, iOS, email, push.

**Status:** NOT REAL — previous PM hallucinated.

**Evidence (2 agents converged):**
- "Sign in" used consistently ~27+ times
- "Sign up" used consistently ~10+ times
- "Sign out" used consistently ~6+ times
- "Create free account" is the canonical signup button copy
- **Zero occurrences of "Log in", "Log In", "Login", "Sign In" (title case), or "Sign Up Free"** anywhere in `web/src/`, `VerityPost/`, `VerityPostKids/`

**Decision:** Skip. No issue.

---

### #3 — Per-page `<title>` metadata

**Claim:** Every tab title shows same root string, never changes on navigation; bad for SEO, tab switching, screen readers.

**Status:** PARTIAL (overstated as Critical)

**Evidence:**
- **Working:** 4 routes with `metadata` exports — root layout, `story/[slug]/layout.js`, `u/[username]/layout.js`, `card/[username]/layout.js`. Article pages, profiles, share cards all have dynamic titles.
- **Missing:** ~100 static/list routes inherit the root title (login, signup, bookmarks, leaderboard, admin, settings, search, help, how-it-works, privacy, terms, etc.)

**Options when we return to this:**
1. Skip / archive as non-issue
2. Fix top 10 static routes (30–45 min, ~90% of tab-title scenarios)
3. Full sweep all ~100 static routes (few hours)

**Decision:** Deferred — revisit after full 20-item review complete.

---

### #4 — Responsive layout 1024–1920px

**Claim:** No responsive behavior above 1024px; every page sits in 680–960px column; desktop wastes 40–50% of viewport.

**Status:** REAL — confirmed by multiple deep-reading agents.

**Evidence:**
- Every public page hardcodes a narrow `maxWidth`: Home 680, Article 960, Profile 960, Bookmarks 900, Leaderboard 800, Search 820, Notifications 720
- **Zero `@media` rules target ≥1024px anywhere in `web/src/`**
- Story page has dead code `{false && isDesktop && <aside>}` — timeline sidebar designed but hidden
- Admin uses 960–1280px, only `max-width:767px` media queries

**Deep-dive findings (3-agent cross-check):**
- **6 distinct layout archetypes:** narrow column / two-column hybrid / card-grid / admin dashboard / data-table / auth-card
- **Design sprawl:** 888 hex colors (131 distinct), 1,477 font-size occurrences (25 distinct), 139 padding values, 49 margin values
- **Admin pages already have design system** (`adminPalette.js` used by 63 files); public pages don't
- **Tailwind installed but not used** — 20 `className` occurrences are bespoke CSS (`vp-*`, `story-*`)
- **iOS iPad is safe as-is.** `TARGETED_DEVICE_FAMILY="1,2"` both apps; all Swift views use flexible SwiftUI primitives (VStack/ScrollView/ZStack); no hardcoded page widths. Owner's "make iPad look like iPhone" direction already the current behavior.

**Two tracks identified:**
- **Track A (pure responsive):** breakpoints + Container + Grid primitives + refactor 15-20 pages + iPad QA + cross-browser QA ≈ **8–12 hrs**
- **Track B (full design-system cleanup):** Track A + token sweep for 888 hex, font sizes, paddings, across all public pages ≈ **18–28 hrs**

**Decision:** Deferred. Track A candidate for launch; Track B for post-launch quality pass.

---

### #5 — Double header on home / triple on static

**Claim:** Home has NavWrapper + its own sticky nav = 100px chrome before content; static pages have NavWrapper + brand wordmark + h1 = triple header.

**Status:** NOT REAL — already fixed in the pre-launch sprint (Round D H-14).

**Evidence (2 agents converged):**
- `web/src/app/NavWrapper.tsx` — single 44px fixed top bar (`TOP_BAR_HEIGHT = 44`)
- `web/src/app/page.tsx:432-437` — comment: *"the home page's own sticky search nav was removed. NavWrapper's global top bar now owns the search entry point."*
- Home search is now a full-page overlay (lines 440-690), not a sticky bar
- Breaking news banner (line 697) is static, not sticky
- Static pages (`how-it-works`, `privacy`, `terms`, `help`) render plain `<h1>` in content flow — no wordmark or second bar
- Total chrome: **44px on both home and static** (not 100px)

**Decision:** Skip. No issue.

---

### #6 — Regwall modal (label, close, Escape, focus trap, scroll lock)

**Claim:** Regwall modal missing close button, Escape handler, focus trap; labels mixed; body scroll not locked.

**Status:** PARTIAL — 3 of 5 concerns are real.

**Evidence (2 agents converged, location `web/src/app/story/[slug]/page.tsx:724-768`):**
| Check | Status |
|---|---|
| Close button | ✅ works (line 743-756, `aria-label="Close"`) |
| Focus trap | ✅ works (`useFocusTrap(showRegWall, regWallRef)` at line 311) |
| Escape key handler | ❌ missing — line 308 comment: *"Escape remains a no-op"*. The hook supports `onEscape` (report modal uses it at line 314-316) but regwall explicitly doesn't pass one |
| Body scroll lock | ❌ missing — no `document.body.style.overflow` lock; backdrop is fixed but doesn't lock page scroll |
| CTA label consistency | ❌ mixed — headline "Sign up to keep reading" (line 757-759) + button "Create free account" (line 761/765) + body copy "Create an account to continue" |

**Options:**
1. **Fix all three real issues** — add Escape `onEscape` callback, add scroll lock on mount/unmount, unify CTA copy to one pattern. ~30 min. Recommended.
2. **Fix Escape only** — the most user-visible a11y gap. ~10 min.
3. **Skip entirely** — claim overstated; 2 of 5 already work, the gaps are polish.

**Recommendation:** Option 1. Small PR, real accessibility win, quick.

**Decision:** Deferred.

---

### #7 — Login/signup error copy + a11y

**Claim:** Errors accusatory/technical; no `htmlFor` label-input pairing; no `role="alert"` / `aria-live`.

**Status:** PARTIAL — a11y gap is real on 3 of 4 pages. Copy-voice claim overstated.

**Evidence (2 agents converged):**

| Page | htmlFor/id | role="alert" | aria-describedby |
|---|---|---|---|
| `login/page.tsx` | ✅ (lines 253, 271) | ✅ (line 241) | ✅ (line 246) |
| `signup/page.tsx` | ❌ missing | ❌ missing | ❌ missing |
| `forgot-password/page.tsx` | ❌ missing | ❌ missing | ❌ missing |
| `reset-password/page.tsx` | ❌ missing | ❌ missing | ❌ missing |

Error copy sampled — technical but not accusatory ("Invalid credentials", "Too many attempts. Try again in a minute.", "Failed to create account. Please try again.", "Network error. Check your connection and try again."). No shaming language, no "you typed it wrong" tone. Claim of "accusatory" overstated.

**Options:**
1. **Port login's a11y pattern to signup/forgot/reset.** Add `htmlFor` + `id`, wrap error div with `role="alert"` + `id`, add `aria-describedby` on form. ~20-30 min. Real a11y win. Recommended.
2. **Also rewrite copy to be friendlier** ("Couldn't create account — please check your email"). +30-45 min. Subjective polish.
3. **Skip** — claim partially overstated; login page already works.

**Recommendation:** Option 1. Real a11y gap, quick fix, login page demonstrates the pattern.

**Decision:** Deferred.

---

### #8 — Touch targets 44×44

**Claim:** Many tappables below WCAG AAA 44×44pt minimum across web and iOS.

**Status:** REAL — confirmed by 2 agents. Pattern: explicit `minHeight: 44` applied inconsistently.

**Evidence (web, under 44px):**
| Component | File:line | Computed size |
|---|---|---|
| LockModal primary button | `components/LockModal.tsx:106` | ~36px (9px pad + 18px line) |
| LockModal secondary button | `components/LockModal.tsx:100` | ~36px |
| Subcategory "All" pill | `app/page.tsx:590` | ~27px (7px pad + 13px) |
| Subcategory chipStyle | `app/page.tsx:422` | ~22px |
| Source pills in story | `app/story/[slug]/page.tsx:111` | ~19px |

**Evidence (iOS, under 44pt):**
| Component | File:line | Computed size |
|---|---|---|
| TextTabBar buttons | `ContentView.swift:217` | ~41pt (14 pad + 13 text) |
| Category PillButton | `Theme.swift:206` | ~25pt (6 pad + 13 text) |
| Source pills in StoryDetail | `StoryDetailView.swift:579` | ~21pt |
| TTS controls | `StoryDetailView.swift:336` | ~21pt |
| StoryDetail tab buttons | `StoryDetailView.swift:216` | ~37pt |

**Compliant (≥44):** NavWrapper search icon, NavWrapper bottom nav, home category pills, bookmark/share in story page, Kids TabBar. Pattern is "developer added explicit `minHeight: 44` / frame" — safety check works where applied.

**Options:**
1. **Full sweep** — add `minHeight: 44` (web) / explicit frame (iOS) on every pressable; add lint rule to enforce. ~2-4 hrs. Comprehensive a11y win.
2. **Fix top violators** — LockModal, subcategory pills, iOS tab bars, TTS controls. Covers the user-visible interactions. ~45 min.
3. **Skip** — primary CTAs are compliant; secondary UI is polish.

**Recommendation:** Option 2 for launch, Option 1 post-launch. Primary paths (login/signup/save/share) all work; the under-44 items are mostly secondary filter/source pills.

**Decision:** Deferred.

---

### #9 — iOS tab bar + icon/text buttons

**Claim:** iOS tab bar 42–44pt borderline; icons 10pt (too small); "bare text buttons" that look like plain text.

**Status:** PARTIAL — bare text buttons are real; 10pt icon claim overstated; tab bar overlaps #8.

**Evidence (2 agents converged):**

Tab bars:
- **Adult tab bar** (`ContentView.swift:217`): ~42-56pt. Text-only (no icons), 14pt vertical padding + 13pt .footnote text. Borderline but functional.
- **Kids tab bar** (`TabBar.swift:62`): 22pt icons + 10pt label text, ~46-70pt container. Icons are correct; 10pt label may be tight for kids but is a deliberate design choice.

Icons:
- Claim of "10pt icons" overstated — no 10pt icons found. Most icons use `.headline` (~17pt) or larger.
- One borderline: `ContentView.swift:175` — xmark on session-expired uses `.caption2` (~11pt).

**Real find — bare text buttons** (plain text with no `.buttonStyle`, relying only on color):
- `HomeView.swift:138` — "Try again"
- `HomeView.swift:186` — "Load More"
- `HomeView.swift:237` — "Maybe Later"
- `HomeView.swift:475` — "Clear all"
- `StoryDetailView.swift:163` — "Save"/"Saved"
- `ContentView.swift:47` — "Continue without signing in"

Violates iOS HIG affordance — no border, no background, no visual cue these are tappable.

**Options:**
1. **Add visual styling to bare text buttons** — `.buttonStyle(.bordered)` or subtle background/underline. ~20 min. Real HIG fix.
2. **Fold tab bar height concern into #8 touch-target sweep** — don't double-count.
3. **Skip the rest** (kids 10pt label, session-expired xmark) as design intent / edge case.

**Recommendation:** Option 1 for the bare-text-button fix. Item #9's tab-bar concern merges with #8's broader sweep.

**Decision:** Deferred.

---

### #10 — `/messages` free-user paywall

**Claim:** Free users visiting `/messages` get silent `router.replace('/billing')` instead of explanatory paywall modal on the page.

**Status:** NOT REAL — already fixed in prelaunch sprint Round H.

**Evidence (2 agents converged):**
- `web/src/app/messages/page.tsx:149` — explicit code comment: *"H-09: no silent redirect — we set canCompose and let the render path layer a regwall overlay on top of the chat shell so the viewer gets context + an explicit escape"*
- Inline paywall modal at lines 565-601 with `aria-labelledby="dm-paywall-title"`, headline "Direct messages are a paid feature", Upgrade + "Back to home" buttons
- Permission gate via `hasPermission('messages.dm.compose')`; no `router.replace` call anywhere
- Chat shell renders beneath modal for context

**Decision:** Skip. No issue.

---

### #11 — Marketing/legal triple header

**Claim:** Marketing/legal pages render an in-page "Verity Post" wordmark above their h1, causing triple-header stack (NavWrapper + wordmark + h1).

**Status:** NOT REAL — previous PM hallucinated. Duplicates #5's finding.

**Evidence (2 agents converged on 7 pages):**

| Page | Wordmark above h1? | h1 |
|---|---|---|
| `how-it-works/page.tsx:43` | No | "How It Works" |
| `privacy/page.tsx:14` | No | "Privacy Policy" |
| `terms/page.tsx:14` | No | "Terms of Service" |
| `help/page.tsx:124` | No | "Help & Support" |
| `accessibility/page.tsx:15` | No | "Accessibility Statement" |
| `cookies/page.tsx:15` | No | "Cookie Policy" |
| `dmca/page.tsx:15` | No | "DMCA Policy" |

All pages render NavWrapper + h1 only. Total visual headers = 2, not 3.

**Decision:** Skip. No issue.

---

### #12 — `const C` palette consolidation

**Claim:** Public pages each inline `const C = {...}` palette with duplicated hex values. Should consolidate into shared tokens.

**Status:** REAL — confirmed by 2 agents.

**Evidence:**
- ~14–29 public pages define inline `const C` with near-identical hex values (`#f7f7f7` card, `#e5e5e5` border, `#111111`/`#111` text, `#666666`/`#666` dim, `#22c55e`/`#16a34a` success, `#ffffff`/`#fff` bg)
- Sample: `signup/page.tsx`, `login/page.tsx`, `welcome/page.tsx`, `notifications/page.tsx`, `profile/[id]/page.tsx`, `u/[username]/page.tsx`, `expert-queue/page.tsx`, `recap/page.tsx`, `profile/kids/page.tsx`, `reset-password/page.tsx`
- **No shared token file for public pages** — no `web/src/lib/palette.*`, no `tokens.*`
- Admin pages already solved this: `web/src/lib/adminPalette.js` used by 38–64 admin files with spread-override pattern
- Two public files (`profile/page.tsx`, `profile/settings/page.tsx`) import `adminPalette` — working around the gap

**Options:**
1. **Consolidate now** — create `web/src/lib/palette.js` for public pages, replace all inline `const C` with imports. ~1.5–2 hrs standalone.
2. **Bundle into #4 Track B** (full design-system cleanup) — this IS one of the items Track B describes. Do once, not twice.
3. **Skip** — no user-facing harm; pure maintainability concern.

**Recommendation:** Option 2. Palette consolidation is part of the broader design-system sweep in Track B. Handling it here would duplicate work.

**Decision:** Deferred, bundled with Track B of #4.

---

### #13 — Font-size/weight → 7-step scale

**Claim:** Web uses 16+ distinct font sizes, no consistent scale; should collapse to 7 sizes + 3 weights.

**Status:** REAL — confirmed by 2 agents. Solution already exists (`F` scale in adminPalette) but not applied to public pages.

**Evidence:**
- **Distinct fontSize values: 36–45** (depending on whether quoted strings count). Values span 9–96 as raw numbers + `'11px'`-`'40px'` as quoted strings + 7 F-scale tokens
- `web/src/lib/adminPalette.js` defines: `F = { xs:11, sm:12, base:13, md:14, lg:16, xl:20, xxl:28 }` (7-step scale already exists)
- **Admin uses the F scale** — ~783 usages across admin components
- **Public pages don't** — ~800+ usages of raw literals (13 alone: 185 uses; 12: 144; 11: 110; 14: 92) scattered across 150+ files
- **fontWeight**: 10 distinct values (400, 500, 600, 700, 800, 900 + quoted variants) across 832 occurrences

**Options:**
1. **Replace raw literals with F-scale imports in public pages** — ~3-4 hrs standalone. Easiest: IDE regex replace `fontSize: 11` → `fontSize: F.xs` across web/src/app/*.
2. **Bundle into #4 Track B** — design-system cleanup includes this.
3. **Skip** — works as-is.

**Recommendation:** Option 2. Same pattern as #12 — tokens exist in admin, public bypasses. Track B handles the full sweep.

**Decision:** Deferred, bundled with Track B of #4.

---

### #14 — Container maxWidth → 3 canonical values

**Claim:** ~20 distinct maxWidth values scattered across pages; should consolidate to 3 canonical widths.

**Status:** REAL — confirmed by 2 agents.

**Evidence:**
- **23–28 distinct maxWidth values** across 98–100+ inline style declarations
- Values: 220, 280, 320, 340, 360, 380, 400, 420, 440, 480, 520, 560, 600, 620, 640, 680, 720, 760, 800, 820, 880, 900, 920, 960 + `65ch` + `calc(100% - 32px)` + `100%`
- Most-used: 680 (13 uses — home), 420 (9 — auth cards), 720 (8), 560 (8)
- **Admin has a Page primitive** (`web/src/components/admin/Page.jsx`) with `maxWidth` prop (default 1280) — admin-only, not app-wide
- **No shared Container primitive** for public pages

**Options:**
1. **Build Container primitive** with 3 size variants (narrow/medium/wide), refactor all 98 usages. ~3-4 hrs standalone.
2. **Bundle into #4 Track B** — Container primitive is literally part of Track B's design-system work.
3. **Skip** — works as-is.

**Recommendation:** Option 2. This IS one of the Track B items from #4. Don't do the same refactor twice.

**Decision:** Deferred, bundled with Track B of #4.

---

### #15 — Bottom nav reorder

**Claim:** Bottom nav missing Search, Bookmarks, Messages, Browse.

**Status:** REAL as a design question (the items are missing) — but this is a product/design decision, not a defect.

**Evidence (2 agents converged):**
- **Web bottom nav** (`NavWrapper.tsx:187-194`): Home, Notifications, Leaderboard, Profile (or "Sign in" when anon) — 4 items
- **Adult iOS tab bar** (`ContentView.swift:198-203`): Home, Notifications, Leaderboard, Profile — same 4 items
- **Kids iOS**: Home, Ranks (Leaderboard), Experts, Me (Profile)
- Search exists in top bar (icon button, gated by `search.basic` permission), not bottom nav
- Bookmarks, Messages, Browse: not in any nav; accessed via deeper paths (profile dropdown, direct URL)

**Reframe:** The audit called this "High severity" but it's a navigation IA decision, not a bug. 4-item bottom nav is deliberate (simple, thumb-reachable). Adding 4 more items crowds to 8, hurts tap accuracy.

**Options:**
1. **Keep 4-item nav as-is** — current IA is defensible; "Browse" isn't a distinct destination (Home IS the browse).
2. **Add Bookmarks as 5th tab** — highest-value missing destination; most-used personal view.
3. **Redesign to 5 tabs** — Home / Search-Browse / Bookmarks / Notifications / Profile. Messages stays in profile flow.
4. **Full redesign per audit** (all 4 items + existing) — 8 tabs, likely worse UX.

**Recommendation:** Option 1 (skip) or Option 2 (add Bookmarks only). This is a product call, not a required fix.

**Decision:** Deferred — owner makes the IA call.

---

### #16 — Story action row + cap banner

**Claim:** Story action row (save/share + cap banner) crowds/overflows at 320/375px viewports; cap banner wraps awkwardly.

**Status:** REAL — specific layout bug identified.

**Evidence (2 agents converged, `web/src/app/story/[slug]/page.tsx:826-862`):**
- Outer row (line 826): `flexWrap: 'wrap'` ✅
- **Inner right-button group (line 831): NO `flexWrap`** ❌ — nowrap default
- Cap banner (lines 852-856): inline text `"You've used 10 of 10 free bookmarks. Upgrade for unlimited"` (~70+ chars) inside the non-wrapping inner group
- At 320px viewport (16px padding = 288px usable):
  - TTS (~40) + Save (~55) + cap banner (~220-240) + Share (~45) + gaps = overflows
- Only affects users at bookmark cap, viewing story on small mobile

**Options:**
1. **Add `flexWrap: 'wrap'` to inner group (line 831)** — ~5 min, fixes overflow immediately.
2. **Restructure: move cap banner to its own row above action buttons** — ~15 min, cleaner UX, consistent button row.
3. **Skip** — narrow trigger (users at bookmark cap on small mobile), not blocking.

**Recommendation:** Option 2. Cap banner is a status message; deserves its own row separate from action controls. Small PR, real bug fix.

**Decision:** Deferred.

---

### #17 — Breaking treatment unification

**Claim:** 3 visual variants for "breaking" across product; home banner not linkable.

**Status:** REAL — 3 variants confirmed; home banner is not a link.

**Evidence (2 agents converged):**

| Location | Visual | Linkable? |
|---|---|---|
| Home banner `page.tsx:697-722` | Solid red #ef4444, white text, dark semi-transparent pill label | ❌ NO (plain `<div>`) |
| Story card label `page.tsx:829-837` | Solid red #ef4444, white text, uppercase pill | ✅ Yes (parent card is `<a>`) |
| Story page badge `story/[slug]/page.tsx:807-809` | Light red tint `rgba(239,68,68,0.15)`, red text, lowercase "Breaking" | — (inline badge, no link needed) |
| iOS `HomeView.swift:701-709` | Solid red, white, heavy weight | — (card tap-gesture) |

3 distinct visual treatments; the only real defect is the **non-clickable home banner**.

**Options:**
1. **Make home banner a link** — wrap in `<Link href={breaking.slug}>` to story. ~5 min. Primary fix.
2. **Unify all 3 visuals** to one treatment (solid red is canonical). ~30 min. Visual polish.
3. **Both: link + unify** — ~45 min.
4. **Skip** — cosmetic.

**Recommendation:** Option 1 at minimum (5-min bug fix). Option 3 if you want the consistency pass.

**Decision:** Deferred.

---

### #18 — Empty-state rewrite sweep

**Claim:** ~30 empty states are 80% informational dead-ends without explanation or CTA. Needs sweep.

**Status:** PARTIAL — claim overstated. Main flows have CTAs; 3-5 edge cases don't.

**Evidence (2 agents overlapped on 8-9 samples):**

| Empty state | Explanation | CTA |
|---|---|---|
| Bookmarks "No bookmarks yet" | ✅ | ✅ "Browse articles" |
| Notifications (anon) "Keep track of what matters" | ✅ | ✅ "Sign up" |
| Messages "No conversations yet" | ✅ | ✅ "New message" |
| Leaderboard (anon) "Full leaderboard locked" | ✅ | ✅ "Create free account" |
| Profile/kids "No kid profiles yet" | ✅ | ✅ Add-kid form |
| Profile activity "No activity yet" | ✅ | ✅ "Start reading" |
| Profile categories "No categories yet" | ✅ | ✅ "Pick categories" |
| **Search "No matches. Try a different keyword."** | ❌ thin | ❌ none |
| **Leaderboard (filter no-results) "No results."** | ❌ | ❌ |
| **Browse categories (no match) "No categories found."** | ❌ | ❌ |
| **Browse trending (empty category) "No articles yet."** | ❌ | Partial (view all N) |

Ratio: ~7 of 11 are fully good; ~4 are weak edge-case empty states.

**Options:**
1. **Fix 3-4 weak edge cases** — search no-matches (add "Try broader terms" + popular keywords), leaderboard filter (explain which filters are on), browse empty (CTA to clear filter). ~30 min.
2. **Full sweep all empty states** — audit every page, rewrite any missing explanation or CTA. ~2-3 hrs.
3. **Skip** — edge cases only hit on narrow user paths.

**Recommendation:** Option 1. Primary user flows are already polished; targeted fix on 3-4 weak states is high-value.

**Decision:** Deferred.

---

### #19 — Error-message sweep (~94 routes)

**Claim:** ~94 API routes return generic "Failed to X" errors without user voice / next steps; should rewrite for friendlier copy.

**Status:** MISFRAMED. The broader "rewrite for user voice" is wrong — generic errors are intentional per security convention. Real finding: 1 confirmed leak.

**Evidence (2 agents, 149-174 routes counted, 15+ sampled):**

- **CLAUDE.md line 179 convention** (explicit): *"Errors: generic user message + `console.error('[route-tag]', err)` server-side. Never return `error.message` to the client."*
- Security rationale: leaking DB schema / RLS policy / constraint names to clients = info disclosure.
- `safeErrorResponse()` helper maps Postgres codes to stable generic messages (214 uses across routes).
- Most sampled routes comply: `"Could not save bookmark"`, `"Could not post comment"`, `"Could not submit quiz"`, `"Could not file report"`, `"Too many messages. Please slow down."` — all correct pattern.

**Real finding — 1 violation:**
- `web/src/app/api/stripe/checkout/route.js` line 65 — returns raw `err.message` to client. Violates convention; leaks Stripe SDK error internals.

**Options:**
1. **Fix the stripe/checkout leak only** — 5 min targeted fix.
2. **Broader grep sweep** — search all 149-174 routes for any `err.message`, `error.message`, `e.message` returned in response JSON; fix every violation. ~1 hr. Insurance against future PRs introducing similar leaks.
3. **Skip** — only 1 confirmed violation; most routes follow the rule.

**Recommendation:** Option 2. The security convention is real; a one-pass grep sweep closes all current + prevents future violations. Cheap insurance.

**Decision:** Deferred. Note: the audit's "rewrite for user voice" framing should NOT be implemented — it would regress security.

---

### #20 — Radius/avatar/shadow token consolidation

**Claim:** ~21 borderRadius values, ~13 avatar sizes, many boxShadows. Should consolidate to 5 radius / 3 avatar / 3 shadow tokens.

**Status:** REAL — confirmed by 2 agents. No shared token file exists for these.

**Evidence:**
- **borderRadius**: 21-33 distinct values (2, 3, 4, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 38, 48, 70, 99, 999, 50%, plus px-string variants). Most-used: 8 (171 uses), 10 (69), 6 (59), 12 (41). ~565+ total occurrences.
- **Avatar sizes**: 17 inline width/height pairs (6, 8, 12, 14, 26, 28, 32, 40, 42, 44, 48, 56, 64, 72, 80, 88, 96). Avatar component accepts flexible `size` prop, default 32.
- **boxShadow**: 13-19 distinct shadow definitions (varying blur/spread/alpha).
- **Shared tokens**: `adminPalette.js` defines color (`ADMIN_C`), spacing (`S`), type (`F`) — but **no radius / avatar / shadow scales**.

Same bundle as #12, #13, #14 — design-system sprawl fixed via Track B of #4.

**Options:**
1. **Consolidate standalone** — add `R = {sm:6, md:10, lg:16, xl:20, pill:999}`, `SHADOW = {sm, md, lg}`, `AVATAR = {sm:32, md:48, lg:72}` to a shared token file; sweep usages. ~2-3 hrs.
2. **Bundle into Track B of #4** — design-system cleanup covers this.
3. **Skip** — cosmetic consistency only.

**Recommendation:** Option 2.

**Decision:** Deferred, bundled with Track B of #4.

---

---

## Notes

- Deferred items aggregate here until full audit reviewed; then owner sweeps into Current Projects work, ships, or archives.
- Items verified NOT-REAL stay logged for audit trail; no action needed.
- Effort estimates refined as deeper investigation happens (e.g. Track A/B split emerged from deep-dive agents on #4).
- Design-system items (#4, #12, #13, #14, #20) are likely to bundle — they're all the same problem.
