# Unit 6 — Leaderboard (`/leaderboard`)

**Surface(s):** `web/src/app/leaderboard/page.tsx` (902 lines), `web/src/app/leaderboard/layout.js`, `web/src/components/VerifiedBadge.tsx`, `web/src/components/Avatar.tsx`, `web/src/lib/leaderboardPeriod.ts`, `VerityPost/VerityPost/LeaderboardView.swift`
**Status:** fixed (Slice 14 shipped 2026-05-02)
**Date:** 2026-05-02
**Anchor:** Slice 14 shipped. 46 findings fixed (0 refuted). Adversary found 4 gaps — Rising Stars/category data leak (URL bypass), useSearchParams Suspense, sign-out race — all closed. tsc clean, smoke PASS. Unit 6 complete.

---

## Decisions locked

**DECISION #057 — No credential badges on leaderboard rows (owner-locked, Option C)**
Remove `<VerifiedBadge>` from `LeaderRow` entirely. Score-based surface only; no role/credential markers. See DECISIONS.md #057.

## Auto-locked decisions

**DECISION #058 — URL state for leaderboard filters (auto-locked)**
Extend DECISION #054 (Browse) / #055 (Category) pattern to leaderboard: `tab`, `period`, and `cat` persisted to URL via `router.replace` + `useSearchParams()`. Same rationale — Back-button restore and shareable filtered views justify the cost. Param keys: `tab` (`top` / `rising`), `period` (`week` / `month` / `all`), `cat` (category UUID, absent = All). On mount: initialize from URL; absent params → defaults. Applies in Slice 14.

---

## Findings

### Critical — Security / Data gate

**F01** [crit] `pageLimit = me ? 50 : 3` (line 320) — the row-cap is auth-only, not permission-aware. Any signed-in user (including unverified, no `leaderboard.view`) receives a 50-row query response. The blur overlay is CSS-only — all 50 rows are in the network response and React state, readable via DevTools. Fix: `pageLimit = fullAccess ? 50 : 3`. — `page.tsx:320`

**F02** [crit] Anon blur-wall structurally unreachable for unauthenticated visitors — `me=null` → `pageLimit=3` → `visibleUsers.length` never exceeds 3 → `visibleUsers.length > 3` condition (line 621) never fires → anon sees 3 bare rows with **no sign-up CTA**. The blur gate is wired to 4+ rows but only 3 are fetched. Fix: show the CTA unconditionally for anon (not conditional on row count), or always fetch 4+ rows for anon with the CTA after row 3. — `page.tsx:320, 621`

**F03** [crit] Sticky rank bar (line 861) and "Your rank" card (line 398) render whenever `me && myRank !== null` with no `fullAccess` guard. Because F01 fetches 50 rows for any authed user, an unverified user ranked #4–#50 sees their rank in both elements — leaking gated rank information. Fix: gate both on `fullAccess`. — `page.tsx:861, 398`

**F04** [crit] Category filter pills render on the Rising Stars tab — no `activeTab === 'Top Verifiers'` guard at line 502. Selecting a category on Rising Stars routes the load useEffect into the `category_scores` branch (line 197) which has no 30-day account-creation window filter — Rising Stars semantics silently bypassed. Fix: hide category pills when `activeTab !== 'Top Verifiers'`; reset `activeCat` on tab switch. — `page.tsx:502`

**F05** [crit] Blur overlay CTAs (anon gate line 679–682, unverified gate lines 799–803) hardcode `linear-gradient(to bottom, rgba(255,255,255,0.3), rgba(255,255,255,0.95) 70%)`. In dark mode this renders an opaque white wash over dark content (PRINCIPLE §1.1). Fix: replace with token-based gradient using `var(--bg)` at both stops with appropriate opacity. — `page.tsx:679, 799`

**F06** [crit] `rankAccentColor` (lines 17–22) uses hardcoded hex `#B8860B` / `#6B7280` / `#92400E` annotated "passes WCAG AA on white." The sticky bar background is `var(--card)` which is dark in dark mode — contrast not verified against dark surface. Fix: verify WCAG AA on dark background; either adjust values or wrap in CSS variables with dark-mode overrides. — `page.tsx:17`

**F07** [crit] Category-scores path missing `deletion_scheduled_for IS NULL` guard — default + Rising Stars paths use `public_profiles_v` (which pre-filters scheduled-deletion users); category path joins raw `users` table and omits this check. Fix: add `.is('users.deletion_scheduled_for', null)` to the category-path query. — `page.tsx:198–209`

**F08** [crit] Active tab, period, and category (`activeCat`) not persisted to URL params — in-memory only; navigating away and back resets all filters (DECISION #058). Covers main-session findings #6 and #7. Fix: `router.replace` on every state change; `useSearchParams()` initialization on mount. — `page.tsx:110, 111, 114`

**F09** [crit] Tab buttons (lines 448–470) missing `role="tab"` and `aria-selected` (or `aria-current`). Period pills (lines 478–498) missing `aria-pressed` or `aria-current`. Screen-reader users cannot determine which tab or period is active (WCAG 4.1.2). Fix: `role="tablist"` wrapper + `role="tab"` + `aria-selected={activeTab === t}` on each tab button; `aria-pressed={period === p}` on each period pill. Merges main #8 + #9. — `page.tsx:448, 478`

**F10** [crit] Anon context vacuum — tabs, period picker, and rank card are hidden for anon (correct), but no copy tells anonymous visitors what the leaderboard is or why only 3 people appear (PRINCIPLE §3.2 — empty/partial states need copy when no action exists). Fix: add a one-line description above the 3-row list for anon: "Top readers by Verity Score. Sign up to see the full ranking." — `page.tsx:437, 399`

**F11** [crit] No `error.tsx` in `/leaderboard/` directory. The first useEffect has no try/catch around `refreshAllPermissions()` — an uncaught exception leaves a blank page with no recovery affordance (PRINCIPLE §3.3). Fix: add `web/src/app/leaderboard/error.tsx` with a standard error + retry boundary. — `page.tsx:158`

**F12** [crit] `resendState === 'error'` renders static text "Something went wrong. Try again in a moment." with no retry button and no way to reset to `idle`. User stuck until page reload (PRINCIPLE §3.3). Fix: add a "Try again" button that calls `setResendState('idle')`. — `page.tsx:827`

**F13** [crit] No AbortController in the data-load useEffect. Rapid tab/period/category switches launch parallel async `load()` calls; the last `setUsers(...)` wins regardless of arrival order — list can display results from a period/tab that is no longer selected. Fix: `const controller = new AbortController()`; return `() => controller.abort()`; check `!controller.signal.aborted` before each `setUsers`/`setLoading` call. — `page.tsx:191`

**F14** [crit] Sign-out mid-session race: `me` becomes null but `period` state retains its last value. The load effect condition at line 227 (`period !== 'All time'`) can be true when `me=null`, causing the period-RPC path to fire. That path's re-fetch at line 307 uses `.limit(50)` — the anon 3-row cap is never applied. Fix: add `|| !me` guard to the anon cap check, or reset `period` to `'All time'` on `me → null` transitions. — `page.tsx:227, 307`

### Data integrity

**F15** [crit] Period-RPC re-fetch (`public_profiles_v.in('id', ids)` at line 307) missing `.eq('show_on_leaderboard', true)`. A user who appeared in `leaderboard_period_counts` but since toggled opt-out still renders in period results. Fix: add the filter. — `page.tsx:307`

**F16** [polish] Tied `verity_score` ORDER BY at line 332 has no secondary sort column — equal-score users swap positions non-deterministically. Fix: add `, id ASC` as a stable tiebreaker. — `page.tsx:332`

**F17** [polish] Block-list filtering is entirely client-side post-fetch (line 353). A viewer who blocks all users ranked above them appears as #1 in their rank card and sticky bar. Low-stakes on a public leaderboard, but gameable. Fix: compute `myRank` from the pre-block list; apply blocks only for list display. — `page.tsx:353, 363`

**F18** [crit] `me`-row fetch (line 164) selects `email_verified` and `plan_status` but not `is_banned` or `frozen_at`. A banned or frozen viewer who ranks in the visible list still sees "Your rank" card and sticky bar — suspended state invisible to their own session. Fix: add `is_banned, frozen_at` to the me-row select; hide rank affordances if banned or frozen. — `page.tsx:167`

### State / UX

**F19** [polish] "Your rank" card (line 428) and sticky bar (line 894) always display `me.verity_score` regardless of active ranking metric. Period paths rank by `reads_count`; showing `verity_score` beside a reads-based rank number is incoherent. Fix: derive `displayMetric` from `activeTab` + `period`; show `reads_count` for period paths, `verity_score` for default. — `page.tsx:428, 894`

**F20** [polish] Period picker disappears entirely when `activeCat` is set (condition includes `!activeCat` at line 479), but `period` retains its last value. Category leaderboard always ranks all-time (no period filter in the category-path query). User who had "This Week" selected and then picks a category gets all-time results with no indication. Fix: show a static "(All time)" label beside the category pill when `activeCat` is set. — `page.tsx:479`

**F21** [polish] Loading state renders plain "Loading..." text inside the list container (line 566) instead of skeleton rows. Every adjacent list surface uses skeletons. Fix: replace with 5 skeleton `LeaderRow` placeholder divs at the same height as real rows. (PRINCIPLE §3.1) — `page.tsx:566`

**F22** [polish] Empty-state copy "No one has earned points with these filters yet" (line 579) renders on the Rising Stars tab where ranking is by account recency, not "points earned." Misleading. Fix: branch copy by `activeTab` — Rising Stars: "No new accounts in the past 30 days." — `page.tsx:579`

**F23** [polish] Anon blur CTA copy (line 693): "Free account unlocks ranks beyond top 3." Gate is actually `email_verified`, not account type. A signed-up-but-unverified user reading this would try to sign up again. Fix: "Verify your email to see the full leaderboard." (matches unverified-overlay copy at line 817). — `page.tsx:693`

**F24** [polish] Resend-verification button copy "Verify email" (line 847) is misleading — action sends an email, does not perform the verification itself. Fix: "Resend verification link." — `page.tsx:847`

**F25** [polish] Double load on mount for every authed user: initial render fetches 3 rows (`me=null`), then immediately re-fetches 50 rows after `setMe` resolves — two sequential loading flashes with a row-count jump. Fix: defer initial data load until `meLoaded` flag is set. — `page.tsx:347`

**F26** [polish] `activeSub` state (line 115) is never applied to any query (acknowledged at line 559 comment). Dead state included in the empty-state button condition (line 581) and button active-styling — creates a future trap if subcategory pills are wired without connecting the query. Fix: remove `activeSub` from the empty-state condition and button styling until subcategory queries are wired. Merges main #12 + #13. — `page.tsx:115, 559`

**F27** [polish] `refreshAllPermissions()` + `refreshIfStale()` called sequentially (lines 158–160) — `refreshAllPermissions` does a full reload; the immediately following `refreshIfStale` sees fresh data and no-ops. Redundant call. Fix: remove `refreshIfStale()` call; `refreshAllPermissions()` alone is sufficient. — `page.tsx:158`

**F28** [polish] Viewer's own row in the top-50 list has no visual distinction. When ranked #12, scrolling to find yourself among 50 identical rows requires reading every name (PRINCIPLE §8.1). Fix: add a subtle `background: var(--accent-subtle)` tint and a small "You" pill on the viewer's row. — `page.tsx:717`

**F29** [polish] Unranked copy at line 423: "not in the top N for Rising Stars" — confusing for established users permanently ineligible for Rising Stars (account >30 days). Fix: suppress the unranked rank card entirely on the Rising Stars tab — show rank card only when viewer IS in the Rising Stars list. — `page.tsx:423`

**F30** [polish] No section headings (`<h2>`) in page structure. Document outline has only the `<h1>` "Most Informed"; leaderboard list and rank sections are unlabelled — violates §6.2 landmark rule. Fix: add `<h2>` for the list section ("Top Verifiers" / "Rising Stars" matching active tab) and the "Your rank" card ("Your ranking"). — `page.tsx` (render section)

### Dark mode / tokens

**F31** [polish] Empty-state heading hardcodes `color: '#111'` (line 575); "Clear filters" button hardcodes `background: '#111'` / `color: '#fff'` (lines 590–591). Both break in dark mode (PRINCIPLE §1.1). Fix: `var(--text)` and `var(--accent)` respectively. — `page.tsx:575, 590`

**F32** [polish] Active tab indicator uses `background: 'rgba(0,0,0,0.08)'` (line 460) — near-invisible on dark backgrounds. Fix: replace with a token (`var(--tab-active-bg)` or equivalent) that has a dark-mode counterpart. (PRINCIPLE §1.1) — `page.tsx:460`

**F33** [polish] `me`-row fetch includes `email_verified` and `plan_status` in the SELECT (line 168) but neither is read in current rendering logic (UI switched to permission-cache flags `fullAccess`/`canCategories`). Dead columns fetched on every signed-in page load. Fix: remove both from the SELECT. — `page.tsx:168`

### Copy / accessibility

**F34** [polish] Period filter buttons `minHeight: 36` (line 490) below the 44px touch-target floor on web touch surfaces (PRINCIPLE §2.1, WCAG 2.5.5). Fix: `minHeight: 44`. — `page.tsx:490`

**F35** [polish] `VerifiedBadge.tsx:23` uses `var(--right)` for the verified color. The brand token across the rest of the app is `--p-verified`. Badge color differs from comments, profile, and card surfaces. Fix: `var(--right)` → `var(--p-verified)`. — `VerifiedBadge.tsx:23`

**F36** [polish] `stripKidsTag` regex at line 51 — `^kids?\s+` matches "Kid [Word]" at the start of any string. An adult category named "Kid Science" strips to "Science". Fix: match only the admin naming convention (`^Kids\s+` capital-K, no `?`) or use an exact-match allowlist. — `page.tsx:51`

### Metadata

**F37** [polish] `layout.js` missing `openGraph` and `twitter` metadata keys — leaderboard renders no social-preview card when shared. Fix: add `openGraph: { title, description, type: 'website' }` and `twitter: { card: 'summary' }`. — `leaderboard/layout.js:1`

**F38** [polish] `layout.js` is plain JavaScript, not TypeScript. Metadata property typos accepted silently. Fix: rename to `layout.tsx` and type as `export const metadata: Metadata`. — `leaderboard/layout.js:1`

### Parity — iOS

**F39** [parity] iOS `LeaderboardView` has a "Weekly" tab (`TabKey.weekly` at `LeaderboardView.swift:~620`) absent from web. Web has only "Top Verifiers" and "Rising Stars." Owner needs to confirm which platform is source of truth; not blocking Slice 14 if answer is "web is source of truth." — `LeaderboardView.swift:~620`

**F40** [parity] iOS does not apply a block-list filter to leaderboard results — no `blocked_users` query in `LeaderboardView.swift`. Blocked users still appear on iOS leaderboard. Fix: mirror the web bidirectional block fetch and apply before display. — `LeaderboardView.swift`

**F41** [parity] iOS `USER_COLUMNS` omits `is_expert` (line ~644 of `LeaderboardView.swift`) — Expert badges never render on iOS leaderboard rows. Web renders them. Fix: add `is_expert` to iOS column list (pending DECISION #057 — if Q1 answer is B or C, iOS already matches). — `LeaderboardView.swift:~644`

**F42** [parity] iOS gates period filter on a dedicated `leaderboard.filter.time` permission (line ~63); web collapses period access into `fullAccess` (`leaderboard.view`). A user with `leaderboard.view` but not `leaderboard.filter.time` sees period pills on web, not on iOS. Fix: align the permission check — either add `leaderboard.filter.time` to web period-filter guard, or remove it from iOS and rely solely on `leaderboard.view`. — `LeaderboardView.swift:~63`, `page.tsx:478`

**F43** [parity] iOS Rising Stars query (`loadRisingStars` at line ~560) does not filter `deletion_scheduled_for IS NULL`. Deletion-scheduled users can appear in iOS Rising Stars. Web's `public_profiles_v` handles this automatically. Fix: add the filter to the iOS query. — `LeaderboardView.swift:~560`

**F44** [parity] iOS retry logic sets `loading = true` (line ~193) but `loading` is not the `.task(id:)` trigger — the data fetch never re-runs; user is stuck on a spinner indefinitely. Fix: use a dedicated `@State var reloadToken: UUID` as the task identifier; reset it on retry. — `LeaderboardView.swift:~193`

### Minor

**F45** [polish] `isLast` off-by-one at line 741: `i === visibleUsers.length - 4 - 1` should be `i === visibleUsers.length - 4` (last index of `.slice(3)`). True last row renders an unwanted divider. — `page.tsx:741`

**F46** [polish] `Avatar.tsx:46` uses `raw.slice(0, 3)` for initials truncation but does not use `Array.from()`, unlike the adjacent first-char extraction. Multi-codepoint chars (emoji, flag sequences) may split a surrogate pair. Fix: `Array.from(raw).slice(0, 3).join('')`. — `Avatar.tsx:46`

---

## Refuted

**F_R1** — Reviewer claimed Owner Mode holder appearing in the leaderboard list violates DECISION #020. **REFUTED.** DECISION #020 explicitly states: "leaderboard and any other public surface render the holder identically to a normal user." The holder's presence in the list is by design — only the Owner Mode *indicator* is prohibited. No indicator is shown. Code is correct.

---

## Summary

| Severity | Count |
|----------|-------|
| [crit] — security / functional blocker | 14 (F01–F14, F18) |
| [polish] — quality floor | 26 (F15–F17, F19–F38, F45–F46) |
| [parity] — iOS | 6 (F39–F44) |
| Refuted | 1 |
| **Total** | **46** |

*(Note: F15–F17 are data integrity; classed [crit] in narrative but marked [polish] for slice priority ordering as they are not user-visible exploits.)*

---

## Decisions consumed

- DECISION #020 — Owner Mode not publicly visible on leaderboard (confirmed correct by refuted F_R1)
- DECISION #054 — URL state pattern (extended via auto-locked DECISION #058)
- DECISION #055 — Category URL state (same extension)
- DECISION #025 — No social-proof outside profile (leaderboard IS a scores surface; no offenders found)

## New decisions

- **DECISION #057** — Pending owner answer to Q1 (Expert/VerifiedPublicFigure badge on leaderboard)
- **DECISION #058** — URL state for leaderboard (auto-locked; see above)

---

## Slice 14 — Prerequisites and scope

**Blocked on:** nothing — all decisions locked.

**Previously blocked on:**
- [x] DECISION #057 — owner answered C (2026-05-02); F41 closes without iOS code change

**Elevated-care items (require adversary pass):**
- F01 + F03: data leak (50-row response to non-fullAccess users) — security
- F02: rank information leak for unverified users

**Slice scope:** All 46 findings above. See `UI_UX_REVIEW_SLICES.md` Slice 14 entry.
