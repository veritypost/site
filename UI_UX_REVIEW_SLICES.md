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
| Slice 4 — Unit 2 / Article reader / Layout | Unit fix | not started | 1 + 2 | #008 / #009 / #011 | 2 |
| Slice 5 — Unit 2 / Article reader / Cleanup (126 findings) | Unit fix | not started | 1 + 2 + 4 | #030–#039 | 4 (4-stream parallel) + 1 verification |
| Slice 6 — Registration wall | Cross-cutting | not started | 1 + 2 (4 optional) | #043 | 2 |
| Slice 7 — Admin ad system completion | Cross-cutting | not started | 2 + 4 | #044 + #041 / #042 / #045 | 4 (steps in parallel where possible) + 1 verification |
| Slice 8 — iOS CSAM-trio bridge | Cross-cutting | not started | — | #047 | 1 |
| Slice 9 — Cross-platform parity bridges | Cross-cutting | not started | 4 | Q7 | 2-3 |
| Slice 10 — Wave A verification sweep | Verification | not started | all Wave A unit-fix slices | — | 1 |

**Future Wave A unit-fix slices (added when their reviews complete):**

| Slice # | Surface | Added when |
|---|---|---|
| Slice 11 | Unit 3 / Browse (`/browse`) | Unit 3 review concludes |
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

**Slice ready-state:** every locked slice has decisions confirmed, file paths cited, test plans defined. None block on owner judgment except the small per-slice items called out. Slice 3 (Home) is a placeholder — fix recipes populated when the slice opens.
