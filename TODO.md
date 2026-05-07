# TODO

---

## URL restructure — /{category}/{slug}

- 44: Change article URLs from `/{slug}` to `/{category-slug}/{story-slug}` (e.g. `/politics/us-tariffs-2026`). Complexity 4/5 — do as a dedicated session.

  **What's already in place (don't rebuild):**
  - `categories.slug` is non-null in DB, already fetched by `[slug]/page.tsx` on every load
  - Story slug is globally unique — category segment is SEO-only; server resolves by slug alone
  - `/story/{slug}` redirect already exists (`web/src/app/story/[slug]/page.tsx`) — same pattern needed for old `/{slug}` URLs

  **Implementation sequence:**
  1. **NavWrapper blocker first** — `NavWrapper.tsx` detects article pages via `pathname.startsWith('/story')` to suppress bottom nav/footer. Must replace with a layout-level signal (e.g. `<html data-page="article">` in the article layout, or maintain a known list of non-article top-level segments) before any URL changes ship.
  2. Create new route `web/src/app/[category]/[slug]/page.tsx` — copy of current `[slug]/page.tsx` with `params: { category: string; slug: string }`, resolves by `slug` only (category segment validated but not used for lookup).
  3. Keep `web/src/app/[slug]/page.tsx` as redirect-only: resolves slug → joins category → 301s to `/{category}/{slug}`.
  4. Update all 13 link-construction sites (each needs category slug alongside story slug — requires upstream query changes):
     - `_HomeBreakingStrip.tsx:91`, `_HomeSectionsMenu.tsx:528`, `page.tsx:609+836`, `signup/_FeaturedArticle.tsx:236`, `admin/newsroom/_components/ArticlesTable.tsx:460`, `search/page.tsx:414`, `bookmarks/page.tsx:617`, `profile/_sections/BookmarksSection.tsx:129`, `profile/_sections/ActivitySection.tsx:278`, `following/page.tsx:179`, `NextStoryFooter.tsx:36`, `article/UpNextSheet.tsx:139`, internal `redirect()` calls in `[slug]/page.tsx:138+254`
  5. Update `web/src/app/sitemap.js` — extend article query to join `categories(slug)`, update URL construction.
  6. Update `generateMetadata` in new route file — `params` type changes.
  7. Clean up `web/src/app/story/[slug]/layout.js` — currently emits its own OG metadata with canonical pointing at `/story/{slug}` instead of deferring to the destination. Fix canonical to point at `/{category}/{slug}`.

  **iOS:** No changes needed if `/story/{slug}` redirect stays alive. iOS share URL is `veritypost.com/story/{slug}` which redirects through. No AASA update, no App Store review.

  **API:** `web/src/app/api/articles/by-slug/[slug]/route.ts` takes slug as URL param — keep as-is (internal API, not public-facing).

---

## Comment voice model — Real-world Experience lines + kill expert queue

- 50: **Real-world Experience comment lines + kill the Ask-an-Expert queue.** Replace the existing single-claimer "Ask an Expert" queue with a flat comment surface where every commenter can optionally write a one-line self-described context, rendered as em-dash byline below their comment. NO checkmarks, NO badges, NO tier coloring — every commenter looks visually identical regardless of verification. Verified contributors get two non-chrome capabilities: citations (link to a source) and Responses (longer-form contribution rendered in a sidebar next to the article body, not in the comment column). Complexity 4/5 — dedicated multi-session work. Cross-platform: web + iOS adult. Kids: n/a (`kid_expert_sessions` unchanged).

  **PIECE B SHIPPED 2026-05-07** (commit `8110a917`) — firsthand context on individual comments. `comments.real_world_experience text` (≤80 char CHECK); `post_comment` RPC extended with `p_real_world_experience` (old 5-arg overload dropped). Web composer: italic-serif "I know this firsthand" toggle + `How do you know?` 80-char input that pre-fills from `users.background_oneline`. Em-dash byline render below comment body on web + iOS. iOS Models extended; SELECTs updated.

  **PIECE A SHIPPED 2026-05-07** (commit `8110a917`) — profile background system. 7 new `users.background_*` columns + `user_education` / `user_links` / `user_topics_known` tables with RLS gating SELECT on `profile_visibility`. `update_own_profile` extended to allowlist new fields; new `set_own_education`, `set_own_links`, `set_own_topics_known` replace-set RPCs. `public_profiles_v` view extended. Web `/profile` BackgroundCard rewritten from localStorage stub to live RPCs (progressive-disclosure questionnaire, multi-entry education, links with quick-presets, topics multi-select from categories table, `lived_public` privacy toggle). New iOS `SettingsBackgroundView.swift` mirroring web. Background block renders on `/u/[username]` (web) + `PublicProfileView` (iOS). Empty-state hint on own profile invites fill-in. URLs in `lived` auto-linkify.

  **Launch-phase hide instead of full kill (per locked decision #16):** "Verified Expert" chrome on comment rows is gated to `false` via `SHOW_EXPERT_CHROME_ON_COMMENTS` flag in `CommentRow.tsx` + `StoryDetailView.swift`. Underlying data, computation, `expert_applications` table, expert API endpoints, `/expert-queue` route — all kept alive. Flip the two flags back to `true` post-launch to restore. Owner intends to revisit verification layer after launch when self-described background is the primary expression of expertise.

  **Still pending (post-launch):** Citations (verified-only, ↗ hostname link on category-matched articles) + Responses sidebar (verified-only, separate `responses` table, 400-char promotion trigger) + Daily-pull homepage section + Community guidelines policy text + actual destructive cleanup (drop 9 expert columns from `comments`, 2 from `users`, 4 zero-row tables, archive `expert_discussions`, repurpose `expert_applications` as credentials store).

  **Composer behavior:**
  - Body field is primary (the comment).
  - Below body: small `+ Add context` link, tap to reveal single-line input (≤80 chars). Empty by default — never a pre-shown blank slot (creates status anxiety for the unaffiliated).
  - Placeholder copy MUST lead with lived experience: `e.g., dad of three in Detroit — or — civil engineer, 30 yrs`. The dual example is the entire egalitarian promise — get this string wrong and the regular-commenter persona quietly bounces.
  - Guardrails: 80-char hard cap, no URLs, no contact info, basic profanity filter. Sensitive-claim soft-confirm on death/victim/family wording (Post button shows: *"By posting, you confirm this is true"*). Separate "report this line" affordance distinct from "report this comment."

  **Comment render:**
  - Body first, then em-dash byline below if line was written. Always shown when filled — never tap-to-expand (hiding written context defeats the purpose).
  - No chrome difference between commenters. The retired millwright's byline sits at identical visual weight to the epidemiologist's.
  - Citation (verified-only, on category-matched articles): small `↗ hostname` link icon below the byline. Renders scannably so lurkers can spot evidence in a long thread.
  - Small `?` next to byline explains category-mismatch silence on tap: *"Citations appear on articles in your verified categories."* No error chrome, no scolding.

  **Responses (verified-only, separate surface):**
  - Longer-form contribution rendered in a sidebar/rail next to article body. NOT in the comment column.
  - Entry trigger: when a verified contributor's comment exceeds ~400 chars, composer prompts: *"This looks like a Response — publish it next to the article?"* with one-tap promotion.
  - New `responses` table (separate from `comments`). Different lifecycle, different moderation surface. Schema TBD during spec doc.

  **Daily-pull replacement for killed queue:**
  - Verified contributors get a lightweight homepage section: *"In your areas this week — N new stories."* No claim mechanic. Just a feed of category-matched articles. Replaces the demand-pull the queue used to provide without re-creating single-claimer hierarchy. Without this, citations + Responses alone are too heavy to bring power users back daily — flagged as the single biggest retention risk.

  **Verification model (internal):**
  - Per-user, scoped to verified categories. Citation + Response affordance surfaces only when article's PRIMARY category matches a user's verified category (strict primary-only — no secondary-tag leakage; pediatrician's affordance must not appear on an abortion-policy story tagged "Healthcare").
  - Async — user posts immediately as self-attested (no citation/Response affordance), upgrades when admin reviews evidence.
  - Evidence levels (doc / employer / community-vouched / self-attested) stay as INTERNAL metadata only — never surfaced to readers. Binary "has affordance / does not" is the only reader-visible distinction.

  **DB changes:**
  - Drop 9 expert columns from `comments`: `is_expert_question`, `expert_question_target_type/id/status`, `is_expert_reply`, `is_expert_thread_root`, `expert_thread_root_id`, `expert_thread_closed_at/by`, `last_reopen_at`.
  - Drop 2 expert columns from `users`: `is_expert`, `expert_title` (legacy flags superseded by per-category credential lookups).
  - Drop 4 zero-row tables: `expert_queue_items`, `expert_thread_chains`, `expert_mention_quota_counters`, `expert_mention_post_counters`.
  - Archive `expert_discussions` (3 real rows) to JSON, then drop the table — do NOT migrate into `comments` (would muddy new model with old-shape data).
  - Repurpose `expert_applications` + `expert_application_categories` as the credential store (no rename needed; semantics shift to per-category verification).
  - Add `comments.real_world_experience text` (CHECK length ≤ 80, nullable).
  - Add `responses` table (schema TBD).
  - Rewrite 4 RLS policies on `comments` BEFORE dropping expert columns. FK chain order matters: drop queue tables → drop comment columns → rewrite policies. Single atomic migration.
  - Remove orphan permission keys: `expert.queue.view`, expert mention permission keys, any `expert.*` keys not reused for credential review.
  - Remove kill switch + tunable rows from `settings`/`plan_features`: `features.expert_threads_enabled`, edit-swap mentions behavior, visual giveaway, cache TTL, default quotas, close-thread cooldown. The whole `expert_threads` config surface goes away.

  **Code surface to remove (web):**
  - `web/src/app/expert-queue/` — entire route. URL behavior: 404 to article home, no transitional copy (per no-user-facing-timelines rule).
  - `web/src/app/api/expert/queue/*`, `/api/expert/ask`, `/api/expert/back-channel`, `/api/expert/availability`, `/api/expert/quotas`, `/api/expert/quota-status`, `/api/expert/timezone`, `/api/expert/vacation`, `/api/expert/picker`, `/api/expert/threads-config` (kill-switch endpoint, becomes orphan).
  - `/api/comments/expert-thread-state` — kill.
  - Cron `/api/cron/flag-expert-reverifications` — kill.
  - `CommentThread.tsx` — remove expert filter toggle, expert dialog, `{false &&` dead button gate at line 1043, expert-chrome branches.
  - `CommentRow.tsx` — remove `is_expert_reply` chrome, `Verified Expert` labels, blurred-paywall expert response state (also fixes long-standing false-paywall promise).
  - `CommentComposer.tsx` — remove expert mention picker / `@expert_<name>` autocomplete + the rate-limit error string. Add `+ Add context` field.
  - `web/src/components/VerifiedBadge.tsx` — drop or repurpose (no badges in new model).
  - `profile/_sections/PublicProfileSection.tsx` — remove expert badge + `expert_title` display from public profile (no badges in new model).
  - `admin/system/page.tsx` — remove expert kill switch + 6 tunable controls (becomes dead UI when settings rows are dropped).

  **Code surface to repurpose:**
  - `web/src/lib/expertConfig.ts` — repurpose for credential config; cache invalidation pattern reusable.
  - `/api/expert/apply` → credential submission (rename optional; semantics shift to per-category credential).
  - `/api/admin/expert/applications/*` → credential review UI.
  - `profile/_sections/ExpertProfileSection.tsx` → `CredentialsSection.tsx`.
  - `profile/_sections/ExpertApplyForm.tsx` → `CredentialApplyForm.tsx`. Remove the user-facing timeline string `"We review within 5 business days"` (line 129) — violates no-user-facing-timelines rule.
  - `admin/expert-sessions/page.tsx` — repurpose for credential review (kid sessions stay separate; this surface is adult-side only).

  **iOS adult (`VerityPost/`):**
  - `StoryDetailView.swift` — comment composer adds Real-world Experience field; comment render adds em-dash byline + citation affordance.
  - `ProfileView.swift` — credentials list section (replaces expert profile section).
  - `SignupView.swift` — optional credential step.
  - Remove `ExpertQueueView.swift`.
  - `Models.swift` — drop `isExpert`, `expertTitle` from `VPUser`; add credentials array.

  **Kids (`VerityPostKids/`):** untouched. `kid_expert_sessions` stays as-is. Kids comments are 13+ gated and do not carry credentials.

  **Community guidelines policy text needed before launch (separate from UI):**
  - Lines describe expertise or lived experience, NOT political/tribal identity. Allowed: `civil engineer, 30 yrs`, `lifelong reader, NTSB reports`, `Vietnam, infantry, '68-'70`. Disallowed: `lifelong Trump voter`, `BLM organizer`, `Zionist`, `ex-Mormon`.
  - No personally identifying combinations. Allowed: `civil engineer, Caltrans, 30 yrs`. Disallowed: `Sarah Chen, GS-14, Pentagon E-ring`.

  **Verified persona walkthrough notes (from panels):**
  - Single highest-risk persona: regular-commenter-no-credentials ("Tom"). Protected entirely by placeholder copy. Get the string right.
  - Single biggest retention risk: verified-contributor power-user loop. Citations + Responses alone are heavy actions; the daily-pull "in your areas this week" feed is the lightweight hook that makes the loop work.
  - Lurker trust signal in the absence of badges: citation presence. Must render scannably (link icon + clean hostname).

  **Cut from v1:** Comment follow-ups (TODO 48 — deferred, see below). All four surfaces (line + citation + Response + follow-up) is too dense for v1; follow-ups are easiest to add later.

  **Implementation sequence (rough — full spec doc still to be written):**
  1. DB migration: drop expert tables/columns, add `real_world_experience`, repurpose `expert_applications`. Atomic.
  2. Composer + render in `CommentComposer.tsx` / `CommentRow.tsx` / `CommentThread.tsx` (web first).
  3. Citation affordance + category-match logic.
  4. Responses table + sidebar render + 400-char promotion trigger.
  5. Daily-pull "in your areas this week" homepage section.
  6. Profile credentials section (web + iOS).
  7. iOS parity pass.
  8. Community guidelines policy text + sensitive-claim soft-confirm.
  9. Old `/expert-queue` route → 404.

---

## Needs your decision before anything can move

**Article reader**
- 3: Move Sources block out of `timelineSlot` and into the main article body, after `ArticleActions`. Redesign the display: show publisher favicon/logo instead of text title. Interaction: clicking a logo expands/reveals the raw source headline (`s.title`); clicking that headline opens the source URL in a new tab (`target="_blank" rel="noopener noreferrer"`). Do not navigate inside the app — user must land outside so they can return cleanly.
  - Move: `web/src/app/[slug]/page.tsx:355` — remove `<SourcesSection>` from `timelineSlot`, add it after `<ArticleActions>` (line 347)
  - Favicon: fetch via `https://www.google.com/s2/favicons?domain={hostname}&sz=32` using `hostFromUrl(s.url)` already in `SourcesSection.tsx:114`
  - Expand/collapse: each source row is a button showing the logo; click toggles a visible raw headline below it; click the headline → new tab
  - Tease state (no subscription) and anon state remain as-is — just re-skin the layout
  - Note: "Unknown" display bug (TODO 26) is a data issue — backfill migration (TODO 19) must run first; code fallback logic is already correct
**iOS**

**Security / RBAC — fix these before granting owner-mode to any second user**
- 7: Any admin with scope_override permission can self-grant admin.owner_mode through the permissions UI. Decision: hard-deny that key on grant (a), introduce a separate assign permission (b), or restrict the whole permissions surface to owner-mode holders only (c)?
- 8: Client-side permissions.js short-circuit bypasses kid-protective UI gates when owner is in a kid session. Decision: check for active_kid context inside the short-circuit (a), or invalidate the cache on kid-session enter/exit (b)?
- 9: Owner-mode bypass writes have no audit-log marker. Decision: which table to write to, and which writes to cover (all, or only high-blast-radius ones)?

**Ad targeting**
- 11: Ad placement system needs scalable audience targeting — by category, subcategory, and article. Dedicated session required (schema + UI). Replace dead `category_top` / `category_in_feed_1` rows as part of that work.

---

## Ready to fix — no decision needed, just needs doing

- 12: Migration `_210000_grant_feed_clusters_browse_access.sql` is not idempotent — CREATE POLICY lines need DROP IF EXISTS guards. **Note:** file not found in repo — migrations appear to be managed directly in Supabase Studio. Owner to locate or skip.

---

## Needs runtime diagnosis — can't move from code alone

- 14: Web logs user out overnight — symptom confirmed, root cause unresolved. Needs browser-side cookie capture (name, Max-Age, Expires) immediately after sign-in and again after 2+ hours

---

## Pending your prod smoke on veritypost.com

These are shipped and on Vercel but you haven't confirmed them on production yet:

- 15: /admin/feeds rebuild
- 16: Discovery scraper Phase A
- 17: Discovery scraper Phase B — also needs NEWSAPI_KEY / NEWSDATA_KEY / MEDIASTACK_KEY / GNEWS_KEY set in Vercel env vars
- 18: Discovery scraper Phase C

---

## Profile / Cleanup (owner to explain)


---

## Category leaderboard

- 36: Category leaderboard + scoring — scoring events and subcategory data exist but the UI is generally broken/incomplete. Users currently have no clear way to see their standing.

  **Already wired (do not rebuild):**
  - `score_on_reading_complete` — `api/stories/read/route.js` + `api/events/batch/route.ts`
  - `score_on_quiz_submit` — `api/quiz/submit/route.js`
  - `scoreReceiveHelpfulTag` on helpful tag — `context-tag/route.js:101-113`
  - `category_scores` table with `subcategory_id` rollup rows
  - `/leaderboard` has parent + sub pill drilldown, "Your rank" card, sticky rank bar
  - `CategoriesSection` in profile shows per-category scores with sub-pills + 2×2 stat grid

  **UI gaps to fix:**
  - No entry point from articles or profile to the category leaderboard — user reads an article in Politics but can't jump to "See Politics leaderboard"
  - Profile `CategoriesSection` shows the user's own score but never shows their rank within that category (no "Your rank: #12 in Politics")
  - Leaderboard sticky rank bar shows rank + score but no category label (shows "#5" not "Politics #5")
  - `context` tag does not award points — only `helpful` does; decide if `context` should score
  - Subcategory deselect-on-click in profile is inconsistent with leaderboard pill behavior

  **New: percentile display**
  - Show the user's percentile rank among all users in that category/subcategory — e.g. "Top 8% of readers in Politics" or "Top 3% of taggers in World"
  - No max-possible ceiling needed — purely rank the user's score against all other users in that node
  - Show in both the profile `CategoriesSection` score card and on the leaderboard when drilling into a category

---

## Article surface — sources

- 26: Sources still showing "Unknown" for some articles — `SourcesSection.tsx:88` renders `s.title || s.publisher || hostFromUrl(s.url) || 'Source'`. The backfill migration `20260503000007_backfill_unknown_sources_to_null.sql` has not been applied yet (see TODO 19), so rows with literal `'Unknown'` in the `title` column pass the `s.title` check and render "Unknown" instead of falling through to `hostFromUrl`. Fix: apply the backfill migration (owner action, TODO 19) — no code change needed.

---

## Comments / tagging

- 39: Tag button UI after passing quiz is messy — clicking tags on another user's comment has poor UX (button states, picker, feedback). Needs investigation and redesign of the tag interaction in `CommentRow.tsx` and iOS `StoryDetailView.swift`.

---

## Layout / visual

- 38: Article page desktop layout feels off-center — `ArticleReaderTabs.tsx` uses a 75/25 flex split (`flex: 75` article column + `flex: 25` sticky timeline rail, `max-width: 1280px` container). The article body is capped at 680px inside the left column, so on a wide screen the text sits left-heavy with the timeline rail on the right and dead space outside. Decision needed: (a) keep 75/25 sidebar but tighten max-width so dead space shrinks, (b) move timeline above/below the article body and drop the rail, (c) make timeline a slide-in drawer/overlay on desktop instead of a persistent column. This is connected to TODO 3 (sources moving out of the timeline slot into the article body) — layout decision should be made together.

---

## iOS parity — bring iOS up to web mobile standard

Web mobile is the product standard. These items bring iOS in line.

- 45: **Ads on iOS** — `HomeAdSlot` struct exists in `HomeFeedSlots.swift` but decodes the wrong response shape (missing fields) and is not wired into `HomeView.swift`. Article page has zero ad slots. Complexity: M.
  - Fix `AdPayload` decode in `HomeFeedSlots.swift` to match the `/api/ads/serve` response shape (check `web/src/app/api/ads/serve/route.ts` for exact fields)
  - Wire `HomeAdSlot` into `HomeView.swift` at the same positions as web: after the hero card (`home_top`), between cards 4–5 (`home_in_feed_1`), between cards 8–9 (`home_in_feed_2`), and below the last card (`home_below_fold`)
  - Add article-level ad slots in `StoryDetailView.swift` — check web `[slug]/page.tsx` for placement positions
  - Register impressions via `/api/ads/impression` and clicks via `/api/ads/click`
  - iOS Kids: not applicable

- 47: **Advanced search filters on iOS** — `FindView.swift` is keyword-only. Web `/search` supports category, date range, and source publisher filters for `search.advanced` users. Complexity: M.
  - Add a filter panel / sheet to `FindView.swift` with category picker, date range picker, source field — gated by `search.advanced` permission
  - The existing `/api/search` route already accepts the filter params (same API web uses)
  - Permission keys: `search.advanced`, `search.advanced.category`, `search.advanced.date_range`, `search.advanced.source`
  - iOS Kids: not applicable (kids has no search)



---

## Owner action items

- 19: Apply `supabase/migrations/20260503000007_backfill_unknown_sources_to_null.sql` — 4 "Unknown" source rows in prod still render legacy values until it runs
- 20: Verity Monthly Stripe price: plans.verity_monthly has stripe_price_id=NULL — owner must click Mint at /admin/plans

---

## Open copy / direction questions

- 49: **HomeFooter anon end-of-feed copy** — placeholder pitch shipped 2026-05-07 in `web/src/app/_HomeFooter.tsx`; owner rejected wording as too scarcity-flavored. Constraints: no "today" framing (articles aren't date-bound), no gate/scarcity tone, no closed-beta "invite" jargon. Open question: what should the end-of-anon-home-feed sell — the quiz, the Verity Score, the discussion, the brand idea? Revisit when owner has a direction.

---

## Article generation — prompt rewrite + deferred pipeline items

- 51: **Article generation prompt rewrite to "facts only" voice + deferred non-prompt findings from 4-adversary panel review (2026-05-07).** Owner premise: facts aren't copyrightable (Feist); take facts, strip the source's framing/opinion/outlet-name-drops, write fresh in Verity Post's voice. Goal: legally defensible AND enjoyable to read. Single source-of-truth for the work. Cross-platform: backend pipeline change in `web/`; iOS + Kids iOS receive better articles automatically through the database — no app-side change.

  **PART A SHIPPED 2026-05-07** — all 9 prompt edits landed in `editorial-guide.ts` + the word-count sync in `route.ts:1732`. Allegation Mode carve-out in rule 11 (libel hedge required for uncharged conduct), BAD/GOOD example added, anti-hallucinated-attribution rule, Wikipedia-as-research-aid rule, "alleged"/"reportedly" restored as required hedges, conditional length-band ladder dropped (replaced with fixed 30–50 word target), 250-400 → 250-450 sync, "so what" tightened to attributable mechanism only, cadence + scale comparisons + on-record statements protected as carve-outs under EVERY SENTENCE A FACT. Part B (architectural items: native JSON mode, cache restructure, per-claim provenance, ≥2 sources gate, serialize summary after body, trust signals on AudienceCard, cost hint on model picker, regenerate non-orphan policy, source-headline strip on headline-gen) remains.

  **Part A — Prompt-only changes (this is the actual fix; ~45 minutes of edits, all in `web/src/lib/pipeline/editorial-guide.ts` plus a 1-line route.ts touch).**

  *Already shipped locally (7 edits, 2026-05-07):*
  - New "FACTS ONLY — STRIP THE FRAMING" section added to `EDITORIAL_GUIDE` (~line 205): adjectives describe-not-characterize, reported opinions only when statement IS a news event, don't inherit source framing, no in-line outlet attribution, every sentence a fact.
  - Rule 11 rewritten (~line 329): attribution is to the PRIMARY SOURCE (person/agency/document), not the outlet that reported it. Outlet credit lives in sources block.
  - SUMMARY RULES in `HEADLINE_PROMPT`, `KIDS_HEADLINE_PROMPT`, `TWEENS_HEADLINE_PROMPT` replaced with dynamic length bands (~10-12% of body word count).
  - FACTS ONLY mirror sections added to `KIDS_ARTICLE_PROMPT` and `TWEENS_ARTICLE_PROMPT`.

  *Pending (panel surfaced, not yet edited):*
  - **Allegation Mode carve-out** — when a sentence imputes uncharged conduct to a named person, mandatory in-line attribution to a court filing / named official + mandatory hedging ("alleged," "according to court filings"). Critical libel fix — current strip-outlet rule destroys fair-report privilege on this content category. Both lawyers flagged independently.
  - **Resolve "so what" vs FACTS ONLY contradiction** — line 96 still requires a "so what" sentence; new FACTS ONLY block says cut anything that interprets/predicts/frames. Redefine so-what as "attributable mechanism — must cite a named source or quantitative causal claim, or omit." Keeps it required, makes it consistent.
  - **Disambiguate rule 11 with explicit example** — *"BAD: 'CBS News reported the investigation began under Biden.' GOOD: 'The investigation began during the Biden administration, according to a person familiar with the matter.' Strip the outlet, keep the primary-source hedge."* Stops model dropping both.
  - **Protect cadence + scale comparisons + on-record official statements** inside the FACTS ONLY block. One-liner each. Without this the model over-cuts (Jay Jones-class statements) and collapses to monotone declaratives.
  - **Drop the conditional length-band ladder** in summary rules — replace with one fixed target (~30-50 words, 2-3 sentences). The summary call runs in parallel with the body so it can't observe actual body length; conditional bands are aspirational. Honest is better.
  - **Sync 250-400 vs 250-450 word count** — change `route.ts:1732` from "250-400" to "250-450" so body user-turn matches `EDITORIAL_GUIDE`. One-line fix.
  - **Anti-hallucinated-attribution rule** — add to FACTS ONLY: *"Never invent attribution phrasing. If the corpus does not explicitly identify a primary source for a claim, state the fact flat or omit it. Do not generate 'according to' / 'sources said' / 'a person familiar' unless those exact phrasings appear in the research."* Closes a structural libel risk (St. Amant "purposeful avoidance") without pipeline change.
  - **Wikipedia as research-aid rule** — *"Wikipedia is a research aid, not a content source. Do not reproduce or paraphrase Wikipedia prose. Use Wikipedia to find primary sources, then attribute to those."* Closes CC-BY-SA exposure without pipeline change.
  - **Restore "alleged" / "reportedly" as required hedges for uncharged conduct** — current rule 11 bans them as weasel words; libel doctrine requires them. Carve out: required when the underlying claim is an investigation, accusation, or uncharged conduct against a named person.

  *Worked example (Lucas FBI search story) is in conversation history 2026-05-07 — shows ~370-word original collapsed to ~210-word "after" with all source-outlet name-drops, characterizations, pundit reactions, and editorial framings stripped.*

  **Part B — Non-prompt findings from the panel (DEFERRED — none affect what articles read like; these are reliability, cost, legal-architecture, and operator-UX items).**

  *None of these are launch-blocking. None change the article output. They are real but separate work.*

  - **Native JSON mode** — pipeline currently asks the model to "return JSON" and parses free text via `extractJSON()` (route.ts:1650, 1755). Both providers have built-in modes (Anthropic forced tool-use, OpenAI `response_format: json_schema`). Eliminates JSON drift. Affects ~10 call sites in `route.ts` + `call-model.ts`.
  - **Cache restructuring** — Anthropic 5m ephemeral cache lives on `EDITORIAL_GUIDE` (system block), but `composeSystemPrompt()` in `prompt-overrides.ts` appends category-specific text + admin overrides INTO the cached block, busting cache on every call. Move category appends + overrides to a second uncached system block. ~5-10× cost reduction on Anthropic generation steps.
  - **Per-claim source provenance** — body writer receives a corpus blob and guesses which fact came from which source; "according to a person familiar with the matter" is sometimes invented. Real libel risk (St. Amant purposeful avoidance / Lanham Act fabricated sourcing). Fix: research/extraction step tags each fact with source, document type, attribution form, named-person status, allegation-flag; body writer attributes from tags not guesses. The Part A "anti-hallucinated-attribution" prompt rule patches half of this; only per-claim provenance closes it fully.
  - **≥2 sources required** — pipeline allows generating from a single outlet. Single-source generation is the case copyright plaintiffs actually win (hot-news misappropriation, selection-and-arrangement compilation theory). Gate at `/api/admin/pipeline/generate` to refuse clusters with <2 outlets unless ≥1 primary document (court filing, agency statement, .gov / press release URL) is present.
  - **Serialize summary AFTER body** — currently headline + summary + categorization run in parallel with body, so the summary writer can't see the body. Required if we ever want a TRUE dynamic-length summary; not required for the prompt-only "fixed target" we shipped in Part A. Defer until the prompt-only summary proves insufficient.
  - **Trust signals on AudienceCard** — pipeline already stores `articles.plagiarism_status`, `articles.needs_manual_review`, source-grounding scores. UI doesn't surface any of it on the success state. Operator can't see which articles need closer review. Pure UI work in `AudienceCard.tsx`.
  - **Cost hint on model picker** — dropdown shows "Claude Opus 4.7" etc. but not "$5–15 per article." 100× cost delta vs Haiku is invisible. Operator can blow $300/day on accidental Opus session. Add `costPerArticle` field to `MODEL_OPTIONS` in `newsroomModels.ts`, render badge in the Select on `admin/newsroom/page.tsx`.
  - **Regenerate doesn't orphan operator hand-edits** — Retry currently creates a fresh `articles` row, stranding any hand-edits the operator made on the prior row with no warning. Either reuse `article_id` on retry (UPDATE in `persist_generated_article` RPC) or surface a confirm modal before replacing.
  - **Source headline not visible during headline generation** — model is given full source articles including their headlines, then asked to generate a Verity Post headline. Risk of close paraphrase (headlines have been held copyrightable in some jurisdictions, Meltwater UK). Strip source headlines from corpus passed to headline-generation step.

  **Why these were deferred:** owner asked specifically for the prompt fix; the architectural items don't change what articles read like. Each can ship independently in its own session — none gates another except per-claim provenance is the keystone for the deeper libel posture (and is ~3 days of focused work touching the corpus contract every downstream step reads from).

  **Adversary-panel context (for future readers picking this up):** 4-agent independent review on 2026-05-07 — copyright lawyer, defamation/libel lawyer, editorial/readability critic, prompt-engineering pressure-tester. Convergent finding: the copyright-driven strip-outlet rules WORSEN libel exposure on uncharged-allegation stories unless paired with Allegation Mode carve-out (Part A item 1). Libel lawyer's framing: *"chasing a copyright ghost and walked straight into a libel buzzsaw."* Part A items 1, 7, 9 (Allegation Mode + anti-hallucination + restore hedges) close the libel hole that the already-shipped 7 edits opened.

---

## Kids public web — daily article teaser site

- 52: **Public kids site at veritypostforkids.com — one free article a day, signup CTA.** Owner wants a fun, engaging public front door for the kids product. The full experience stays in the iOS app (streaks, badges, expert Q&A, leaderboards); web is intentionally limited — just enough to let people *see what it's like*. Currently kids web is redirect-only (`web/middleware.js:444-454` sends anon visitors to `/kids-app` waitlist). This replaces that with an actual destination. Cross-platform: web only — iOS Kids and iOS Adult untouched.

  **Locked decisions (owner, 2026-05-07):**
  - **Domain:** separate registration `veritypostforkids.com` (not subdomain, not /kids on main). Owner accepts ~$15/yr + DNS wiring + zero starting domain authority.
  - **Article shape on web:** full kids article text + illustration, free, no signup wall, with a single quiz question below carrying "sign in to save your score" copy.
  - **Signup CTA:** smart-split — iOS visitors → App Store (`com.veritypost.kids`), Android/desktop → existing `/kids-app` email waitlist.

  **Open questions — need owner discussion before any spec work:**
  - COPPA on web: "sign in to save your score" implies *some* identity flow on a kids-directed domain, which is the riskiest part of the whole idea. Pair-code-on-web mints a kid JWT in a browser (rebuilds COPPA compliance on a new surface). Cookie-only local score is safer but quiet. Hard redirect to app for sign-in is safest. Decide before designing.
  - Cannibalization vs app retention: full article + quiz feedback on web is a complete loop for ages 7-10. Risk that web becomes "good enough" and app installs/retention drop. Open whether to gate the *result* (score/streak/correctness) behind sign-in while keeping the read free.
  - Daily-return mechanic: kids email is out of scope (`project_email_notifications_scope.md` — security-only). Bring-them-back levers without email: PWA install prompt, "tomorrow's story is about ___" teaser line, bookmark nudge.
  - SEO/AdSense: kids site can't run AdSense (Google Families Policy bans ads on sites primarily directed at children under 13). Decide: index for "kids news" organic traffic + waitlist signups, or noindex and treat as funnel-only.
  - Daily article source: articles already exist in DB with `kids_summary` + `is_kids_safe` + `age_band`. Decide auto-rotate from eligible pool vs admin-curated daily pick.
  - Page architecture for fun: above-fold hero, illustration style (single house illustrator vs stock vs none), mascot Y/N, quiz interaction (instant feedback + celebration vs reveal-and-handoff).
  - Adult-vs-kid mode collision: parent-with-child-watching is the most likely viewer; the page has to feel kid-energy enough for the kid and credible enough for the parent on one surface.

  **What's already in place (don't rebuild):**
  - `articles.kids_summary`, `articles.is_kids_safe`, `articles.age_band` columns populated on existing kids articles
  - `/kids-app` parent-directed waitlist landing page with honeypot, opens_at min-time guard, sanitized utm_source attribution
  - `/api/kids-waitlist` email capture endpoint
  - `/privacy/kids` COPPA-specific privacy notice page (would need updating to cover the new public-reading surface)
  - Middleware redirect for `/kids` and `/kids/*` — the *redirect* goes away or becomes the new destination depending on domain decision

  **Brainstorm only.** No spec work, no panels, no code until owner says go.
