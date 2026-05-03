# UI/UX Review — Execution Slices (post-Unit-2)

This is the build-ready execution plan for Wave A unit 2 (Article reader) findings + the cross-cutting slices it surfaces. The owner's directive: every slice is prepped thoroughly so when build starts, build → 1-day verification sweep → fix handful of bugs → launch.

**No code changes are pending in this doc.** When a slice starts, open a fresh session, point `UI_UX_REVIEW_NEXT.md` at the slice, and execute.

**Quality bar (owner-stated):** stellar + works perfectly. Every slice ends with a verification pass that reads code, runs the build, and confirms behavior in browser/simulator.

---

## Naming convention

Slices are sequentially numbered in build order. The slice tracking table (bottom of this doc) tells you which slice is which type (Foundation / Unit fix / Cross-cutting / Verification) and what it depends on.

Each slice header below shows finding count where applicable so the scope is visible at a glance.

New slices append to the end of the sequence as units complete review and need fixes (e.g., Unit 3 review → Slice 11, Unit 4 review → Slice 12, etc.).

## Why these slices, in this order

Order is dictated by dependencies, not by perceived priority. Skipping ahead breaks downstream slices.

```
Slice 1  — admin.god_mode → admin.owner_mode rename     ← prerequisite for every fix slice
Slice 2  — Subcategory schema  (TODO-010 blocker)       ← prerequisite for Slice 7
        │
        ▼
Slice 3  — Unit 1 / Home cleanup (49 findings)
Slice 4  — Unit 2 / Article reader / Layout overhaul    ← prerequisite for Slice 5
Slice 5  — Unit 2 / Article reader / Broken-state cleanup (128 findings)
        │
        ▼
Slice 6  — Registration wall                              ←─┐
                                                            │ can run parallel
Slice 7  — Admin ad system completion                     ←─┘ (no shared files)
        │
        ▼
Slice 8  — iOS CSAM-trio bridge   ← independent — ship anytime
        │
        ▼
Slice 9  — Cross-platform parity bridges
        │
        ▼
Slice 10 — Wave A verification (the "1-day sweep")        ← launch gate
        │
        ▼
LAUNCH
```

Slice 8 (iOS CSAM) is fully independent and can ship parallel with any other slice. Slices 1 + 2 (foundation) must finish before any unit-fix slice. Slice 4 is prerequisite for Slice 5. Slices 6 + 7 don't share files and can run in parallel sessions if owner wants.

**Future Wave A unit-fix slices** (numbered as their reviews complete): Slice 11 (Unit 3 / Browse), Slice 12 (Unit 4 / Search), Slice 13 (Unit 5 / Category), Slice 14 (Unit 6 / Leaderboard), Slice 15 (Unit 7 / Public profile chrome), Slice 16 (Unit 8 / Marketing bundle), Slice 17 (Unit 9 / Legal/info sweep), Slice 18 (Unit 10 / Auth flow), Slice 19 (Unit 11 / Logout). Wave B onward continues numbering.

---

## Foundation slices (1 + 2)

Both are load-bearing for downstream slices.
- Slice 1: every slice that touches the article reader, comments, or admin perm checks references the legacy `admin.god_mode` key. Rename now or every slice carries the rename forward. Lowest-risk, run first.
- Slice 2: Slice 7 (ad system) cannot do "Sports > NFL" targeting without subcategories.

### Slice 1 — admin.god_mode → admin.owner_mode rename

**Prerequisite:** None.
**Elevated-care:** YES (RBAC). Adversary pass mandatory before ship.

**Scope:** Per DECISION #013, replace every reference to the legacy `admin.god_mode` permission key with `admin.owner_mode`. The DB row in the perms catalog gets renamed, and all 10+ call sites get updated.

**Confirmed call sites (from finding #93 verification):**
- `web/src/lib/auth.js` lines 413, 480
- `web/src/lib/permissions.js` lines 137, 152, 196, 204, 212, 231, 242
- `web/src/app/[slug]/page.tsx:236`
- `web/src/components/article/ArticleTracker.tsx` (god-mode gate per Item 11a Phase 3 comment)
- `web/src/lib/useTrack.ts` (god-mode gate per same item)

**Scan-and-confirm step:** before rename, run `grep -rn 'god_mode\|admin\.god_mode' web/ VerityPost/ VerityPostKids/ supabase/` to surface every occurrence. Update all matches. Then run again to confirm zero matches.

**DB migration:**
```sql
-- Rename in perms catalog
UPDATE permissions SET key = 'admin.owner_mode' WHERE key = 'admin.god_mode';
-- Update permission_set memberships (if perms are referenced in any sets table)
UPDATE permission_set_items SET permission_key = 'admin.owner_mode' WHERE permission_key = 'admin.god_mode';
-- If any user_permissions / role_permissions row references the old key, update
UPDATE user_permissions SET permission_key = 'admin.owner_mode' WHERE permission_key = 'admin.god_mode';
```
Verify via MCP `execute_sql`: `SELECT key FROM permissions WHERE key LIKE '%god_mode%' OR key LIKE '%owner_mode%';`

**Test plan:**
- Verify owner login (admin@veritypost.com) still bypasses gates after rename.
- Confirm `OWNER_EMAILS` allowlist removed if it was the backup path (per DECISION #013 — DB role-grant is sole path).
- Type-check + grep pass with zero `god_mode` matches outside DECISIONS.md / changelog / docs.
- Manual: log in as owner, hit `/[any-slug]`, confirm view-counter suppression still works (check `articles.view_count` doesn't increment on owner reads).

**Owner-input not needed** — DECISION #013 already locked.

### Slice 2 — Subcategory schema

**Prerequisite:** None. Self-contained DB + admin work.
**Elevated-care:** YES (schema migration). Adversary pass mandatory before ship.

**Scope:**
1. Migration: create `public.subcategories` table:
   - `id uuid PK default gen_random_uuid()`
   - `category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT`
   - `name text NOT NULL`
   - `slug text NOT NULL`
   - `display_order int DEFAULT 0`
   - `is_active boolean DEFAULT true`
   - `created_at timestamptz default now()`
   - `updated_at timestamptz default now()`
   - Unique constraint on `(category_id, slug)`
   - Index on `category_id`
   - RLS: read = authenticated; write = `admin.categories.edit` perm (existing key; verify via MCP)
2. Migration: add `articles.subcategory_id uuid REFERENCES subcategories(id)` (nullable). Index it.
3. Migration: add `ad_units.targeting_subcategories jsonb` (default `'[]'::jsonb`). Mirrors `targeting_categories` shape.
4. Admin UI: add subcategory CRUD inside `/admin/categories/[id]` (sub-route `/admin/categories/[id]/subcategories` listing + create/edit/delete). Use existing patterns from `/admin/categories`.
5. Article admin: add subcategory dropdown (filtered by selected category) on `/admin/story-manager` and `/admin/kids-story-manager` article-edit forms.
6. Article reader (web + iOS): no behavior change — subcategory is metadata only at this stage; consumed by Slice 7 (ad system).

**Files touched:**
- `supabase/migrations/<next-id>_subcategories.sql` (new)
- `web/src/types/database.ts` regenerate via MCP `mcp__supabase__generate_typescript_types`
- `web/src/app/admin/categories/[id]/page.tsx` (add Subcategories section)
- `web/src/app/admin/categories/[id]/subcategories/page.tsx` (new)
- `web/src/app/admin/categories/[id]/subcategories/[sub_id]/page.tsx` (new)
- `web/src/app/admin/story-manager/...` (subcategory dropdown on article form)
- `web/src/app/admin/kids-story-manager/...` (same)
- `web/src/app/api/admin/categories/...` extended for subcategories OR new `/api/admin/subcategories/...`

**Test plan:**
- MCP-verify schema landed: `mcp__supabase__list_tables` shows `subcategories`; `targeting_subcategories` column exists on `ad_units`.
- Admin: create category "Sports", add subcategories "NFL", "NBA", "MLB". Confirm UI lists them.
- Article admin: open an existing article, set category=Sports, subcategory=NFL, save, reload, confirm persisted.
- Type-check: `bun --cwd web tsc` clean.

**Owner-input not needed** — schema follows existing patterns.

---

## Slice 3 — Unit 1 / Home cleanup (49 findings)

**Status:** shipped 2026-05-02 (build clean, tsc clean). Decisions for Unit 1 locked at DECISIONS #021–#029. Unit doc: `UI_UX_REVIEW/A-1-home.md`.

**Prerequisite:** Slices 1 + 2 done.
**Elevated-care:** NO (visual + state cleanup; no RBAC / payments / kid-safety / migration). Adversary pass recommended but not mandatory.

**Scope summary:** Unit 1 surfaced 49 findings on the home page (`/`). Covered:
- "Today's edition" / "today" framing strip (DECISION #021 — curated front, not today-bound).
- `HomeFirstLoginMoment` removal (DECISION #026).
- Restricted-account state-aware home CTA (DECISION #027).
- Static hybrid timestamps on article cards (DECISION #029).
- `top_stories` broken-pin handling (DECISION #028).
- Slug-less article filtering at query layer (DECISION #022).
- No calendar dateline in chrome (DECISION #023).
- Client-island universal-content rendering (DECISION #024).
- No social-proof / streak surfaces outside profile (DECISION #025).

**Files touched (preview, finalized at slice open):**
- `web/src/app/page.tsx` (home page)
- `web/src/app/_HomeBreakingStrip.tsx`, `_HomeFooter.tsx`, `_HomeFirstLoginMoment.tsx` (delete), `_homeShared.ts`
- iOS adult home parity: `VerityPost/VerityPost/HomeView.swift` (Wave D Unit 30 carries this — flag in U30 when reached)

**Sweep candidates surfaced:** edition-copy-sweep, dark-mode-token-sweep — coordinate with sweep slice when reached.

**Test plan, decision references, owner-input items:** populated at slice open.

---

## Slices 4 + 5 — Unit 2 / Article reader (128 findings)

Unit 2's fix work is split into two consecutive slices:
- **Slice 4** — Layout overhaul (75/25 desktop rail + mobile 3-tab). Foundation for the other findings.
- **Slice 5** — Broken-state cleanup (the remaining 126 findings minus the layout-related ones).

### Slice 4 — Article reader layout overhaul

**Prerequisite:** Slices 1 + 2 done.
**Elevated-care:** NO. Adversary pass recommended.

**Why before Slice 5:** Slice 5's broken-state cleanup includes findings (#1, #109) that disappear when the layout changes. Doing layout first means Slice 5 doesn't waste effort on the old single-column design.

**Scope (DECISION #008):** Desktop article reader becomes 75/25 split — article body in 75% column, timeline in 25% right rail. Article body still respects 680px reading-measure cap inside its 75% region. Timeline rail is sticky (sticky after natural scroll position).

**Scope (DECISION #009):** Mobile reader becomes 3-tab UI — Article / Timeline / Discussion. Each tab preserves scroll position, composer draft, and quiz state across tab switches (DECISION #011). Discussion tab covers both quiz card and comments thread.

**Files touched:**
- `web/src/components/article/ArticleSurface.tsx` — restructure layout. Remove inline `<TimelineSection>` and `<SourcesSection>` from inside the article body; they move to the rail (desktop) / tabs (mobile).
- `web/src/components/article/ArticleReaderLayout.tsx` (new) — wraps `ArticleSurface` + `TimelineSection` + `SourcesSection` + `ArticleEngagementZone`. Detects viewport via CSS-only media query; renders rail-layout on desktop, tab-layout on mobile.
- `web/src/components/article/ArticleReaderTabs.tsx` (new) — mobile tab UI with stateful tab containers (NOT remount-on-switch — uses CSS `display: none` or React-state-preserving conditional render to satisfy DECISION #011).
- `web/src/components/article/TimelineRail.tsx` (new) — desktop-only sticky rail wrapper.
- `web/src/app/[slug]/page.tsx` — pass timeline + sources + engagement zone children into the new layout component instead of rendering them sequentially.
- Add `<Ad placement="article_rail"/>` slot inside the rail (handled in Slice 7 wiring).

**Implementation notes:**
- Use CSS Grid or Flexbox for the 75/25 split, with a `min-width: 1024px` media query to switch between rail and tabs. Avoid JS viewport detection — use CSS-only.
- Mobile tabs use `aria-selected`, `role="tab"` / `role="tabpanel"` semantics. Tab buttons hit-target ≥ 44px (PRINCIPLE §2.1).
- Tab state-preservation: keep all 3 tab panels mounted, toggle visibility with `hidden` attribute or `display: none`. Confirms DECISION #011 (scroll/draft/quiz preserved on switch).
- Multi-article story `?a=` switch still remounts the engagement zone via `key={article.id}` per current behavior — this is handled separately in Slice 5 finding #72.

**Test plan:**
- Desktop ≥1024px: confirm 75/25 split, timeline visible in rail, article body capped at 680px inside 75% region, footer (NextStoryFooter) full-width below.
- Mobile <1024px: 3 tabs visible, switching tabs preserves position. Type a draft in Discussion, switch to Timeline, switch back — draft still there. Start a quiz, switch tabs, switch back — quiz state preserved.
- Verify with reduced-motion + dark-mode + touch-keyboard.
- Type-check + lint clean.

**Owner-input not needed** — DECISIONS #008/#009/#011 already locked.

---

### Slice 5 — Article reader broken-state cleanup

**Prerequisite:** Slices 1 + 2 + 4 done.
**Elevated-care:** YES — touches RBAC (canBypassQuiz role logic per finding #94), comment moderation flows (Hide/Report/Block dialogs per findings #63, #100), and restricted-account composer states. Adversary pass mandatory.

**Why this size:** 21 confirmed-broken findings + ~70 polish/parity findings + a handful of refuted/deferred. Bundled because they all touch the same ~12 files. Splitting risks merge conflicts. Recommended pattern: 4-stream parallel cleanup (per memory `feedback_4_stream_parallel_cleanup.md`).

### Fix recipes per finding

Recipes are sized for direct execution. Each cites the finding number in `UI_UX_REVIEW/A-2-article-reader.md`.

**Stream A — Engagement zone state cells (highest impact):**

- **#51 + #94 (canBypassQuiz on no-quiz article):** Change `web/src/components/ArticleEngagementZone.tsx:69` from `quizPassed={hasQuiz ? hasPassed : false}` to `quizPassed={hasQuiz ? hasPassed : true}`. When there is no quiz, treat the user as un-gated (the quiz gate is the comment unlock; absence of a quiz means there's nothing to unlock). Update CommentComposer copy at `web/src/components/CommentComposer.tsx:326-340` to suppress the "Pass the quiz above" lock when `hasQuiz` is unknown — but cleaner: pass `hasQuiz` down explicitly so composer can render either "pass quiz" (locked) or "join the discussion" (open) accordingly.
- **#52, #53 (silent fetch errors):** Don't swallow `quizCountResult.error` / `passCheckResult.error`. Surface a small inline note to logged-in users: "Couldn't check this article's quiz right now. Refresh to try again." at `web/src/app/[slug]/page.tsx:218-219`. Don't lock the composer state when we couldn't determine quiz existence — fall back to "no quiz, comments open" (safer than wrongly locking).
- **#55 (quiz submit fail on last question):** Add a "Try again" button on `web/src/components/ArticleQuiz.tsx:444` (the existing inline error block in the answering panel). Onclick clears `error`, sets stage back to 'answering', allows re-submitting. Also: clear locked answers if the failure is server-side.
- **#84 (selectOption double-tap race):** At `web/src/components/ArticleQuiz.tsx:199-208`, add a `useRef` guard `submittingRef.current` set true at the start of `selectOption` and reset after the setTimeout fires. Bypasses async-state guard race.
- **#94 (canBypassQuiz excludes mods on drafts):** Extend `canBypassQuiz` at `web/src/app/[slug]/page.tsx:306` to include category supervisors and `comments.flag` holders for non-published articles. New formula: `canBypassQuiz = canEdit || isOwnerMode || (article.status !== 'published' && (isSupervisor || hasModFlag))`.

**Stream B — Comment thread state + race conditions:**

- **#59, #60 (load failure UX):** At `web/src/components/CommentThread.tsx:173`, when `loadErr` is set, render a dedicated error block with a "Retry" button — NOT the generic empty state. Anon empty state (line 1132) gets a sign-in CTA: "Sign in to join the discussion." linking to `/login` with a return-to param.
- **#63 (dialog errors render outside modal):** Move the `setError` call inside `runDialogAction` to set a dialog-local `dialogError` state, render it inside the dialog (after the form fields, before the action buttons). Remove or scope the outer `error` render at line 854 so it doesn't appear behind the modal.
- **#73, #79 (realtime conflicts):** UPDATE handler at `web/src/components/CommentThread.tsx:325`: when status flips to non-visible, instead of `prev.filter(...)`, replace the row with the soft-delete shape (`body: '[deleted]'`, `status: 'deleted'`) so all viewers see the same state. Refactor the `alreadyPresent` closure (line 329) to use the data flow correctly: read presence from a ref, mutate inside updater is a StrictMode bug.
- **#74 (handlePosted no author):** At `web/src/components/CommentThread.tsx:563`, when adding the optimistic comment, await a single `public_profiles_v` lookup for the current user's display data and merge into `users` before insert into `setComments`.
- **#75 (composer double-submit):** At `web/src/components/CommentComposer.tsx:240`, set `setBusy(true)` BEFORE awaiting `checkCanMention`. Maintain busy through the full submit window.
- **#78 (CommentRow per-row settings fetch):** Move the `/api/settings/public` fetch out of `CommentRow.tsx:157` and into `CommentThread` (already fetches it once); pass `helpfulThreshold` and `commentMaxDepth` as props down the row tree.
- **#80 (thread_depth drift):** Drop `comment.thread_depth ?? depth` and use just `depth` for reply gating. The DB-stored value is allowed to drift; render-time depth is canonical.
- **#83 (no body scroll lock on dialogs):** Add `useEffect` in `CommentThread.tsx` at the dialog mount: when `dialog !== null`, set `document.body.style.overflow = 'hidden'`; restore on unmount.
- **#92 (report dialog mobile keyboard clip):** Add `max-height: calc(100vh - 32px)`, `overflow-y: auto` to `dialogStyle` at line 1202.

**Stream C — Bookmark / share / quiz state:**

- **#82 (BookmarkButton no GET):** Add a `useEffect` at `web/src/components/BookmarkButton.tsx:18` that fetches `/api/bookmarks?article_id=<id>` on mount when `currentUserId && permsReady && canBookmark`. Set `bookmarked=true` if response indicates already-bookmarked. Required new GET endpoint or reuse existing list endpoint with `article_id` filter.
- **#67 (ShareButton silent clipboard fail):** At `web/src/components/ShareButton.tsx:14`, on catch, set local `error` state and render "Copy failed — link is in the URL bar." for 3s. Same dismissal as success state.
- **#81 (bumpQuizCount global localStorage):** Refactor `web/src/lib/session.js` `bumpQuizCount` to namespace by user_id + article_id. New key: `vp:quiz_count:${userId}:${articleId}`. Migration of existing key not required (low-impact).

**Stream D — Server / page-level / chrome:**

- **#57, #37 (`?a=draft` 404):** At `web/src/app/[slug]/page.tsx:226-230`, when `matched && matched.status !== 'published' && !canEdit`, `redirect(\`/${story.slug}\`)` instead of `notFound()`. Keep edit case as-is.
- **#71, #38 (generateMetadata leaks drafts):** At `web/src/app/[slug]/page.tsx:99-101`, pre-filter for published; if none, return `{ title: 'Article not found · Verity Post' }` and skip JsonLd downstream.
- **#64 (`_ArticleFetchFailed` infinite refresh):** Replace `router.refresh()` with `window.location.reload()` to break the SSR cache OR add a 5s cooldown + a "Contact support" link if it persists. Preferred: full reload + a one-shot retry counter in sessionStorage to avoid loops.
- **#65, #66 (sub-fetch silent degradation):** Surface inline notes when individual sub-fetches fail. e.g. timeline fetch fails → render "Timeline couldn't load." in the rail instead of nothing.
- **#85 (error.tsx ignores error prop):** Add `console.error('[article.error]', error)` at `web/src/app/[slug]/error.tsx:6` for observability. Don't surface to user.
- **#56 + #33 (editor draft preview):** Apply DECISION #033. Drop `status === 'published'` gate; render banner; intercept submits.
- **#11 + #36 (COPPA × adult viewer):** Apply DECISION #036. Banner-below pattern; suppress engagement zone with explicit context.
- **#15 + #2 (body gate dropped + denial copy):** Apply DECISIONS #030 + #032. Drop `canViewBody` ternary; remove the "Sign in to read" path entirely. The path only fires on age-gated content (18+) — if such content exists, swap to "Upgrade" copy per DECISION #032 there.
- **#14, #66 + #31 (Sources/Timeline tease):** Apply DECISION #031. Heading + tease + See plans.
- **#2 (404 "Today's front page"):** At `web/src/app/[slug]/not-found.tsx:31`, change to `Front page`. Update colors to `var(--text-primary)`, `var(--dim)`, `var(--card)` per finding #8. Bonus: while in this file, fix #8 (hardcoded hex) at the same time.
- **#3 (NextStoryFooter "Back to edition"):** At `web/src/components/NextStoryFooter.tsx:71`, change to `Back to home`.
- **#93 (already done in Slice 0b):** verify no remaining `god_mode` references; remove the legacy view-counter check left over.
- **#5 (ArticleEngagementZone duplicate marginTop):** At `web/src/components/ArticleEngagementZone.tsx:33-38`, drop `marginTop: 40` (the shorthand `margin: '40px auto 0'` covers it).
- **#7 (currentUserTier dead prop chain):** Drop `currentUserTier` from `ArticleEngagementZone` props + `CommentThread` props + `CommentRow` props. Currently dead.
- **#86 (stale `@migrated-to-permissions` markers):** Remove the lines at `ArticleQuiz.tsx:1-2`, `CommentThread.tsx:1-2`, `CommentComposer.tsx:1-2`, `CommentRow.tsx:1-2` — dead annotations.

**Stream E (verification, runs after A-D):**
- Re-grep for `god_mode`, `Today's front page`, `Back to edition`, `@migrated-to-permissions` to confirm zero matches.
- Re-grep for hardcoded hex colors in changed files; replace any new ones with `var(--*)` tokens.
- Verify all dialog actions show errors INSIDE the dialog (none escape).
- Verify mobile sticky-overflow on report dialog.
- Type-check + lint clean.
- Manual verification per role × state matrix at top of `UI_UX_REVIEW/A-2-article-reader.md`.

**Decisions consumed by Slice 5:** #030, #031, #032, #033, #034, #035, #036, #037, #038, #039 (already locked).

**Owner-input not needed** unless a fix recipe surfaces a new ambiguity mid-build.

---

## Slice 6 — Registration wall

**Prerequisite:** Slices 1 + 2 done; Slice 4 optional (for rail signup nudge placement).
**Elevated-care:** YES — auth flow (anon counter, signup trigger logic, suppression cookie). Adversary pass mandatory.

**Why parallel-able with Slice 7:** No file overlap if executed carefully.

**Scope:**
1. New component: `web/src/components/RegistrationWall.tsx` — modal triggered by Sources/Timeline tease click + 3-article-7-day cohort. Anon read-counter via cookie + server-side rate-limited counter.
2. Backend: cookie-based anon read tracker. Cookie name `vp_anon_reads` storing a timestamped JSON array of last 7 days' article views. Server reads, decrements expired entries, increments on new article view, returns count in `_app` or middleware. Rate-limit accepted because anon traffic is bot-prone — combine with bot-detection heuristics.
3. Trigger points (always-on):
   - Bookmark button click (anon) → wall.
   - Quiz attempt-start click (anon) → wall.
   - Sources/Timeline tease click after 3rd article in 7d → wall.
   - End-of-article passive CTA (anon, every visit, dismissible) → "Sign up to bookmark, follow categories, and join discussions."
4. Wall UX: heading "Read more on Verity Post" + 3-bullet list of free-tier benefits (bookmark, comment, save categories) + `[Sign up — free]` (primary) + `[Continue without an account]` (secondary, dismisses wall, sets a 24-hour suppression cookie).
5. iOS adult: same trigger logic; native sheet equivalent.

**Files touched:**
- `web/src/components/RegistrationWall.tsx` (new)
- `web/src/lib/anonReadCounter.ts` (new) — cookie read/write helper
- `web/src/middleware.js` — increment counter on article-page hits
- `web/src/components/article/SourcesSection.tsx` — wrap See-plans link with wall trigger
- `web/src/components/article/TimelineSection.tsx` — same
- `web/src/components/BookmarkButton.tsx` — wall trigger when anon
- `web/src/components/ArticleQuiz.tsx` — wall trigger on `startAttempt` for anon
- `VerityPost/VerityPost/StoryDetailView.swift` — iOS parity
- Possibly: `web/src/app/page.tsx` (home) for end-of-feed CTA

**Test plan:**
- Anon: open 3 articles, click Sources tease on 3rd → wall fires.
- Anon: click bookmark → wall fires immediately.
- Anon: dismiss wall, refresh → wall does NOT re-fire for 24h (suppression cookie respected).
- Logged-in (free): triggers do NOT fire; perks unlock.
- Bot UA strings: counter doesn't increment.
- Type-check, lint, build clean.

**Decisions consumed:** #043, #030, #031, #040.

**Owner-input needed:**
- Wall copy + benefit-bullets (3 lines). Recommend default copy in build session.
- Suppression cookie duration (default 24h).

---

## Slice 7 — Admin ad system completion

**Prerequisite:** Slice 2 (subcategory schema) + Slice 4 (rail layout for `article_rail` placement).
**Elevated-care:** YES — revenue + privacy (impression tracking, cohort targeting, scroll-depth analytics, tier-hiding rules). Adversary pass mandatory per sub-step.

**Scope:** 9-step build per DECISION #044.

### Step 7.1 — Targeting UI on `/admin/ad-units/[id]`
- Multi-select tree: categories at top level, subcategories nested under each. Persist to `targeting_categories` + `targeting_subcategories` JSON.
- Multi-select for cohorts (free / paid / specific user-cohort tags from `user_cohorts` table — verify exists via MCP).
- Multi-select for countries (ISO-2 list).
- Multi-select for plans (`free`, `verity_plus`).
- Multi-select for platforms (`web`, `ios`).
- Save to existing `targeting_*` JSON columns.
- Server-side: `serve_ad()` RPC reads these arrays and filters candidates by viewer's category match + cohort + country + plan + platform.

**Files:** `web/src/app/admin/ad-units/[id]/page.tsx` (extend), `web/src/app/api/admin/ad-units/[id]/route.js` (extend POST/PATCH validation), `supabase/migrations/<next>_serve_ad_targeting.sql` (update RPC).

### Step 7.2 — Analytics dashboard at `/admin/ad-analytics`
- KPIs row: total impressions, viewable impressions, clicks, CTR, eCPM, revenue (selectable date range: 7d / 30d / 90d / custom).
- Tables: by campaign, by placement, by ad_unit, by advertiser. Sortable, filterable.
- Per-category drill-down: pick a category → see total impressions across all articles in that category, broken down by subcategory. Daily trend chart, viewability %, bot %.
- Per-advertiser drill-down: pick a sponsor → their campaigns, units, impressions per category/subcategory, spend pacing vs budget.
- CSV export per view.
- Built off `ad_daily_stats` for aggregates + `ad_impressions` for fine-grained queries.

**Files:** `web/src/app/admin/ad-analytics/page.tsx` (new), `web/src/app/api/admin/ad-analytics/route.js` (new — drill-down query endpoints).

### Step 7.3 — Slot wiring on actual surfaces
Seed `ad_placements` rows + add `<Ad placement="..."/>` calls:

| Placement | Surface | Position | Tier |
|---|---|---|---|
| `home_top` | `/` | above first hero card | hidden_for: [paid] |
| `home_in_feed_1` | `/` | between rows 4-5 of grid | hidden_for: [paid] |
| `home_in_feed_2` | `/` | between rows 8-9 | hidden_for: [paid] |
| `home_below_fold` | `/` | before footer | hidden_for: [paid] |
| `browse_top` | `/browse` | above category grid | hidden_for: [paid] |
| `browse_sidebar` | `/browse` | rail, when shipped | hidden_for: [paid] |
| `category_top` | `/category/[id]` | above article list | hidden_for: [paid] |
| `category_in_feed_1` | `/category/[id]` | between rows 4-5 | hidden_for: [paid] |
| `article_above_body` | `/[slug]` | above title | hidden_for: [paid] |
| `article_in_body` | `/[slug]` | after ~30% scroll, INSIDE 75% column | display for anon, native for free; hidden_for: [paid] |
| `article_end` | `/[slug]` | before NextStoryFooter | hidden_for: [paid] |
| `article_rail` | `/[slug]` | sticky in 25% rail below timeline | hidden_for: [paid] |
| `article_quiz_interstitial` | quiz pass interstitial | every 3rd | hidden_for: [paid] |
| `mobile_sticky_footer` | all mobile pages except admin | sticky bottom | hidden_for: [paid] |

**Files:** seed migration; `<Ad placement="..."/>` injections in home, browse, category, article files.

### Step 7.4 — Scroll-depth tracking
- IntersectionObserver on every `<Ad/>` to update `is_viewable` + `viewable_seconds` (currently the column exists; verify wiring).
- Article-body scroll-depth events: 25% / 50% / 75% / 100% milestones written to `analytics_events` table. Used in advertiser pitch ("80% of readers scroll past mid-body in Sports > NFL").

**Files:** `web/src/components/Ad.jsx` (already has impression logging — add IntersectionObserver), `web/src/app/[slug]/page.tsx` (article-body scroll listener), `web/src/lib/track.ts` (scroll-event helper).

### Step 7.5 — Frequency-cap enforcement
- Audit `serve_ad()` RPC: confirm it counts `ad_impressions` for the user/session and skips units over `frequency_cap_per_user` and `frequency_cap_per_session`.
- If not enforced, update RPC.

**Files:** `supabase/migrations/<next>_serve_ad_frequency_caps.sql` (if needed).

### Step 7.6 — Creative approval queue
- New admin route `/admin/ads/queue` listing `ad_units` where `approval_status='pending'`. Approve / reject buttons. Block `serve_ad()` from returning unapproved units (verify behavior).
- Audit log entry per approve/reject (per DECISION #018).

**Files:** `web/src/app/admin/ads/queue/page.tsx` (new), `web/src/app/api/admin/ad-units/[id]/approve/route.js` (new).

### Step 7.7 — Per-tier preview tool
- Admin route `/admin/ads/preview` — picks a surface (home / browse / category / article slug) + a tier (anon / free / paid). Renders the surface in an iframe with a synthetic header `X-Ad-Preview-Tier: free` that the `serve_ad()` middleware respects.
- Helps QA tier-hiding rules and slot density before going live.

**Files:** `web/src/app/admin/ads/preview/page.tsx` (new), `web/src/middleware.js` (preview-tier header support, gated by `admin.ads.view`).

### Step 7.8 — Sponsored / native content placement (DECISION #044 + Q15)
- Reserve 1 in-body native slot (signed-in only) + 1 native unit in "More in [Category]" footer rail.
- Visual: clear "Sponsored — [Brand]" label + dividing rule. No chumboxes.
- Defer until first direct-sold relationship; placement schema is in already.

### Step 7.9 — iOS ad serving (deferred)
- Out of scope for initial launch. Plan: pass through `/api/ads/serve` and render in SwiftUI with native MoPub-style ad views OR use Google Mobile Ads SDK with custom adapter.

**Decisions consumed:** #044, #041, #042, #045, #030, #043, #040.

**Owner-input needed:**
- Confirm slot map table above before seeding placements.
- Confirm CSV export schema for advertiser pitches (column names + format).
- AdSense publisher ID env var (`NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`) — provided post-approval.

---

## Slice 8 — iOS CSAM-trio bridge

**Prerequisite:** None. Fully independent.
**Elevated-care:** YES — legal hardening (18 U.S.C. § 2258A reporting). Adversary pass mandatory.

**Scope:** Add `csam`, `child_exploitation`, `grooming` cases to iOS `ReportReason` enum. Reorder confirmation dialog so urgent trio appears first (matching web).

**Files:**
- `VerityPost/VerityPost/BlockService.swift:141-158` (extend enum + dialog)
- `VerityPostKids/VerityPostKids/...` if kids has separate report enum (verify)
- Server-side: `assertReportReason` whitelist already accepts these (web side); confirm.

**Test plan:**
- Build iOS adult target. Confirm new options appear at top of report dialog.
- File a CSAM-flagged report from iOS → confirm reaches `reports` table with correct enum value.
- Build VerityPostKids if separate.

**Decisions consumed:** #047.

**Legal-blocking:** ship before public iOS launch.

**Owner-input not needed.**

---

## Slice 9 — Cross-platform parity bridges

**Prerequisite:** Slice 4 (article reader layout) for the web bridges that depend on the rail.
**Elevated-care:** NO. Adversary pass recommended.

**Scope (web — bridge from iOS):**
1. **Up-Next sheet** at 95% scroll + post-comment-send. Auto-pop modal sheet showing 3 next articles (already-fetched via `nearbyStories`). Replace static `NextStoryFooter` "More in [Category]" footer.
2. **Mid-body quiz teaser** — 5-questions-waiting card injected at midpoint of article body. Click → smooth-scrolls to engagement zone with quiz card highlighted.
3. **Timeline NOW marker** — last/explicit timeline event auto-marked with ring + "Read this coverage" hint on article-typed entries.
4. **Reading-progress ribbon** — top accent bar fills with scroll. CSS `position: sticky` + `transform: scaleX(progress)`.

**Scope (iOS — bridge from web):**
5. **Comment sort (Top / Newest)** — `Picker` in DiscussionContent header.
6. **`comments.section.view` denial copy** — when permission absent, render iOS equivalent of "Comments aren't available for your account."
7. **Hide-mod / Supervisor-flag** — iOS comment-row context menu adds these actions for qualified users.
8. **Multi-article story picker on iOS** — *defer post-launch* per panel split (1 said HIGH retention, 1 said schema-blocked).

**Accept divergence (don't bridge):**
9. TTS controls — iOS native idiom.
10. Ask-an-Expert on iOS — defer post-launch.

**Files:**
- Web: new components `UpNextSheet.tsx`, `MidBodyQuizTeaser.tsx`, `ReadingProgressRibbon.tsx`; modify `TimelineSection.tsx`.
- iOS: extend `StoryDetailView.swift` with sort picker, denial copy, mod actions.

**Decisions consumed:** Q7 panel synthesis (locked to this slice doc; no DECISIONS.md entry required since it's an action list, not a recurring pattern).

**Owner-input needed:**
- Confirm Up-Next sheet trigger threshold (95% scroll vs other).
- Confirm Multi-article picker on iOS — bridge or defer? (Panel split.)

---

## Slice 10 — Wave A verification sweep

**Prerequisite:** All Wave A unit-fix slices + relevant cross-cutting slices done.

**Scope:** Walk every changed surface, verify behavior across roles × states. Hit list of any remaining bugs surfaced. Owner gates launch on this slice's completion.

**Method:** Auto-fires when prerequisites met (continuation protocol detects all Wave A units at `verified` and dispatches Slice 10).

**Verification matrix (must each be checked):**
- Anon × published article (with quiz / without quiz)
- Anon × bookmark click → registration wall fires
- Anon × Sources tease click → wall fires after 3rd article in 7d
- Logged-in (free) × published article × quiz pass
- Logged-in (free) × no-quiz article (composer unlocks correctly)
- Logged-in (free) × Sources tease (heading + "Upgrade")
- Verity Plus × any article (no ads, full Sources/Timeline, ad-free quiz interstitial)
- Editor × draft article (engagement zone with DRAFT banner, intercepted submits)
- Owner Mode × any article (bypass all gates, no view-count increment)
- Restricted account × composer (state-aware affordance per DECISION #027)
- Multi-article story × `?a=` switch (drafts preserved, scroll preserved per DECISION #011)
- Mobile tab switch (Article / Timeline / Discussion) — all state preserved
- COPPA article × adult viewer — body shown + banner below
- Comment realtime — INSERT and UPDATE handlers correct, no duplicate fetches under StrictMode
- Modal dialogs — body scroll locked, errors render INSIDE dialog
- Bookmark button — initial state seeded from server
- Share button clipboard fail — error visible to user
- Ad slot map — every placement renders for anon + free, hidden for paid
- Ad targeting — Sports > NFL article serves Sports > NFL targeted ads only when configured
- Analytics dashboard — drill-downs match `ad_impressions` raw queries
- iOS report dialog — CSAM/child_exploitation/grooming present and ordered first

**Bugs found:** logged into a fresh `UI_UX_REVIEW/A-2-final-sweep-bugs.md` doc. Fix in-session if trivial; defer to a follow-up if deep.

**Launch gate:** owner reviews bug list, signs off.

---

## Slice tracking table

| Slice | Type | Status | Prereq | Decisions consumed | Sessions |
|-------|------|--------|--------|---------------------|----------|
| Slice 1 — `god_mode` → `owner_mode` rename | Foundation | shipped (code + DB applied 2026-05-02) | — | #013 | 1 |
| Slice 2 — Subcategory schema | Foundation | shipped (DB column + database.ts applied 2026-05-02; existing categories.parent_id hierarchy + articles.subcategory_id + admin UI all pre-built) | — | TODO-010 | 1 |
| Slice 3 — Unit 1 / Home (49 findings) | Unit fix | shipped 2026-05-02 (4-stream parallel; tsc + build clean; 10 MOOT findings removed by DECISION #026; 35 confirmed findings fixed; HomeBrokenPinBanner TODO deferred) | 1 + 2 | #021–#029 | 1 |
| Slice 4 — Unit 2 / Article reader / Layout | Unit fix | shipped 2026-05-02 (desktop 75/25 flex rail + mobile 3-tab; tsc + build clean) | 1 + 2 | #008 / #009 / #011 | 1 |
| Slice 5 — Unit 2 / Article reader / Cleanup (126 findings) | Unit fix | shipped 2026-05-02 (4-stream parallel + adversary; 2 gap agents; tsc clean; all 126 findings fixed; commit cc8142a pushed) | 1 + 2 + 4 | #030–#039 | 4 (4-stream parallel) + 1 verification |
| Slice 6 — Registration wall | Cross-cutting | shipped 2026-05-02 (commit bff449e; tsc clean; adversary gaps closed) | 1 + 2 (4 optional) | #043 | 1 |
| Slice 7 — Admin ad system completion | Cross-cutting | shipped 2026-05-02 (4-stream parallel + adversary 8 gaps closed; tsc clean; commit 196508b pushed) | 2 + 4 | #044 + #041 / #042 / #045 / #048–#051 | 4 (parallel streams) + 1 adversary |
| Slice 8 — iOS CSAM-trio bridge | Cross-cutting | shipped 2026-05-02 (BlockService.swift enum extended; adversary clean; pre-existing union-enum divergence logged to drift bin) | — | #047 | 1 |
| Slice 9 — Cross-platform parity bridges | Cross-cutting | shipped 2026-05-02 (3-stream parallel; UpNextSheet+ribbon+teaser+NOW marker web; iOS sort+denial+mod; tsc clean; commit c9a1837 pushed) | 4 | #052 | 1 |
| Slice 10 — Wave A verification sweep | Verification | not started | all Wave A unit-fix slices | — | 1 |
| Slice 11 — Unit 3 / Browse (38 findings) | Unit fix | shipped 2026-05-02 (2-stream parallel; tsc + build clean; smoke PASS; all 38 findings fixed) | 1 + 2 | #029, #053, #054 | 1 |
| Slice 12 — Unit 4 / Search (32 findings) | Unit fix | shipped 2026-05-02 (2-stream parallel; Suspense boundary fix post-smoke; tsc + smoke PASS; 29 findings fixed; F20 refuted; F28/F32 deferred) | none | #022, #029, #031, #032, #043, #053, #054 | 1 |
| Slice 13 — Unit 5 / Category (37 findings) | Unit fix | shipped 2026-05-02 (2-stream parallel + adversary 5 gaps (2 blocking fixed: deleted_at filter + is_kids_safe guard); tsc + build clean; smoke PASS; 36 findings fixed; F33 refuted) | 1 + 2 | #022, #029, #043, #053, #055, #056 | 2 + adversary |
| Slice 14 — Unit 6 / Leaderboard (46 findings) | Unit fix | shipped 2026-05-02 (3-stream parallel + adversary 4 gaps closed: Rising Stars/category data leak, useSearchParams Suspense, sign-out race; tsc clean; smoke PASS; 46 findings fixed) | 1 + 2 | #057, #058 | 3 (parallel streams) + 1 adversary |

---

## Slice 11 — Unit 3 / Browse (38 findings)

**Status:** ready to build
**Prerequisite:** Slices 1 + 2 done (both shipped 2026-05-02).
**Elevated-care:** NO (no RBAC / payments / kid-safety / migration). Adversary pass recommended but not mandatory.

**Decisions consumed:** #029, #053, #054, PRINCIPLE §1.1, §2.1, §3.2, §6

**Scope summary (38 findings, organized by stream):**

### Stream A — Accessibility + ARIA (Findings #1–#9)
- **#1 (FilterSheet dialog):** Add `role="dialog"` `aria-modal="true"` `aria-labelledby="filter-sheet-title"` to the sheet container. Add `id="filter-sheet-title"` to the "Advanced Filters" heading. Add focus-trap (on open: `focus()` the first focusable element; on Escape keydown: `onClose()`). Add `onKeyDown` to backdrop div: `if (e.key === 'Escape') onClose()`.
- **#2 (search input):** Add `aria-label="Search stories and headlines"` to `<input>` at line 597.
- **#3 (Filters button):** Add `aria-label="Open filters"` and `aria-expanded={filterOpen}` to the filters button at line 600.
- **#4 (FilterSheet close button):** Add `aria-label="Close filters"` to the × button at line 374. Increase its hit area to ≥44×44px (change width/height from 28 to 44, or add padding).
- **#5 (search clear button):** Add `aria-label="Clear search"` to the × button at line 598.
- **#6 (touch targets):** `PillToggle` → `minHeight: 44`. Category chips → `minHeight: 44`. Active-pill × dismiss buttons → add `padding: '8px'` + `aria-label={`Remove filter: ${p.label}`}`.
- **#7 (reduced motion — breaking dot):** Wrap `vp-live-pulse` in `@media (prefers-reduced-motion: no-preference)` in the `<style>` block at line 575.
- **#8 (reduced motion — skeleton):** Wrap both `vp-sk` instances (page.tsx:455 and loading.tsx:11) in `@media (prefers-reduced-motion: no-preference)`.
- **#9 (SectionHeader heading):** Change `<div>` inside `SectionHeader` to `<h2>` at line 315. Apply existing uppercase/muted/sans styles to the `<h2>`.

### Stream B — Filter functionality (Findings #10–#15, #38 + DECISION #054)
- **#10 (quiz dead code):** Remove `quiz: QuizKey` from `FilterState`, `DEFAULT_FILTERS`, `hasFilters` check. Remove `QuizKey` type (unused). Clean `activeFilterCount` and `ActiveFilters` (already don't reference quiz). Leave a TODO comment: `// quiz filter: add FilterSection here when quiz data is available on clusters`.
- **#11 (CoverageTimeline touch):** Add `onTouchMove={handleMove}` and `onTouchEnd={() => setTip(null)}` to the container `<div>` at line 181.
- **#12 (date range validation):** Add guard in FilterSheet before applying: if `filters.dateTo && filters.dateFrom && filters.dateTo < filters.dateFrom`, render inline error: "End date must be after start date." Disable "Show N stories" button until valid.
- **#13 (date range semantics):** Document the current semantic (story overlaps range) in a comment. The existing behavior is actually reasonable — a story that spans 3 months IS relevant to a date range inside it. Keep as-is; add a comment.
- **#14 (retry race):** Extract `doLoad` as a stable function; add `abortRef.current?.abort()` before each fetch; use `AbortController`. Reset `stories` to `[]` before retry at line 566.
- **#15 (empty state CTA):** When `stories.length === 0` (genuine empty, not filtered), add CTA: `<Link href="/">← Back to front page</Link>` styled as primary button. Separately: the filtered empty state already has "Clear all filters" — keep it.
- **#38 (URL params — DECISION #054):** On every filter + sort + category + query change: `router.replace(\`/browse?${buildParams(filters, category, query)}\`, { scroll: false })`. On mount: read `useSearchParams()` to initialize state. Helper `buildParams` serializes all dimensions, omits defaults. Note: requires `import { useSearchParams, useRouter, usePathname } from 'next/navigation'`.

### Stream C — Dark mode + visual polish (Findings #17–#22, #29)
- **#17 (C.soft, C.muted, C.resolved):** Replace hardcoded hex with CSS variable equivalents: `soft: 'var(--text-secondary, #444444)'`, `muted: 'var(--dim-more, #999999)'`, `resolved: 'var(--dim, #9ca3af)'`. (Use the actual token names from the design system — verify against `globals.css`.)
- **#18 (header background):** Replace `rgba(255,255,255,0.97)` with `var(--bg-opaque, rgba(var(--bg-rgb, 255,255,255),0.97))`. If the CSS variable doesn't exist yet, use `var(--bg, #ffffff)` with `opacity: 0.97` applied on an inner div.
- **#19 (tooltip white text):** Replace hardcoded `color: '#fff'` in tooltip with `color: 'var(--bg, #ffffff)'` (the light/dark-mode-aware background color for reversed text).
- **#20 (button white text):** Same fix for "Show N stories" button and "Clear all" button.
- **#21 (tap highlight):** Keep `* { -webkit-tap-highlight-color: transparent }` but add a `:focus-visible` outline rule: `button:focus-visible { outline: 2px solid var(--text, #111); outline-offset: 2px; }` to the same `<style>` block.
- **#22 (global scrollbar hide):** Change `::-webkit-scrollbar { display: none }` to only apply to the category chip container and the FilterSheet content area. Add a class name to those containers and scope the CSS.
- **#29 (relTime hybrid):** Update `relTime` function to match DECISION #029: if `h < 24` return relative; else return `Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ms))`. This is consistent with `fmtDate` already in the file.

### Stream D — Skeleton + loading parity + metadata (Findings #30–#32, #37)
- **#30 (BrowseSkeleton vs loading.tsx):** Align the two skeletons: (a) both render 5 rows, (b) `BrowseSkeleton` uses `var(--card)` (not `C.border`) for bones, (c) `BrowseSkeleton` drops lifecycle-colored borders (loading.tsx doesn't have them — match it), (d) animation class names identical.
- **#31 (loading.tsx paddingTop):** Change `paddingTop: 188` to `paddingTop: 'calc(188px + var(--vp-top-bar-h, 0px))'`.
- **#32 (loading.tsx safe-area):** Change `paddingBottom: 80` to `paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))'`.
- **#37 (metadata):** Create `web/src/app/browse/layout.tsx` (new server component) that exports: `export const metadata = { title: 'Browse stories · Verity Post', description: 'Browse breaking, developing, and resolved news stories on Verity Post.', openGraph: { title: 'Browse stories · Verity Post' } }`. No other changes.

### Stream E — Remaining polish (Findings #23–#28, #33–#36)
- **#23 (body scroll lock):** On FilterSheet open: `document.body.style.overflow = 'hidden'`; on close: `document.body.style.overflow = ''`. Add to `useEffect` inside FilterSheet keyed on `open` prop.
- **#24 (active pill labels):** In `ActiveFilters`, replace raw key with human labels: `coverage` map: `{ light: 'Light (<5)', medium: 'In Depth (5–15)', heavy: 'Major (15+)' }`; `sort` map: `{ coverage: 'Most Coverage', duration: 'Longest Running' }`.
- **#25 (search min-char):** Add `aria-describedby="search-hint"` to the input and render `<span id="search-hint" className="sr-only">Type at least 2 characters to search</span>` below. Also show a subtle "Type 2+ characters to search" hint inline when `query.length === 1`.
- **#26 (slug-less card):** Apply DECISION #022 fix at query layer: in `loadStories`, add `.not('feed_cluster_articles.articles.stories.slug', 'is', null)` filter OR in `toStory`, set `slug` to `null` and check in render — already done. The visual fix: on slug-less cards, add `cursor: 'default'` to the card container, and a subtle `opacity: 0.7` to signal non-interactivity.
- **#27 (aria-live for count):** Wrap the `{totalMatching} stories` span in `<span aria-live="polite" aria-atomic="true">`.
- **#28 (maskImage "All" clip):** Remove `maskImage` on the category chip container (or change to `linear-gradient(to right, black, black 100%, transparent)` only fading the RIGHT edge). The fade is primarily useful on the right to indicate more chips. Left edge doesn't need a fade since "All" is always first.
- **#33 (getDisplayGroup time drift):** Recompute `displayGroup` on the client at render time rather than at fetch time: update `grouped` memo to re-apply `getDisplayGroup(row.updated_at)` to each story before grouping. Since stories are already in state with their `updated_at` strings, this is a small change to the `grouped` memo.
- **#34 (StoryCard slug):** Remove slug re-derivation in `StoryCard` (line 248). Use `story.slug` directly.
- **#35 (latestHeadline sort):** `toStory` sorts articles by `a.date` (string). Change to sort by `new Date(a.date).getTime()` for correct temporal order. Since `a.date` is `YYYY-MM-DD` format, string sort is correct for day resolution — this is actually fine. Add a comment noting day-resolution sort is intentional.
- **#36 ("Earlier" cutoff):** Rename `GROUP_LABELS.earlier` from `'EARLIER'` to `'EARLIER (90 DAYS)'` OR add a footer note below the earlier section. Simpler: in `SectionHeader` for the `earlier` group only, append `· 90 day window` to the count. Owner decides — default: add to section label.

**Files touched:**
- `web/src/app/browse/page.tsx` (streams A-E)
- `web/src/app/browse/loading.tsx` (stream D)
- `web/src/app/browse/layout.tsx` (new — stream D)

**Test plan:**
- Keyboard: Tab through the page, confirm focus visible on all buttons. Open FilterSheet, confirm ESC closes it, confirm focus trapped inside.
- VoiceOver: search input announced as "Search stories and headlines, search field". Filters button announced with expanded state. Result count announces on change.
- Touch targets: all interactive elements ≥44px on mobile viewport.
- Dark mode: toggle dark mode, confirm header background, skeleton bones, tooltip, card backgrounds all adapt.
- Reduced motion: enable in OS settings, confirm no animations play.
- Filters → navigate to story → Back: confirm filters are restored from URL params.
- Share: copy URL with filters applied, paste in new tab, confirm filters match.
- Date range: set dateTo before dateFrom, confirm error shown, button disabled.
- Retry: on load error, rapid-tap Retry, confirm only one fetch in flight.
- Skeleton: hard-refresh, confirm loading.tsx and client skeleton match.
- `build/lint`: `bun --cwd web tsc` clean; no `quiz` references in dead state.

**Owner-input not needed** — DECISIONS #053 and #054 locked; all other fixes are clear.

---

---

## Slice 12 — Unit 4 / Search (`/search`) — 32 findings

**Status:** ready
**Prerequisite:** None (Search page is standalone; Slices 1+2 foundations do not block this slice).
**Elevated-care:** NO. No RBAC rename, no payments, no kid safety, no schema migration. Standard adversary pass recommended.
**Unit doc:** `UI_UX_REVIEW/A-4-search.md`
**Decisions consumed:** #022, #029, #031, #032, #043, #053, #054.

### Why two streams

Findings split cleanly across two file groups with no overlap:
- **Stream A** owns new + API files: `web/src/app/search/layout.tsx` (new) + `web/src/app/api/search/route.js`
- **Stream B** owns the page: `web/src/app/search/page.tsx`

Both streams can run in parallel. Verification pass runs after both complete.

---

### Stream A — New layout file + API route fixes

**Files:** `web/src/app/search/layout.tsx` (create), `web/src/app/api/search/route.js`

**F2 — Create `layout.tsx` with metadata:**
Create `web/src/app/search/layout.tsx`:
```tsx
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Search · Verity Post',
  description: 'Search Verity Post articles by keyword.',
  robots: { index: false, follow: false },
  openGraph: { title: 'Search · Verity Post', type: 'website' },
};
export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```
`robots: { index: false }` because search-result pages are thin-content — no permanent canonical page exists. Matches DECISION #053 pattern.

**F20 — `to` date filter drops same-day articles (`route.js:96`):**
`published_at` is `timestamptz`. A bare `YYYY-MM-DD` in `.lte()` compares against midnight UTC, silently excluding articles published that day. Fix:
```js
if (to) query = query.lte('published_at', to + 'T23:59:59.999Z');
```

**F21 — `sanitizeIlikeTerm` strips double-quotes, breaking phrase search (`route.js:22-26`):**
The advanced path uses `websearch_to_tsquery` which treats `"..."` as a phrase. Stripping `"` from `q` before passing it breaks paid users' phrase searches. The ilike path (basic/free) doesn't use `"` semantics so stripping is fine there.

Fix: separate the sanitization. Create two sanitizer variants:
```js
function sanitizeIlikeTerm(s) {
  return String(s || '').replace(/[,.%*()"\\]/g, ' ').trim();
}
function sanitizeWebsearchTerm(s) {
  // Preserve double-quotes for phrase matching; strip other PostgREST-breaking chars
  return String(s || '').replace(/[,.%*()'\\]/g, ' ').trim();
}
```
In `GET`: apply `sanitizeWebsearchTerm(q)` for the `textSearch` call on the advanced path; keep `sanitizeIlikeTerm(q)` for the `.ilike` fallback path. Also add single-quote stripping to `sanitizeIlikeTerm` since it was missing.

**F22 — Source sub-query `.in()` unbounded, can exceed URL limit (`route.js:108`):**
500 UUIDs in a PostgREST `.in()` generates a URL that can exceed nginx/PostgREST defaults. Fix: cap the lookup at 200 IDs and return a `partial_results: true` flag when truncated, OR switch the source filter to a server-side JOIN instead of two queries.

Simplest correct fix: replace the sub-query with a join via PostgREST's embedded resource syntax:
```js
// Replace the sub-query with a direct ilike join
query = query.ilike('sources.publisher', `%${source}%`);
// This requires 'sources' to be included in the select; update select to add sources(publisher)
```
But since the select chain starts before this block, the safer mechanical fix is the cap + flag:
```js
const ids = (srcArticleIds || []).map((r) => r.article_id).slice(0, 200);
if ((srcArticleIds || []).length > 200) {
  ignoredFilters.push('source_partial');
}
```
Add `source_partial` to the `ignored_filters` shape so the client can surface "Source filter matched too many articles — refine your search."

---

### Stream B — `page.tsx` fixes

**Files:** `web/src/app/search/page.tsx` only.

**F1 — `href="#"` on null slug (`page.tsx:254`):**
DECISION #022: filter at query layer. The API already only returns published articles but a story's slug could still be null. The API should filter null slugs server-side. Update the select in `route.js` to add `.not('stories.slug', 'is', null)` — but since Stream A owns route.js, Stream B handles the client-side defense:
In `runSearch`, after setting `results`, filter client-side as a belt: `setResults((data.articles || []).filter(a => a.stories?.slug));`. This is a secondary guard — the primary fix belongs in route.js. Implementer note: also ask route.js stream (A) to add `.not('stories.slug', 'is', null)` to the `.select()` query chain at route.js:46-53.
*(Coordination note: Stream A implementer adds the route-level filter; Stream B adds the client-side guard.)*

**F3 — Filter tease links to wrong URL (`page.tsx:236-237`):**
Change `<a href="/profile/settings#billing">` to `<Link href="/pricing">` with text "See plans →" per DECISION #031. Import `Link` from `next/link` (already imported at top of file).

**F4 — No URL state persistence (`page.tsx:47-51`):**
Add `useSearchParams` and `useRouter` imports. On mount, read `searchParams` to initialize `q`, `category`, `from`, `to`, `source` state. On `runSearch`, call `router.replace('/search?' + new URLSearchParams(activeParams).toString(), { scroll: false })` where `activeParams` includes non-empty values only. On filter change (onChange handlers), update URL immediately (same `router.replace` call) so Back button restores state. Include only: `q`, `cat` (mapped from `category`), `from`, `to`, `src` (mapped from `source`). Omit `subcategory` (server-side only, F28).

**F5 — `formatDate` always absolute (`page.tsx:271`):**
Replace `formatDate(a.published_at)` with a static hybrid inline:
```tsx
{a.published_at && (() => {
  const diffMs = Date.now() - new Date(a.published_at).getTime();
  return diffMs < 24 * 60 * 60 * 1000
    ? timeAgo(a.published_at)  // use existing timeAgo helper if available
    : formatDate(a.published_at);
})()}
```
Check if `timeAgo` or equivalent exists in `@/lib/dates`; use it. If only `formatDate` exists, check what browse or home uses for relative time and match. Emit static server-render-safe values: no `Date.now()` on client-only island since this page is `'use client'` — static hybrid is still correct here, just no ticking (DECISION #029 prohibits client-side ticking anyway).

**F6 — `outline: 'none'` kills all focus rings (`page.tsx:119, 150`):**
Replace `outline: 'none'` in `filterStyle` and in the search input's inline style with a custom focus ring:
```tsx
':focus-visible': { outline: '2px solid var(--accent, #111)', outlineOffset: 2 }
```
But since these are inline CSSProperties (not emotion/CSS modules), inline styles can't do `:focus-visible`. The correct fix: remove `outline: 'none'` entirely and instead add a CSS class or use a `<style>` JSX tag for focus ring customization. Simplest: replace `outline: 'none'` with `outline: 'none'` only on `:focus:not(:focus-visible)` — but inline styles can't do pseudo. **Correct fix:** Remove `outline: 'none'` from both locations. Let the browser's default focus ring show. The search page uses a rounded border already, so a browser ring is acceptable. Full custom styling can wait for the design-token pass.

**F7 — `canView` init `true` then flips (flash of UI for restricted users) (`page.tsx:42`):**
Change `useState<boolean>(true)` to `useState<boolean | null>(null)`. In the JSX, when `canView === null`, render a skeleton (a neutral loading state — e.g., the search bar + a pulse rect for the filter area). When `canView === false`, render the "unavailable" branch. When `canView === true`, render the search UI. This eliminates the flash.

**F8 — `ignored_filters` not surfaced (`page.tsx:106`):**
Update `SearchResponse` to include `ignored_filters?: string[]`. In `runSearch`, after setting `results`, check if `data.ignored_filters?.length > 0` and surface an inline note below the filter row: "Some filters were not applied: {list}. Upgrade for full access." or for partial source results: "Source filter matched too many articles — try a more specific term." Use a small `<div>` above the results list. Dismiss on next search.

**F10 — Filter inputs missing `aria-label` (`page.tsx:183, 215`):**
Add `aria-label="Filter by category"` to the `<select>`. Add `aria-label="Filter by source publisher"` to the source `<input>`.

**F11 — No `aria-live` for result count / state (`page.tsx:246-248`):**
Add `aria-live="polite" aria-atomic="true"` to the result count `<div>`. Also ensure the loading state ("Searching…") is announced. Add a visually-hidden but `aria-live="polite"` status element that announces: "Searching…" when `loading=true`, "N results found" when results land, "No results for [query]" on empty.

**F12 — No `fieldset`/`legend` on filter group (`page.tsx:173-245`):**
For the `canAdvanced` branch, wrap the filter grid in:
```tsx
<fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
  <legend style={{ fontSize: 11, color: '#999', marginBottom: 6, fontWeight: 600 }}>
    Advanced filters
  </legend>
  {/* filter controls */}
</fieldset>
```
This also handles F12 and partially F27 (fieldset visible legend acts as context label before search).

**F13 — Result count `fontSize: 11` (`page.tsx:246`):**
Change to `fontSize: 12`.

**F14 — Filter tease copy wrong for anon vs paid (`page.tsx:235-238`):**
The tease must branch on auth state per DECISION #032 + #043. Add auth state tracking:
```tsx
const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
// in useEffect after refreshAllPermissions:
const { data: { user } } = await supabase.auth.getUser();
setIsAuthed(!!user);
```
Then in the tease block:
```tsx
{isAuthed === false
  ? <>Advanced filters (date range, category, source) are available to signed-in users.{' '}<Link href="/login" style={...}>Sign in →</Link></>
  : <>Advanced filters are a Verity Plus perk.{' '}<Link href="/pricing" style={...}>See plans →</Link></>
}
```

**F15 — No loading skeleton during perm hydrate (`page.tsx:57`):**
When `canView === null` (per F7 fix), render a skeleton:
```tsx
if (canView === null) {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 16px' }}>Search</h1>
      <div style={{ height: 44, background: '#f0f0f0', borderRadius: 10, marginBottom: 16 }} />
    </div>
  );
}
```

**F16 — `canView=false` copy conflates restriction with anon (`page.tsx:123-131`):**
Apply DECISION #032 branch. Since we now have `isAuthed` state:
```tsx
{!isAuthed
  ? <p>Sign in to use search.</p>
  : <p>Search is unavailable on your account. <a href="/appeal">Contact support →</a></p>
}
```

**F17 — No `<form>` wrapper, search button no `type` (`page.tsx:138-169`):**
Wrap the search row (input + button) in `<form role="search" onSubmit={(e) => { e.preventDefault(); runSearch(); }}>`. Change the `<button>` to `type="submit"`. Remove the `onKeyDown` Enter handler from the input (the form submit handles it). This also makes Enter from any filter input inside the form trigger search — but filter inputs are outside this form, so add `onKeyDown={(e) => e.key === 'Enter' && runSearch()}` to the date and source filter inputs (F29).

**F18 — Anon "Search unavailable" if `search.articles.free` not seeded (`page.tsx:67`):**
The comment says anon users should pass the `canView` check. Verify in the anon permission set that `search.articles.free` OR `search.view` OR `search.basic` is granted. The fix belongs in the DB seed, not the component. However, the component logic should be defensive: if all three perms return false, before concluding `canView=false`, check if the user is anon and if so, default to `true` for the page gate (anon basic search is always permitted per the API's intentional anon-passthrough). Update the check:
```tsx
const user = supabase.auth.getUser();
const isAnon = !(await user).data.user;
setCanView(
  isAnon ||  // anon users always get the search page
  hasPermission('search.view') ||
  hasPermission('search.basic') ||
  hasPermission('search.articles.free')
);
```
File a follow-up note: confirm `search.articles.free` is in the `anon` permission set via MCP before ship (check `permission_set_items` where `set_name = 'anon'`).

**F19 — No AbortController: concurrent searches race (`page.tsx:100`):**
Add an abort controller ref:
```tsx
const abortRef = useRef<AbortController | null>(null);
```
In `runSearch`, at start: `abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller;`. Pass `{ signal: controller.signal }` to `fetch`. On catch, check `if (e instanceof DOMException && e.name === 'AbortError') return;` to skip setting error state for intentional aborts.

**F23 — `runSearch` doesn't clear stale results on empty `q` (`page.tsx:89`):**
Before the `if (!q.trim()) return;` guard, add `setResults([]);` and `setError('');` so clearing the input and pressing Enter/Submit clears the previous results. Change the guard to:
```tsx
if (!q.trim()) { setResults([]); return; }
```

**F24 — Stale results persist on error + stale count (`page.tsx:91`):**
At the start of `runSearch` (after the empty-q guard), add `setResults([]);` to clear before each new search. The result count will naturally clear since it's derived from `results.length`. The error state is already cleared at start (`setError('')`).

**F25 — Disabled button missing `aria-disabled` (`page.tsx:154`):**
Add `aria-disabled={!q.trim() || loading}` to the `<button>`.

**F26 — `aria-label` mismatch on Browse button (`page.tsx:287`):**
Change `aria-label="Browse all categories"` to `aria-label="Browse categories"` (match visible text).

**F27 — Filter tease shown before any search attempted (`page.tsx:223`):**
Show the tease only after the user has interacted (either typed something or the upgrade state is relevant). Add state: `const [hasInteracted, setHasInteracted] = useState(false);`. On `setQ` change, set `setHasInteracted(true)`. In the tease render, add `{!canAdvanced && hasInteracted && <div>...tease...</div>}`. This prevents the upsell from being the first thing a user sees. Exception: if they arrive via URL with `?q=` params (from URL persistence), treat that as having interacted.

**F29 — Enter key not wired on filter inputs (`page.tsx:197-220`):**
Add `onKeyDown={(e) => e.key === 'Enter' && runSearch()}` to:
- From date input (line ~197)
- To date input (line ~205)
- Source publisher input (line ~215)

**F30 — Pre-search blank state (`page.tsx:277`):**
The zero-results block only renders when `q` is truthy and results are empty. Add a pre-search state above the results list, visible when `!q && !loading`:
```tsx
{!q && !loading && (
  <div style={{ padding: '32px 0', textAlign: 'center', color: '#666', fontSize: 13 }}>
    Search Verity Post articles by keyword.
  </div>
)}
```

**F31 — Date range: no `from ≤ to` validation (`page.tsx:197`):**
Add validation in `runSearch` before the fetch:
```tsx
if (from && to && from > to) {
  setError('End date must be after start date.');
  setLoading(false);
  return;
}
```
Also add client-side constraint: set `min={from}` on the `to` date input so the browser picker prevents inverted selection.

**Deferred (no fix needed this slice):**
- F28: Subcategory client UI is a future slice; server-side support already exists. Log as out-of-scope enhancement.
- F32: `?kids=1` scope — web search doesn't serve kid-profile accounts; flag as a future access-control check if kid accounts can reach `/search`.

---

### Verification pass (after both streams)

- **Slug filter:** Search a query, inspect results — no `href="#"` links in DOM.
- **Metadata:** `curl -s localhost:3000/search | grep 'og:title'` → "Search · Verity Post".
- **URL persistence:** Search "climate", apply category filter. Copy URL, open in new tab — same results appear.
- **Pricing link:** Inspect filter tease link — href is `/pricing` not `/profile/settings`.
- **Timestamps:** Search yields articles both <24h and older. Check that recent articles show "Xm ago" and older show "May 2" format.
- **Focus rings:** Tab through search input, date inputs, source input, submit button — all show visible focus ring.
- **Mobile keyboard:** On a mobile viewport, focus the source input, press the Go key — confirm search fires.
- **Abort race:** Type "a", click Search, immediately type "b", click Search. Confirm only the "b" results display (no flash of "a" results).
- **Date range:** Set from=2025-01-01, to=2024-01-01, press Search — error message appears, no fetch.
- **Same-day articles:** In test data, publish an article today. Search for it with `to=today's date`. Confirm it appears.
- **Phrase search (paid user):** Log in as Verity Plus user. Search `"climate change"` (with quotes). Confirm results are phrase-matched, not single-term.
- **`tsc` clean:** `bun --cwd web tsc` exits 0.
- **`ignored_filters` display:** With a paid user in basic mode (manually downgrade perm in dev), pass `?source=reuters` via URL — confirm the UI surfaces "Some filters were not applied."

---

---

## Slice 13 — Unit 5 / Category (`/category/[id]`) — 37 findings

**Status:** ready to build
**Prerequisite:** Slices 1 + 2 done (both shipped 2026-05-02).
**Elevated-care:** NO. No RBAC rename, no payments, no kid-safety, no schema migration. Standard adversary pass recommended.
**Unit doc:** `UI_UX_REVIEW/A-5-category.md`
**Decisions consumed:** #022, #029, #043, #053, #055, #056.

### Why two streams

Split on the layout file boundary — zero file overlap:
- **Stream A** owns: `web/src/app/category/[id]/layout.tsx` (rename from layout.js; new `generateMetadata`) + data-layer fixes in `page.js`
- **Stream B** owns: `web/src/app/category/[id]/page.js` — all interaction, accessibility, and UX fixes

Both streams can run in parallel. Verification pass runs after both complete.

---

### Stream A — Layout + data layer (`layout.tsx` + data fixes in `page.js`)

**Files:** `web/src/app/category/[id]/layout.tsx` (rename + rewrite of layout.js), `web/src/app/category/[id]/page.js` (data-layer lines only)

**F12 / DECISION #056 — Dynamic metadata (`layout.js` → `layout.tsx`):**
Convert to a server component with `generateMetadata`:
```tsx
import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient();
  let { data } = await supabase.from('categories').select('name, description').eq('id', params.id).single();
  if (!data) {
    const { data: bySlug } = await supabase.from('categories').select('name, description').eq('slug', params.id).single();
    data = bySlug;
  }
  const name = data?.name ?? 'Category';
  const description = data?.description ?? `Browse ${name} news on Verity Post.`;
  return {
    title: `${name} · Verity Post`,
    description,
    openGraph: { title: `${name} · Verity Post` },
    // robots: index/follow — category pages are canonical linkable surfaces
  };
}

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```
Delete `layout.js` after creating `layout.tsx`.

**F3 — Stale state on id change (`page.js:31`):**
At the very start of `fetchData`, before any awaits, reset both category and stories:
```js
setCategory(null);
setStories([]);
setActiveSubcat(null);
setSubcategories([]);
```

**F6 — No try/catch in `fetchData` (`page.js:30`):**
Wrap the entire `fetchData` body in `try { ... } catch (err) { setError('Could not load category. Please try again.'); } finally { setLoading(false); }`. Add `const [error, setError] = useState(null)` state, and render the error state before the not-found check.

**F7 — `supabase.auth.getUser()` crash (`page.js:79`):**
```js
const { data: authData, error: authErr } = await supabase.auth.getUser();
const authUser = authErr ? null : authData?.user ?? null;
```

**F8 — Soft-deleted articles (`page.js:71`):**
Add `.is('deleted_at', null)` to the articles query:
```js
const { data: storiesData } = await supabase
  .from('articles')
  .select('*, stories(slug)')
  .eq('category_id', categoryData.id)
  .eq('status', 'published')
  .eq('visibility', 'public')
  .is('deleted_at', null)
  .limit(100);
```

**F9 — Inactive categories (`page.js:36`):**
Add `.eq('is_active', true)` to both category lookup branches (UUID and slug fallback).

**F10 — Unbounded fetch (`page.js:71`):**
Already handled by `.limit(100)` in F8 recipe above. For the bookmark `.in()` call, cap the IDs: `const ids = articles.map(a => a.id).slice(0, 100)` (already at most 100 from the limit).

**F2 — `href="#"` null-slug cards (`page.js:71`):**
Add `.not('stories.slug', 'is', null)` to the articles select OR filter client-side after the fetch:
```js
const articles = (storiesData ?? []).filter(a => a.stories?.slug);
```
Both guards: server-side filter in the query (preferred) AND client-side filter as belt-and-suspenders.

**F5 — Fetch errors swallowed (`page.js:63-88`):**
Check each query's `error` return:
- Subcategories: `const { data: subcatData, error: subcatErr } = ...` — if `subcatErr`, log to console but proceed (non-blocking; filter strip just won't show).
- Articles: `const { data: storiesData, error: storiesErr } = ...` — if `storiesErr`, `setError('Could not load articles.')` and return early.
- Bookmarks: `const { data: bms, error: bmsErr } = ...` — if `bmsErr`, proceed without bookmark state (non-blocking; save button still works; user sees un-bookmarked state).

**F22 / DECISION #029 — Hybrid timestamps (`page.js:494`):**
```js
import { timeAgo, formatDate } from '../../../lib/dates';

function hybridDate(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  return diff < 24 * 60 * 60 * 1000 ? timeAgo(ts) : formatDate(ts);
}
```
Replace `{formatDate(story.published_at)}` with `{hybridDate(story.published_at)}`.

**F32 — `formatDate(null)` empty span (`page.js:494`):**
Handled by `hybridDate` above which returns `''` for null — wrap the span: `{story.published_at && <span style={...}>{hybridDate(story.published_at)}</span>}`.

---

### Stream B — `page.js` interaction + accessibility + UX fixes

**Files:** `web/src/app/category/[id]/page.js` only.

**F1 — Button nested in `<a>` (`page.js:522`):**
The `<a>` card wrapper and the bookmark `<button>` cannot nest. Fix: make the card container `position: relative`. The `<a>` covers the full card (styled absolutely or as the block container). The bookmark button sits outside the `<a>` with `position: absolute; right: 12px; bottom: 12px; z-index: 1`. Pattern:
```tsx
<div style={{ position: 'relative', background: '#f7f7f7', ... }}>
  <a href={...} style={{ display: 'block', ... }}>
    {/* all card content except bookmark button */}
  </a>
  <button
    onClick={(e) => { e.stopPropagation(); toggleBookmark(story.id); }}
    aria-label={...}
    style={{ position: 'absolute', right: 12, bottom: 12 }}
  >
    {story.bookmarked ? 'Saved' : 'Save'}
  </button>
</div>
```

**F4 — Anon bookmark → registration wall (`page.js:110`):**
Check auth state before the API call. The `authUser` is already available in component state via the fetch flow — add `const [currentUser, setCurrentUser] = useState(null)` and set it in `fetchData` alongside the bookmark fetch. In `toggleBookmark`:
```js
if (!currentUser) {
  // fire registration wall (per Slice 6 / DECISION #043)
  setShowRegistrationWall(true);
  return;
}
```
If the registration wall component (`RegistrationWall`) from Slice 6 is available, import and use it; otherwise, navigate to `/login?return=/category/${id}`.

**F13 — Sort buttons `aria-pressed` (`page.js:364`):**
Add `aria-pressed={sort === s}` to each sort button.

**F14 — Subcategory buttons `aria-pressed` (`page.js:387`):**
Add `aria-pressed={activeSubcat === null}` to "All" button. Add `aria-pressed={activeSubcat === sc.id}` to each subcategory button.

**F15 — No `<main>` landmark (`page.js:261`):**
Wrap the main content area (below the header) in `<main>`. The category header can stay outside or inside — put both inside:
```tsx
<main>
  {/* Category Header */}
  {/* Sort + Subcategory + Articles + Load more */}
</main>
```

**F16 — Toast no `aria-live` (`page.js:271`):**
Add `role="status" aria-live="polite" aria-atomic="true"` to the toast `<div>`.

**F17 — Loading skeleton no `role="status"` (`page.js:156`):**
Add a visually-hidden status element:
```tsx
<div role="status" aria-live="polite" className="sr-only">Loading category...</div>
```
above the skeleton divs. Requires `sr-only` CSS class (add to globals.css if not present: `.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }`).

**F18 — "Load more" count not announced (`page.js:563`):**
Add an `aria-live="polite"` counter that updates with `visibleCount`:
```tsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  Showing {Math.min(visibleCount, sorted.length)} of {sorted.length} articles
</div>
```
Place above the article list so it's in the DOM tree consistently.

**F19 — Subcategory filtered-empty not announced (`page.js:550`):**
Add `role="status" aria-live="polite"` to the "No articles in this subcategory yet." container.

**F20 — Touch targets < 44px (multiple):**
- Sort buttons: add `style={{ ..., minHeight: 44 }}` (keep existing padding, add minHeight).
- Subcategory buttons: same `minHeight: 44`.
- Bookmark button: change `padding: '2px 8px'` to `padding: '8px 12px'`.
- "Back to browse" link: add `padding: '8px 0'`.
- "Load more" button: change `padding: '13px'` to `padding: '14px'` (≥44px with standard line height).

**F21 — Category badge contrast (`page.js:482`):**
Change `color: '#0369a1'` to `color: '#025a8e'` (darkened to achieve ≥4.5:1 on `#e0f2fe` background).

**F23 — `visibleCount` not reset on sort change (`page.js:364`):**
```js
<button key={s} onClick={() => { setSort(s); setVisibleCount(5); }} ...>
```

**F24 — Sort/subcat groups no `role="group"` (`page.js:363`):**
```tsx
<div role="group" aria-label="Sort by" style={{ display: 'flex', gap: 8, ... }}>
  {SORT_OPTIONS.map(...)}
</div>
{subcategories.length > 0 && (
  <div role="group" aria-label="Filter by topic" style={{ display: 'flex', gap: 8, ... }}>
    <button>All</button>
    {subcategories.map(...)}
  </div>
)}
```

**F25 — Category letter-avatar not `aria-hidden` (`page.js:318`):**
Add `aria-hidden="true"` to the icon `<div>`.

**F26 — Empty state condition wrong (`page.js:427`):**
Change condition from `{stories.length === 0 && (...)}` to:
```tsx
{stories.length === 0 && !loading && (
  <div style={{ ... }}>
    <div>No articles in this category yet.</div>
    <div>Check back soon, or <Link href="/">browse the home feed</Link>.</div>
  </div>
)}
```
The subcategory filtered-empty remains as a separate check (since `stories` is non-empty, the subcategory-filtered state needs its own path). Add a styled card treatment to the subcategory-empty state at line 550 matching the category-empty card (background, border, radius).

**F27 — `category.description` null empty `<p>` (`page.js:348`):**
```tsx
{category.description && (
  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666666', lineHeight: 1.5 }}>
    {category.description}
  </p>
)}
```

**F28 — Toast timer race (`page.js:120, 139`):**
```js
const toastTimerRef = useRef(null);
const showToast = (msg) => {
  clearTimeout(toastTimerRef.current);
  setToast(msg);
  toastTimerRef.current = setTimeout(() => setToast(''), 2400);
};
```
Replace direct `setToast(...)` + `setTimeout` calls with `showToast(...)`.

**F29 — Excerpt `'...'` always appended (`page.js:519`):**
```tsx
{story.excerpt
  ? story.excerpt.length > 60
    ? story.excerpt.slice(0, 60) + '…'
    : story.excerpt
  : ''}
```

**F30 — Category name badge no overflow (`page.js:481`):**
Add `maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` to the badge span.

**F31 — No bookmark in-flight state (`page.js:110`):**
Add `const [bookmarkingId, setBookmarkingId] = useState(null)`. At start of `toggleBookmark`: `setBookmarkingId(storyId)`. In finally: `setBookmarkingId(null)`. In the button render: `disabled={bookmarkingId === story.id}`, label: `bookmarkingId === story.id ? '…' : story.bookmarked ? 'Saved' : 'Save'`.

**F33 — In-feed ad placement off-by-one (`page.js:454`):**
Move the `<Ad>` element to after the `<a>` card within the Fragment:
```tsx
<React.Fragment key={story.id}>
  <a href={...}>{/* card */}</a>
  {idx === 3 && <Ad placement="category_in_feed_1" page="category" position="in_feed_1" />}
</React.Fragment>
```
`idx === 3` = after the 4th card (0-indexed), placing the ad between card 4 and card 5.

**F34 — Kids-category copy (`page.js:56`):**
```js
if (typeof categoryData.slug === 'string' && categoryData.slug.startsWith('kids-')) {
  setKidsCategoryBlocked(true);  // new state flag
  setLoading(false);
  return;
}
```
Add `const [kidsCategoryBlocked, setKidsCategoryBlocked] = useState(false)`. In the render, before `if (!category)`:
```tsx
if (kidsCategoryBlocked) {
  return (
    <div style={{ /* same container as not-found */ }}>
      <h1>This is a kids category</h1>
      <p>Browse it in the Verity Post Kids app.</p>
      <a href="/browse">Browse all categories</a>
    </div>
  );
}
```

**F35 / DECISION #055 — URL state for sort + subcat (`page.js:364`):**
Add `useSearchParams` and `useRouter` imports. On mount, initialize `sort` from `searchParams.get('sort') ?? 'Latest'` and `activeSubcat` from `searchParams.get('sub') ?? null` (if `sub` UUID not in loaded subcategories list, default to null). On sort/subcat change, call `router.replace(\`/category/${id}?${buildParams()}\`, { scroll: false })` where `buildParams` serializes non-default sort and active subcat. `visibleCount` is not persisted.

**F36 — `<a>` not `<Link>` (`page.js:457`):**
Import `Link` from `next/link`. Replace:
- Article card `<a href={story.stories?.slug ? ...}>` → `<Link href={...}>`
- "Back to browse" `<a href="/browse">` → `<Link href="/browse">`
- "browse the home feed" `<a href="/">` → `<Link href="/">`
- "Browse all categories" in not-found `<a href="/browse">` → `<Link href="/browse">`

**F37 — No `<nav>` landmark for breadcrumb (`page.js:301`):**
```tsx
<nav aria-label="Breadcrumb">
  <Link href="/browse" style={{ ... }}>Back to browse</Link>
</nav>
```

---

### Verification pass (after both streams)

- **Static metadata:** `curl -s localhost:3000/category/<id> | grep 'og:title'` → shows actual category name.
- **Stale content:** Navigate `/category/A`, then `/category/B` — confirm skeleton shows, no flash of A's header.
- **Not-found state:** Navigate `/category/does-not-exist` — "Category not found" screen, not stale content.
- **Kids category:** Navigate `/category/kids-science` (or any `kids-*` slug) → differentiated copy.
- **Null-slug cards:** Confirm no `href="#"` links in DOM via devtools.
- **Soft-deleted articles:** (Skip if no test data; note in verification log.)
- **Inactive category:** Navigate to an inactive category slug — should show not-found.
- **Hybrid timestamp:** Confirm recently-published article shows relative time ("2h ago"), older shows absolute.
- **Sort reset:** Scroll "Load more" to 8 items, switch sort — confirm back to 5.
- **URL persistence:** Apply sort + subcategory filter, copy URL, open in new tab — same filters applied.
- **Anon bookmark:** Without logging in, click Save — registration wall fires (or sign-in redirect).
- **Bookmark in-flight:** Click Save on slow connection — button shows "…", disabled.
- **Toast a11y:** With VoiceOver on, trigger a bookmark error — toast is announced.
- **Focus rings:** Tab through sort/subcat/bookmark/back buttons — all visible.
- **Touch targets:** On mobile viewport, sort/subcat buttons visually ≥44px tall.
- **`tsc` clean:** `bun --cwd web tsc` exits 0.

---

**Owner-input not needed** — all decisions locked (#055 and #056 auto-locked above; all other fixes reference existing decisions).

**Future Wave A unit-fix slices (added when their reviews complete):**

| Slice # | Surface | Added when |
|---|---|---|
| Slice 12 | Unit 4 / Search (`/search`) | Unit 4 review concludes |
| Slice 13 | Unit 5 / Category (`/category/[id]`) | Unit 5 review concludes |
| Slice 14 | Unit 6 / Leaderboard (`/leaderboard`) | Unit 6 review concludes |
| Slice 15 | Unit 7 / Public profile chrome (kill-switched) | Unit 7 review concludes |
| Slice 16 | Unit 8 / Marketing bundle | Unit 8 review concludes |
| Slice 17 | Unit 9 / Legal/info sweep | Unit 9 review concludes |
| Slice 18 | Unit 10 / Auth flow | Unit 10 review concludes |
| Slice 19 | Unit 11 / Logout | Unit 11 review concludes |

Note: numbering is contiguous; sub-slice splits (like Slice 4 + 5 for Unit 2) only happen for big unit fixes and are noted at slice-creation time.

**Total Wave A session estimate so far:** ~17–20 sessions for the 10 locked slices above. Will grow as Slices 11–19 reviews surface their fix scope. Owner cadence sets actual wall time.

---

## Slice 14 — Unit 6 / Leaderboard (46 findings)

**Status:** ready to build
**Prerequisite:** Slices 1 + 2 done (both shipped 2026-05-02).
**Elevated-care:** YES — F01 (unverified user receives 50-row data response), F02 (gated rank information exposed), F03 (rank card + sticky bar render for non-`fullAccess` users). Adversary pass mandatory.

**Decisions consumed:** #057 (no credential badges on leaderboard rows), #058 (URL state for leaderboard), PRINCIPLE §1.1 (dark mode), §2.1 (44px touch targets), §3.1-3.3 (states), §6 (a11y)

**Scope summary (46 findings organized into 4 streams):**

### Stream A — Security / Data gate (F01–F14, F18) — Elevated-care

- **F01:** Change `pageLimit = me ? 50 : 3` → `pageLimit = fullAccess ? 50 : 3` at `page.tsx:320`. Unverified-auth users now receive 3-row responses, same as anon.
- **F02:** Anon blur wall: (a) always show a sign-up CTA block for `!me` users regardless of `visibleUsers.length`; (b) optionally fetch one extra row (`pageLimit = 4`) for anon so the blur renders with visual "more exists" signal. Simplest fix: extract the blur+CTA block into its own `{!me && (<AnonGate />)}` component rendered unconditionally below the 3-row list.
- **F03:** Gate "Your rank" card (line 398) and sticky bar (line 861) on `fullAccess`, not just `me`. Both hidden for unverified users (they don't have `leaderboard.view`).
- **F04:** Add `activeTab === 'Top Verifiers'` guard to category pills container (line 502). On tab switch to Rising Stars: `setActiveCat(null); setActiveSub(null)`.
- **F05:** Replace both blur-wall gradients (lines 679 + 799) with `linear-gradient(to bottom, rgba(var(--bg-rgb), 0.3), rgba(var(--bg-rgb), 0.95) 70%)` using a CSS variable `--bg-rgb` added to `globals.css`. If `--bg-rgb` not viable: use `var(--bg)` as a solid background-color on a semi-transparent overlay div.
- **F06:** Verify `rankAccentColor` hex values against `var(--card)` dark bg. Expected: #B8860B (gold) and #92400E (bronze) are both dark and will fail on a dark card. Replace with lighter tints or add a `data-mode` variant: `--rank-gold`, `--rank-silver`, `--rank-bronze` tokens in `globals.css` with dark-mode overrides.
- **F07:** Add `.is('users.deletion_scheduled_for', null)` to the category-scores query join filter at `page.tsx:201`.
- **F08:** Wire URL params per DECISION #058 — `router.replace` on state changes; `useSearchParams()` on mount. Param keys: `tab` (`top`/`rising`), `period` (`week`/`month`/`year`/`all`), `cat` (UUID). Replace `useState` initializers with URL-param reads.
- **F09:** (a) Wrap tab `<div>` at line 438 in `<div role="tablist" aria-label="Leaderboard views">`; add `role="tab"` + `aria-selected={activeTab === t}` to each tab `<button>`. (b) Add `aria-pressed={period === p}` to each period pill button.
- **F10:** Add one-line context for anon above the 3-row list: `<p style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 12 }}>Top readers by Verity Score — sign in to see the full ranking.</p>` shown only when `!me`.
- **F11:** Create `web/src/app/leaderboard/error.tsx` — standard Next.js error boundary with "Something went wrong" copy + retry button. Wrap `refreshAllPermissions()` call in the init effect in a `try/catch`.
- **F12:** Add a "Try again" `<button>` inside the `resendState === 'error'` branch that calls `setResendState('idle')`.
- **F13:** Add `AbortController` to the data-load `useEffect`: create at top of `load()`, pass `{ signal: controller.signal }` to Supabase queries (or check `!controller.signal.aborted` before each `setUsers`/`setLoading` call), return `() => controller.abort()`.
- **F14:** Add `|| !me` to the `periodCutoff` condition: `if (activeTab === 'Top Verifiers' && period !== 'All time' && me && fullAccess)`. Ensures anon and unverified users always hit the default path regardless of `period` state.
- **F18:** Add `is_banned, frozen_at` to the me-row SELECT at `page.tsx:167`. Hide "Your rank" card and sticky bar if `me.is_banned || me.frozen_at`.

### Stream B — iOS parity (F39–F44)

- **F39 (Weekly tab):** Web is source of truth. Remove `TabKey.weekly` from `LeaderboardView.swift` OR add a "This week" period filter to align with web's period-picker model. No Slice 14 blocker — treated as parity polish.
- **F40:** Mirror the bidirectional block-list fetch from web `page.tsx:175-185` into `LeaderboardView.swift`. Query `blocked_users`, build `blockedIds`, filter before display.
- **F41:** Closed without code change — DECISION #057 (Option C) means web removes `VerifiedBadge` from `LeaderRow`; iOS already omits `is_expert` from `USER_COLUMNS`. No iOS change needed.
- **F42:** Align permission key — either add `leaderboard.filter.time` guard to web period filter (preferred: parity with iOS), or remove the separate iOS key and rely on `leaderboard.view` alone.
- **F43:** Add `deletion_scheduled_for IS NULL` filter to `loadRisingStars` in `LeaderboardView.swift`.
- **F44:** Fix iOS retry: use a `@State var reloadToken: UUID` as the `.task(id:)` trigger; reset on retry.

### Stream C — UX / state / copy (F15–F17, F19–F38, F45–F46)

- **F15:** Add `.eq('show_on_leaderboard', true)` to the period-RPC re-fetch at `page.tsx:307`.
- **F16:** Add `, id: 'asc'` to the `.order('verity_score', ...)` call at line 332 as a stable tiebreaker.
- **F17:** Compute `myRank` from the unfiltered `users` array (pre-block), not `visibleUsers`. Apply block filter only to the rendered list.
- **F19:** Add `displayMetric` derived from `activeTab` + `period`: for period paths use `me.quizzes_completed_count` or better, re-fetch the viewer's reads count. Simplest: show `displayScore` (which already carries the correct ranked metric) rather than hardcoded `verity_score` in the rank card and sticky bar.
- **F20:** When `activeCat` is set, show a static `"(All time)"` tag beside or in place of the period picker.
- **F21:** Replace the "Loading..." text (line 566) with 5 skeleton `<LeaderRow>` placeholders matching real row height.
- **F22:** Branch empty-state copy by `activeTab` — Rising Stars: "No new accounts in the past 30 days."
- **F23:** Fix anon blur copy (line 693): "Verify your email to see the full ranking." → actually this fires only for anon. Keep as-is for anon ("Free account unlocks ranks beyond top 3"). The confusion is that anon reads it but the gate is email verification — update to clarify: "Sign up and verify your email to see the full ranking."
- **F24:** Change "Verify email" → "Resend verification link" at `page.tsx:847`.
- **F25:** Add a `meLoaded` ref to defer the initial data load until the auth effect completes and sets `me`. Pattern: `useRef(false)` → set true in auth effect → `if (!meLoaded.current) return` at load effect top on first render.
- **F26:** Remove `activeSub` from the empty-state condition (line 581) and the active-styling check. Keep `setActiveSub(null)` calls for future compatibility but stop using `activeSub` in any conditional render until subcategory queries are wired.
- **F27:** Remove the `refreshIfStale()` call at line 159. `refreshAllPermissions()` alone is sufficient.
- **F28:** Add viewer self-highlight to `LeaderRow`: if `u.id === me?.id`, add `background: 'var(--accent-subtle)'` to the row div and a small "You" `<span>` beside the username.
- **F29:** Suppress the "Your rank" card when `activeTab === 'Rising Stars'` and viewer is not in the Rising Stars list.
- **F30:** Add `<h2 className="sr-only">{activeTab === 'Rising Stars' ? 'Rising Stars' : 'Top Verifiers'}</h2>` before the list container; add `<h2 className="sr-only">Your ranking</h2>` before the rank card.
- **F31:** Replace `color: '#111'` at line 575 with `var(--text-primary)`. Replace `background: '#111', color: '#fff'` at lines 590-591 with `background: 'var(--accent)', color: 'var(--bg)'`.
- **F32:** Replace `rgba(0,0,0,0.08)` active-tab background (line 460) with a token: add `--tab-active-bg` to `globals.css` with light/dark values.
- **F33:** Remove `email_verified` and `plan_status` from the me-row SELECT at line 168. Update `MeRow` type to omit these fields.
- **F34:** Change period pill `minHeight` from 36 to 44 at `page.tsx:490`.
- **F35:** Change `var(--right)` → `var(--p-verified)` in `VerifiedBadge.tsx:23`.
- **F36:** Fix `stripKidsTag` regex: change `^kids?\s+` → `^Kids\s+` (capital K, no `?`) or add explicit `'Kids '` prefix check.
- **F37:** Add `openGraph` and `twitter` metadata to `layout.js`.
- **F38:** Rename `layout.js` → `layout.tsx`; add `import type { Metadata } from 'next'` and type the export.
- **F45:** Fix `isLast` off-by-one: change `i === visibleUsers.length - 4 - 1` → `i === visibleUsers.length - 4` at line 741.
- **F46:** Fix `Avatar.tsx:46` initials truncation: `raw.slice(0, 3)` → `Array.from(raw).slice(0, 3).join('')`.

**Also — DECISION #057 fix (F41 on web side):**
- Remove `<VerifiedBadge user={u} />` from `LeaderRow` at `page.tsx:973`.
- Remove `is_verified_public_figure` and `is_expert` from `LeaderUser` Pick if only `VerifiedBadge` consumed them.
- Verify the `users` query select for `LeaderUser` fields drops these columns.

### Stream D — Metadata / layout (F37–F38)
*(rolled into Stream C above; no separate stream needed — 2 files only)*

---

### File ownership

| Stream | Files |
|--------|-------|
| A | `web/src/app/leaderboard/page.tsx` (data/gate changes) |
| B | `VerityPost/VerityPost/LeaderboardView.swift` |
| C | `web/src/app/leaderboard/page.tsx` (UX/copy/state), `web/src/components/Avatar.tsx`, `web/src/components/VerifiedBadge.tsx`, `web/globals.css` (new CSS vars) |
| D | `web/src/app/leaderboard/layout.js` → `layout.tsx` |

Streams A + C both touch `page.tsx` — run sequentially or split by line range (A owns lines 1–400 + query logic; C owns line 400+ + render tree). Streams B + D are independent and can run in parallel with A/C.

### Test plan

1. **Anon:** visit `/leaderboard` — see 3 rows, see sign-up CTA below row 3, no blur wall (or blur wall with CTA visible).
2. **Unverified auth:** sign in without verifying — 3 rows only, no rank card, no sticky bar, verify-email upsell visible, "Resend verification link" button works.
3. **Verified free (has `leaderboard.view`, no `leaderboard.category.view`):** full list, rank card + sticky bar, period picker visible, no category pills.
4. **Verified paid (has both):** category pills visible, pick a category, see category scores, period picker hides, "(All time)" label shows.
5. **URL persistence:** select Rising Stars, navigate to an article, press Back — Rising Stars still selected. Pick a category, share URL, open in incognito — category pre-selected.
6. **Race condition:** click 3 different categories rapidly — final state matches last clicked, no stale data.
7. **Dark mode:** check blur overlays, active-tab indicator, empty-state button — all readable.
8. **WCAG:** tab and period pills announce correct state via screen reader.
9. **iOS (F40, F43, F44):** blocked users absent, deleted-scheduled absent from Rising Stars, retry works.

**Slice ready-state:** every locked slice has decisions confirmed, file paths cited, test plans defined. None block on owner judgment except the small per-slice items called out. Slice 3 (Home) is a placeholder — fix recipes populated when the slice opens.
