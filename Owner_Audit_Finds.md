# Owner Audit Finds

Owner-spotted issues from real product use. Distinct from `UI_UX_REVIEW/*` (systematic agent sweeps) — these are things the owner noticed and wants triaged.

**Rule:** every find lands here with background context filled in (where it lives, what's associated, what's already known) and a `Confirmed:` line. Another agent doesn't open the find for deeper investigation until `Confirmed: yes` — the cite has been verified against current code.

---

## How to add a find

Paste the raw observation under "Active". I (or the next session) fill in the rest before any agent picks it up.

```
### N. <short title>

- **Cluster:** <one of: dark-mode | auth | article-reader | chrome | pipeline-data | copy | layout | a11y | other>
- **What owner saw:** <one or two sentences, raw>
- **Surface:** <route or screen> — <file path(s)>
- **Associated:** <related components / cross-platform siblings / related routes>
- **Cross-platform parity:** web / iOS adult / iOS kids — note whether each is affected or N/A
- **Known context:** <relevant prior decisions, kill-switches, recent commits, memories>
- **Confirmed:** no | partial | yes — <date + who/what verified the file:line cite>
- **Owner decision needed:** <yes/no — what owner needs to call before fix>
- **Status:** new | confirmed | decision-locked | ready-for-fix | shipped | stale
- **Ready for fix:** no | yes — <only "yes" when Status >= ready-for-fix AND Owner decision needed = no (or decision locked inline)>
- **Notes for next agent:** <scope guardrails, what NOT to expand into>
```

**Status flow:** `new` → (cite verified) → `confirmed` → (owner Q&A pass) → `decision-locked` → `ready-for-fix` → (fix session ships) → `shipped`. `stale` = the cite no longer applies / already fixed in code.

**Ready-for-fix gate:** a fix session pulls only finds where `Ready for fix: yes`. Stops fix agents from re-litigating decisions or chasing drifted cites.

Keep it ≤8 lines per find. If investigation grows, spin a finding doc under `UI_UX_REVIEW/owner-N-<slug>.md` and link it from here.

---

## Reference — common surfaces

Use these to fill in `Surface:` quickly. Expand as new ones come up.

**Web public:** `/` → `web/src/app/page.tsx` · `/[slug]` (article reader) · `/browse` · `/search` · `/category/[id]` · `/leaderboard` · `/login` · `/welcome` · `/pricing` · `/how-it-works` · `/about`
**Web authed:** `/profile` (+ `/settings`, `/settings/billing`, `/settings/expert`, `/family`) · `/profile/kids[/[id]]` · `/bookmarks` · `/notifications` · `/messages` · `/following` · `/recap[/[id]]` · `/billing` · `/appeal` · `/expert-queue`
**Web admin:** `/admin` (hub) · `/admin/newsroom` (+ `/clusters/[id]`) · plus per-section subroutes — see `web/src/app/admin/`
**iOS adult:** `VerityPost/VerityPost/` — `ContentView.swift` (tab shell), `HomeView.swift`, `BrowseLanding.swift`, `FollowingView.swift`, `ProfileView.swift`, `StoryDetailView.swift`, `FindView.swift`, `AlertsView.swift`, `MessagesView.swift`, `LeaderboardView.swift`, `BookmarksView.swift`, `SettingsView.swift`, `SubscriptionView.swift`
**iOS kids:** `VerityPostKids/VerityPostKids/` — `PairCodeView.swift`, `ParentalGateModal.swift`, `ArticleListView.swift`, `KidReaderView.swift`, `KidQuizEngineView.swift`, scenes (`QuizPassScene`, `StreakScene`, `BadgeUnlockScene`, `GreetingScene`), `LeaderboardView.swift`, `ExpertSessionsView.swift`, `ProfileView.swift`
**Chrome (every web surface):** `web/src/app/NavWrapper.tsx` (top bar + bottom nav + global footer) · `web/src/middleware.js` (gates, redirects)
**Kill-switched (don't flag missing functionality):** see `CLAUDE.md` § Kill-Switch Inventory

---

## Clusters

A cluster groups finds that share a fix-session scope. Each fix session picks one cluster and works only finds within it.

- **dark-mode** — globals.css token gaps, hard-coded light colors, chrome theming
- **auth** — session/cookie persistence, login/signup/verify, OAuth, middleware redirects
- **article-reader** — `/[slug]` page, ArticleReaderTabs, ArticleSurface, Sources/Timeline/Engagement, NextStoryFooter
- **chrome** — NavWrapper top bar / bottom nav / footer, account-state banner
- **pipeline-data** — anything where the bug is in what the pipeline writes (sentinel values, missing fields, wrong defaults), not how the UI renders it
- **copy** — strings only (DECISION #021 framing, error messages, empty states)
- **layout** — desktop/mobile breakpoints, grid/flex, hit targets, spacing
- **a11y** — landmarks, headings, focus, contrast, motion
- **other** — anything that doesn't cleanly fit; recategorize when 3+ finds collect under "other"

---

## Active

### 1. Desktop article: timeline below + left of body (should be right rail)

- **Cluster:** article-reader / layout
- **What owner saw:** On desktop article view, timeline is stacked below the article body and aligned left. Should be a right-side rail next to the body.
- **Surface:** `/[slug]` (article reader) — `web/src/components/article/ArticleReaderTabs.tsx:35-123` (consumer); fed from `web/src/app/[slug]/page.tsx:301-306` via `timelineSlot`.
- **Associated:** `TimelineSection`, `SourcesSection` (currently both share `timelineSlot` — see Find #3); body column max-width 680px in shell.
- **Cross-platform parity:** web only. iOS adult uses tabbed StoryDetailView (Story / Timeline / Discussion), no rail concept — N/A. iOS kids — N/A (no timeline surface).
- **Known context:** `ArticleReaderTabs` has NO desktop layout — its inline `<style>` block (lines 88-121) only fires at `max-width: 859px` (mobile tab strip + panel toggle). Above 860px every panel renders in DOM order, so timeline lands directly under the article body in the same centered column. There is no two-column / rail / sticky-aside CSS for desktop anywhere in this component.
- **Confirmed:** **STALE — already fixed in code (2026-05-03 agent pass).** `ArticleReaderTabs.tsx:96-119` implements a 75/25 desktop split with `flex: 75` left + `flex: 25` sticky right rail at `top: 80px`, `padding: 0 40px`, `max-width: 1280px`. Mobile breakpoint is `@media (max-width: 1023px)` — not `859px` as my original cite said. So the code is correct; owner saw a deploy that didn't reflect this, OR the symptom is downstream (timeline data not loading, container CSS overriding flex, ad slot collapsing the rail).
- **Owner decision needed:** yes — verify against production deploy. If still stacked on prod, capture viewport width + screenshot. Possible: production is on a stale build, or the rail collapses because `timelineSlot` was empty (timeline = []), or the slug page wraps the tabs in something that overrides flex.
- **Status:** stale (likely already fixed) — needs production-deploy verification before re-opening
- **Ready for fix:** no — stale until owner reproduces against current prod
- **Notes for next agent:** **don't ship a desktop-layout fix until owner re-checks on prod.** If still broken: check whether `timelineSlot` is actually populated (`page.tsx:350-356` has timeline + sources + rail-ad), and whether ad component renders null in prod. Also: `ArticleSurface.tsx:42-46` has body `maxWidth: 680` — inside a 1200px outer column at 75/25 split, the body looks under-sized; not a bug but might be what owner perceives as "left of body."

### 2. Article page: sources showing "Unknown" for everything

- **Cluster:** pipeline-data
- **What owner saw:** Every source row on an article reads "Unknown" instead of a real publisher / outlet name.
- **Surface:** `/[slug]` — render: `web/src/components/article/SourcesSection.tsx:50-83`; data: `web/src/app/[slug]/page.tsx:159-163` (selects `title, url, publisher, sort_order` from `sources` table).
- **Associated:** pipeline writers `web/src/app/api/admin/pipeline/generate/route.ts:1173-1174` and `web/src/app/api/newsroom/ingest/run/route.ts:238` both default outlet/publisher to literal string `'Unknown'`. Render falls through `s.title || s.publisher || s.url` — if title is null and publisher is the string "Unknown", the link text is "Unknown".
- **Cross-platform parity:** web confirmed. iOS adult `StoryDetailView.swift` `sourcePillsSection` reads same `sources` table via `client.from("sources")` (line 2424) — almost certainly affected too; not yet visually verified. iOS kids — N/A (no sources surface).
- **Known context:** the render component is innocent — bug is upstream. Two write paths default to "Unknown" sentinel instead of leaving null.
- **Confirmed:** **yes (2026-05-03 agent pass) — and bigger than the find first said.** DB query returned 4 rows, all with `title='Unknown'` AND `publisher='Unknown'` (NYT / France 24 / France 24 / PBS). The render fallthrough `s.title || s.publisher || s.url` can't help because `title='Unknown'` is truthy. Third writer found: `generate/route.ts:1799-1807` persist payload sets BOTH `title: s.outlet` AND `publisher: s.outlet`, propagating the same sentinel to both columns. Reader-page fetch cite drifted to `page.tsx:174-178` (was 159-163).
- **Owner decision needed:** no — fix all three writers (`ingest/run/route.ts:238`, `generate/route.ts:1171-1174` AND `:1802,1804`); leave both `title` and `publisher` null when outlet is unknown; extend `SourcesSection` fallthrough to derive a hostname from `s.url` when title+publisher are null. iOS `Models.swift:480` already has `outletName ?? "Source"` fallthrough at `StoryDetailView.swift:885` — nulling publisher will render "Source" rather than blank, but a hostname fallback there too would be better.
- **Status:** shipped 2026-05-03
- **Ready for fix:** n/a — shipped 2026-05-03 (commit pending, see Roll-up)
- **Notes for next agent:** keep the `'Unknown'` literal in the LLM prompt path (`generate/route.ts:436` `wrapSource(outlet, ...)`) — the prompt needs *something* there. Split prompt-side default from persist-side null. Backfill safe: 4 rows, all generic news URLs, no legitimately named "Unknown" outlet. Also flag (out of scope, separate sweep): `admin/newsroom/_components/SourcesBlock.tsx:38` does `outlet_name || 'Unknown'` against `cluster_sources` (different table) — same anti-pattern.
- **Shipped notes:** writers null-safe (ingest/run/route.ts:238, generate/route.ts:1168-1177, generate/route.ts:1799-1807); plagiarism-check call sites coalesce outlet→'Unknown' to preserve grouping; render fallback uses hostname-from-URL (SourcesSection.tsx hostFromUrl helper, Models.swift hostFromURLString helper); also fixed long-standing "NYT — NYT" duplicate by adding `s.publisher !== s.title` guard. **Backfill migration `supabase/migrations/20260503000007_backfill_unknown_sources_to_null.sql` requires owner to apply** (MCP server read-only) — until then the 4 existing rows still render "Unknown" / "Unknown — Unknown".

### 3. Article page: sources rendered under Timeline tab (should sit with article body)

- **Cluster:** article-reader
- **What owner saw:** On mobile the sources block appears inside the Timeline tab, under timeline events. Sources belong with the article, not under the timeline.
- **Surface:** `web/src/app/[slug]/page.tsx:301-306` — both `<TimelineSection />` AND `<SourcesSection />` are passed inside the same `timelineSlot={...}` fragment.
- **Associated:** `ArticleReaderTabs.tsx` (consumer renders that slot as the Timeline tab on mobile, and stacks it after article on desktop — connects to Find #1).
- **Cross-platform parity:** web — confirmed. iOS adult — NOT affected: `StoryDetailView.swift:710` renders `sourcePillsSection` inside the Story tab with the article body, separate from the Timeline tab. iOS kids — N/A. So owner's "assuming same for iOS" turns out wrong; iOS already does the right thing here.
- **Known context:** fix is structural and tiny — move `<SourcesSection />` from `timelineSlot` into `articleSlot` (which already wraps `ReaderShell` body + `ArticleActions`).
- **Confirmed:** **yes (2026-05-03 agent pass).** Cite drifted to `page.tsx:350-356` (not 301-306). Slot also includes `<Ad placement="article_rail" />` as third member (find didn't mention). iOS parity confirmed at `StoryDetailView.swift:735` — sources are inside Story tab, correct.
- **Owner decision needed:** small — place `<SourcesSection>` BEFORE or AFTER `<ArticleActions>` in `articleSlot`? Agent's read: before (sources are part of body, actions are post-read). Default to that unless owner says otherwise. Also: when timeline is empty after this fix, the Timeline tab becomes ad-only on mobile — consider hiding the tab when `timeline.length === 0` (separate small decision).
- **Status:** confirmed (small owner decision pending: before-or-after ArticleActions)
- **Ready for fix:** no — owner micro-decision needed (recommend default = "before ArticleActions")
- **Notes for next agent:** one-file edit in `[slug]/page.tsx:350-356`. SourcesSection styling (`marginTop: 40, paddingTop: 24, borderTop`) is already designed to render under the article body — no CSS adjustment needed. Leave the rail ad in `timelineSlot`. `ArticleReaderTabs.tsx:119` rule that zeros first-child `margin-top` of timeline panel still works after the move (TimelineSection remains first child).

### 4. "Back to edition" button — bad button, bad view, bad position

- **Cluster:** article-reader / layout
- **What owner saw:** The "Back to edition" button itself is wrong; the surface it lives in is wrong; the position is wrong.
- **Surface:** `web/src/components/NextStoryFooter.tsx:52-72` (button); the entire `NextStoryFooter` component is rendered at `web/src/app/[slug]/page.tsx:321` as the last block of the article reader.
- **Associated:** top-bar wordmark already routes to `/`; `NavWrapper.tsx` chrome.
- **Cross-platform parity:** web only. iOS adult/kids use system back chevron on `StoryDetailView`/`KidReaderView` — N/A.
- **Known context:** *(a)* copy: "edition" framing was retired by **DECISION #021** (curated front page, any-age — see `UI_UX_REVIEW/A-1-home.md` finding #0). Calling the home "the edition" is dead framing. *(b)* size: chip is `fontSize:13`, `padding:8px 14px` — undersized hit target (<44px) per UI_UX_REVIEW_PRINCIPLES §2.1. *(c)* position: rendered after a "More in [category]" list, so by the time reader reaches it they've already passed every continuation CTA, and the home/back affordance is buried at the very bottom of the reader.
- **Confirmed:** **partial (2026-05-03 agent pass).** Component exists; cite for usage drifted to `page.tsx:406` (not 321). **Copy is already "Back to home" at `NextStoryFooter.tsx:71`, NOT "Back to edition"** — owner saw stale state. Codebase appears DECISION #021-clean for the term. Size + position complaints stand.
- **Owner decision needed:** yes — three separate calls: (a) keep or remove the button (top-bar wordmark is the only other guaranteed home affordance; if NavWrapper hides chrome on scroll, button is the only persistent one), (b) if keeping, redesign at ≥44px hit-target (current `padding:'8px 14px'` undersized — bump to `'12px 16px'` + `minHeight:44`), (c) keep or rework "More in [category]" list above it (currently 3 nearby stories from same category at `page.tsx:201`).
- **Status:** confirmed (size + position) / moot (copy)
- **Ready for fix:** no — owner-decision blocked (keep / delete / relocate)
- **Notes for next agent:** single-consumer (only `page.tsx:406` uses it), no tests assert on it — safe to delete or move. Don't ship a copy-only fix; the copy is already correct. Position fix means relocating to top of article (breadcrumb-style) or into NavWrapper top bar on article routes — material UX change requiring an owner decision before code.

### 5. Dark mode doesn't cover top bar + bottom nav (and colors should invert)

- **Cluster:** dark-mode / chrome
- **What owner saw:** In dark mode the top bar and bottom nav stay white. Owner expects them to flip with the theme — and to invert (so the chrome reads as light-on-dark, mirroring the body inversion).
- **Surface:** `web/src/app/NavWrapper.tsx:391` (top bar `background: 'rgba(255,255,255,0.97)'`), `web/src/app/NavWrapper.tsx:421` (bottom nav same hard-coded white).
- **Associated:** every web surface — NavWrapper is the global chrome wrapping every route. Likely also `borderColor`, link/text colors, and divider lines inside the same component need theme tokens, not just background.
- **Cross-platform parity:** web only. iOS adult/kids — N/A (system-level dark mode handled by SwiftUI; not the same chrome).
- **Known context:** already logged as `UI_UX_REVIEW/A-1-home.md` finding #2 and moved to `UI_UX_REVIEW_OUT_OF_WAVE.md` as a sweep candidate. So this is a known unfixed item; owner is now flagging it as priority and adding the "invert colors" requirement on top.
- **Confirmed:** **yes (2026-05-03 agent pass).** Both lines verified. Surrounding hard-coded values inside NavWrapper that will clash once chrome flips dark: `:357` text uses `var(--text)` (light-pinned `#111` — Find #8 territory, flips when #8 lands); `:393,423` `borderTop/borderBottom` uses `var(--border)` not redefined dark; `:616` nav-link active state uses `var(--accent)` not redefined dark — active label disappears on dark chrome; `:648` admin banner uses literal `#111` (coincidentally fine). `AccountStateBanner.tsx:14-17` uses bespoke red/amber palette — flagged-but-acceptable. NavWrapper is suppressed on `/login`, `/signup`, `/welcome`, `/verify-email`, `/api/auth/callback`, `/logout`, `/beta-locked`, `/request-access`, all `/admin/*`, `/ideas/*`, `/story/*` (nav+footer), `/mockup/*` — chrome flip won't touch admin shells or auth pages.
- **Owner decision needed:** yes — token strategy: (a) introduce `--chrome-bg` / `--chrome-text` / `--chrome-border` tokens defined separately in light + dark blocks, OR (b) reuse `--p-surface` / `--p-ink` / `--p-border` from the new token system (already defined in dark blocks) and let chrome inherit. (b) is cheaper and aligns with the newer token direction. Same call applies to NavWrapper text/border colors flagged above.
- **Status:** confirmed (token-strategy decision pending)
- **Ready for fix:** no — owner-decision blocked (token strategy: chrome-specific tokens vs reuse `--p-*`); also gated on Find #8 bundling
- **Notes for next agent:** Find #8 must ship first OR be bundled with this — flipping chrome bg without flipping `--text` / `--border` / `--accent` would create dark text on dark chrome. Recommend bundling Finds #5 + #8 into one dark-mode session.

### 6. Web silently logs the user out overnight

- **Cluster:** auth
- **What owner saw:** Was logged in last night, opened the browser today and was logged out. Recurring — "logs me out quite often."
- **Surface:** session-cookie write path: `web/src/lib/supabase/server.ts:15-53` (`createClient`) and `:59-87` (`createOtpClient`). Middleware redirect to `/login`: `web/src/middleware.js:419-440`. The logged-out condition is "supabase getUser() returned no user on a protected route."
- **Associated:** middleware sets `?toast=session_expired` (`middleware.js:434`) when an `sb-<ref>-auth-token` cookie exists but the session is invalid → that's the visible "session expired" path; if user lands on /login without that toast, the cookie was dropped entirely.
- **Cross-platform parity:** web confirmed. iOS adult — needs check (separate session model, Supabase iOS SDK persists in Keychain). iOS kids — N/A (paired-device model, not user session).
- **Known context:** `COOKIE_DEFAULTS` (`server.ts:15-20`) sets `sameSite: 'lax'`, `secure: prod`, `httpOnly: true`, `path: '/'` — but **no explicit `maxAge`**. The Supabase SSR lib decides cookie lifetime from the JWT itself (access ≈1h, refresh much longer). If the refresh token cookie isn't being set with a long enough max-age, the browser drops it on session-end and "next morning" = fresh anon visit. Recent commit `ab8d9f7` shipped PKCE cross-device fix and 8-digit OTP — regression window is post that commit. Memory: `project_session_state_2026-04-29_auth_redesign.md`.
- **Confirmed:** **partial — but original hypothesis WRONG (2026-05-03 agent pass).** `@supabase/ssr@0.10.2` already passes `maxAge: 400 * 24 * 60 * 60` (400 days, RFC6265bis upper bound) — verified at `node_modules/@supabase/ssr/dist/main/utils/constants.js:10`. `mergeCookieOptions` ordering (`{...COOKIE_DEFAULTS, ...options}`) preserves the SSR-supplied maxAge. So cookies aren't being session-scoped. **Better candidate cause:** `middleware.js:341-348` `needsUser` short-circuits to `false` on public routes, so the token-refresh path only runs on protected-route hits. If user lands on `/` (public) overnight, no refresh fires; next protected-route nav hits an expired access token; client-side `supabase.auth.getUser()` in `NavWrapper.tsx:264` tries to refresh, and if that fails the user is logged out. iOS not affected — Swift SDK Keychain persistSession + autoRefresh defaults.
- **Owner decision needed:** no — runtime diagnosis first.
- **Status:** symptom confirmed / cause narrowed but unresolved (needs runtime cookie capture)
- **Ready for fix:** no — runtime diagnosis blocks fix; cause must be pinned before any auth code change
- **Notes for next agent:** owner needs to do this in browser, agents can't repro: (1) open DevTools → Application → Cookies on `verityposts.com` immediately after a fresh sign-in; capture name + Max-Age + Expires + SameSite + Secure for every `sb-*` cookie (especially `sb-<ref>-auth-token`, `.0`, `.1`, `-code-verifier`); (2) close browser, return >2h later, capture again — note which dropped; (3) if all cookies survive → access expired and refresh failed; instrument the middleware token-refresh path; (4) if cookies missing → look for accidental `auth.signOut()` call or third-party cookie purge. Do NOT speculatively expand `needsUser` to all routes — that's a perf hit on every public visit; fix should be middleware doing a non-blocking `getSession()` to drive refresh.

### 7. /login renders only a spinner — never resolves

- **Cluster:** auth
- **What owner saw:** Tried to go to the login screen and saw a "spinny bar" — i.e. the page never advances past the loading state.
- **Surface:** `web/src/app/login/page.tsx:26-58` — entire page is wrapped in `<Suspense fallback={<LoginFallback />}>` and `LoginFallback` (lines 26-50) is the `vpSpin` rotating ring. If the `LoginPageInner` subtree never resolves, the user stares at the spinner forever.
- **Associated:** `LoginPageInner` (lines 60-126) uses `useSearchParams()` (line 61) — Suspends until search params hydrate; `usePageViewTrack('login')` (line 62) — analytics hook that may fetch. Forms underneath: `_SingleDoorForm.tsx`, `_WaitlistForm.tsx`, `_RequestAccessForm.tsx`.
- **Cross-platform parity:** web only. iOS — N/A (native login views).
- **Known context:** `useSearchParams` in app-router is the well-known Suspense culprit; it normally hydrates instantly. If it doesn't, a build/runtime issue in a child (`SingleDoorForm` etc.) could be throwing inside Suspense and trapping the boundary. Could also be a deploy-side issue (stale chunk, hydration error, CSP blocking the JS bundle, service-worker serving stale HTML). Recent auth redesign (commit `ab8d9f7`) reshaped this page.
- **Confirmed:** **partial (2026-05-03 agent pass).** Code path verified; nothing inside `LoginPageInner` or the three forms statically suggests an infinite suspend (`'use client'` correct, no top-level awaits, `useSearchParams` already inside Suspense, `usePageViewTrack` is fire-and-forget). Most likely runtime causes: stale JS chunk after deploy, hydration mismatch, or CSP nonce mismatch (`middleware.js:106` adds `'strict-dynamic'` + per-response nonce — if a service-worker / browser cache serves stale HTML against fresh CSP, inline scripts silently fail and React never hydrates). Could not confirm without runtime.
- **Owner decision needed:** no — runtime capture first.
- **Status:** symptom confirmed / cause unresolved (needs runtime capture)
- **Ready for fix:** no — runtime diagnosis blocks fix
- **Notes for next agent:** owner should: (1) open `/login` in incognito with DevTools → Console + Network; capture any red console errors, any failed `_next/static/chunks/*.js` fetches (404/blocked), any CSP violations (`Refused to execute inline script…`), any "Hydration failed" React errors; (2) view-source on `/login`, verify `<script nonce="...">` matches the response `Content-Security-Policy` `script-src 'nonce-...'`; (3) hard-reload + check Vercel deployment hash; (4) cheap local repro: `cd web && npm run build` to surface compile-time issues. Don't redesign the page or remove the Suspense boundary as a "fix."

### 8. Dark mode: article body text stays dark (illegible on dark surface)

- **Cluster:** dark-mode
- **What owner saw:** In dark mode, article text still renders dark, so it disappears against the dark page.
- **Surface:** article render components: `web/src/components/article/ArticleSurface.tsx:53,66`, `MidBodyQuizTeaser.tsx:29`, `SourcesSection.tsx:42,72,77`, `TimelineSection.tsx:81,106,111`, `UpNextSheet.tsx:182`, `AnonArticleCtaBanner.tsx:23`, `ArticleReaderTabs.tsx:147-148` — all read `var(--text-primary, #111)` or `var(--text, #111)`.
- **Associated:** root token defs in `web/src/app/globals.css:34-35` (light: `--text-primary: #111111`, `--text: #111111`) and dark-mode blocks `:root:not([data-theme])` at line 129 + `:root[data-theme="dark"]` at line 179.
- **Cross-platform parity:** web only. iOS adult/kids — N/A (SwiftUI Color tokens, separate system).
- **Known context:** the dark-mode blocks redefine only `--p-*` tokens (`--p-ink`, `--p-bg`, etc.) — they NEVER redefine `--text-primary` or `--text`. So in dark mode those two vars still resolve to `#111111`, which is what the article components read. The `--p-ink` token (`#fafafa`) is correct but unused by the article surface. Two viable fixes: (a) redefine `--text-primary` + `--text` inside both dark blocks to map to the dark-ink color, (b) sweep the article components to read `--p-ink` instead. (a) is one-CSS-file change and benefits any other component on the same vars; (b) aligns with the newer token system.
- **Confirmed:** **yes (2026-05-03 agent pass) — and path (a) is bigger than first written.** Dark blocks redefine ONLY `--p-*` tokens. The legacy palette `--text-primary`, `--text`, `--bg`, `--card`, `--border`, `--accent`, `--dim`, `--muted`, `--soft`, `--foreground` are NEVER redefined dark. Path (a) "redefine `--text-primary` + `--text`" alone would create new bugs (white text on white `--card` since `--card` is also light-pinned). Path (a) properly done = redefine the FULL legacy palette in both dark blocks. Blast radius of path (a): ~50+ consumer files mapped (article components, comment components, bookmark/share/empty/error/lock/permission components, recap/leaderboard/profile/browse/notifications pages, and the three login forms). Path (a) does NOT reach `web/src/app/admin/*` (admin owns its own inline-style palette).
- **Owner decision needed:** yes — (a) full legacy-palette redefinition in dark blocks (one CSS file, but every consumer flips at once — bigger surface to QA, but the right long-term fix and the only path that also fixes Find #5's chrome borders/text), OR (b) scoped sweep of article components to `--p-ink` only (smaller blast radius, but leaves the rest of the app dark-broken).
- **Status:** confirmed (path-a vs path-b decision pending)
- **Ready for fix:** no — owner-decision blocked (path a vs path b)
- **Notes for next agent:** if path (a): bundle with Find #5 (chrome) and ship as one dark-mode session. Watch `/login`, `/welcome`, `/logout`, `/signup` — they use `var(--bg)`/`var(--card)`/`var(--text)` but suppress NavWrapper chrome; they need the full palette flip. Watch hard-coded white-card pages (`[slug]/not-found.tsx:35` uses `background:'#fff'`+`var(--text-primary)`) — those will go dark-text-on-white-bg, which is intentional for them. Spot-check `ArticleSurface.tsx` for hard-coded white surfaces. `StoryArticlePicker.tsx:56` reads `var(--foreground)` — also not redefined dark; include in path (a) sweep.

---

## Fix-session protocol

A fresh session that opens this doc to ship fixes follows this protocol. The session's only input prompt should be: **"Read `Owner_Audit_Finds.md` and run a fix session."**

**Pre-flight (before touching code):**

1. Read `CLAUDE.md` (Kill-Switch Inventory + memory pointers). Memories that govern fix work: `feedback_4pre_2post_ship_pattern.md` (6-agent ship pattern), `feedback_4_stream_parallel_cleanup.md` (parallelism), `feedback_cross_platform_consistency.md` (web + iOS + kids iOS), `feedback_genuine_fixes_not_patches.md` (no half-fixes), `feedback_always_push_after_commits.md` (push at end), `feedback_verify_audit_findings_before_acting.md` (verify cites before acting).
2. Pull the list of finds where `Ready for fix: yes` from the *Roll-up by cluster → Ready for fix* section. Pick one cluster per session (don't mix dark-mode + auth + article-reader fixes in one session — context blows up).
3. Run a `finding-verifier` agent against every cite in the picked cluster's ready finds. Refuted or partial cites do NOT get fixed — instead, update the find's `Confirmed:` line and bump Status back to `confirmed` or `stale`, then skip.

**Implement (per find, or batched within cluster):**

4. For each ready find, dispatch the 6-agent ship pattern (4 pre-impl + 2 post-impl) when the find is non-trivial; for surgical one-line fixes, a single `fix-implementer` is fine.
5. Cross-platform sweep is mandatory — every find's `Cross-platform parity:` line says which platforms apply. Address each, or state "not applicable" explicitly. If iOS parity is in scope, the find body already names the relevant Swift file; verify it before editing.
6. Honor every `Notes for next agent:` block — those are scope guardrails. Don't expand into adjacent finds even if you spot the cause.
7. Don't touch finds where `Ready for fix: no`. If you uncover an owner-decision that's blocking a find while inside the session, stop and ask owner — don't unilaterally lock the decision.

**Ship:**

8. `build-verifier` pass (type-check + lint + sentinel grep).
9. `smoke-tester` pass against a route the fix touches (e.g. an article that previously showed the bug).
10. Commit with a message naming the find numbers (e.g. `fix(article): sources no longer render "Unknown" (Owner Audit Finds #2)`).
11. **Push.** A committed-but-unpushed session ends in failure (Vercel never deploys).

**Bookkeeping (this doc updates as work happens — not at the end):**

Per memory `feedback_update_everything_as_you_go.md`: every state change to a find lands in this doc the same turn it happens, not batched at session close. Cross-session continuity breaks if state is stale.

- When a finding-verifier refutes a cite → update `Confirmed:` and Status that turn.
- When fix-implementer starts on a find → bump Status to `in-flight` that turn.
- When the commit is pushed → flip Status to `shipped`, set `Ready for fix:` to `n/a — shipped YYYY-MM-DD <commit-sha>`, move the bullet under *Roll-up by cluster → Shipped*. Leave the find body intact in Active for history; only the roll-up index moves.
- When the session surfaces a new finding (regression, adjacent issue) → add it to Active with `Status: new` that turn; let the next triage session confirm it. Do NOT fix new finds in the same session.
- When an owner decision is locked mid-session → write it into the find's body and bump Status that turn.

If the session ends with the doc out of sync with code (e.g. shipped find still listed as ready), the next session will work the wrong list. Treat doc updates as part of "done," not paperwork after.

**Hard nos for fix sessions:**

- No fixing finds with `Ready for fix: no`.
- No bundling fixes across clusters in one session.
- No copy-only fixes that ignore the structural complaint (e.g. Find #4 — copy is already correct; size/position are the actual bugs).
- No reintroducing kill-switched surfaces (CLAUDE.md inventory).
- No Sentry, no keyboard shortcuts, no `// removed` comments for deleted code (memory).
- No `--no-verify` / `--no-gpg-sign` on the commit.

---

## Roll-up by cluster

A fix session picks a cluster and works only `Ready for fix: yes` finds inside it. As finds land, move them between sections — don't duplicate content, just adjust the find's `Status:` and `Ready for fix:` lines and update this index.

### Ready for fix (decision-locked, fix session can pull these)

*(empty — clear after #2 shipped 2026-05-03)*

### Decision needed (owner Q&A pass before fix)

- **dark-mode:** #5 (chrome flip — token strategy), #8 (article text — path a vs b)
- **article-reader:** #3 (sources placement micro-decision: before/after ArticleActions), #4 (back-to-home button — keep / delete / relocate)

### Diagnosis blocked (runtime capture needed)

- **auth:** #6 (overnight logout — needs cookie capture), #7 (login spinner — needs console + network capture)

### Stale / likely already fixed

- **article-reader / layout:** #1 (desktop timeline rail — needs prod re-check)

### Shipped

- **pipeline-data:** #2 (sources "Unknown") — shipped 2026-05-03 (writers + render + iOS + backfill migration; commit pending)
