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

  **Pending (post-launch):** Citations (verified-only, ↗ hostname link on category-matched articles) + Responses sidebar (verified-only, separate `responses` table, 400-char promotion trigger) + Daily-pull homepage section + Community guidelines policy text + actual destructive cleanup (drop 9 expert columns from `comments`, 2 from `users`, 4 zero-row tables, archive `expert_discussions`, repurpose `expert_applications` as credentials store). Profile background system + per-comment real-world-experience lines already shipped 2026-05-07; expert chrome currently launch-phase-hidden via `SHOW_EXPERT_CHROME_ON_COMMENTS=false` flag in `CommentRow.tsx` + `StoryDetailView.swift` (flip back to restore).

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

**Security / RBAC — fix these before granting owner-mode to any second user**
- 7: Any admin with scope_override permission can self-grant admin.owner_mode through the permissions UI. Decision: hard-deny that key on grant (a), introduce a separate assign permission (b), or restrict the whole permissions surface to owner-mode holders only (c)?
- 8: Client-side permissions.js short-circuit bypasses kid-protective UI gates when owner is in a kid session. Decision: check for active_kid context inside the short-circuit (a), or invalidate the cache on kid-session enter/exit (b)?
- 9: Owner-mode bypass writes have no audit-log marker. Decision: which table to write to, and which writes to cover (all, or only high-blast-radius ones)?


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

## Article surface — sources

- 26: Sources still showing "Unknown" for some articles — `SourcesSection.tsx:88` renders `s.title || s.publisher || hostFromUrl(s.url) || 'Source'`. The backfill migration `20260503000007_backfill_unknown_sources_to_null.sql` has not been applied yet (see TODO 19), so rows with literal `'Unknown'` in the `title` column pass the `s.title` check and render "Unknown" instead of falling through to `hostFromUrl`. Fix: apply the backfill migration (owner action, TODO 19) — no code change needed.

---

<!-- iOS parity items 39, 45, 47 all shipped 2026-05-08; section retired. -->

## Owner action items

- 19: Apply `supabase/migrations/20260503000007_backfill_unknown_sources_to_null.sql` — 4 "Unknown" source rows in prod still render legacy values until it runs
- 20: Verity Monthly Stripe price: plans.verity_monthly has stripe_price_id=NULL — owner must click Mint at /admin/plans

---

## Open copy / direction questions

- 49: **HomeFooter anon end-of-feed copy** — placeholder pitch shipped 2026-05-07 in `web/src/app/_HomeFooter.tsx`; owner rejected wording as too scarcity-flavored. Constraints: no "today" framing (articles aren't date-bound), no gate/scarcity tone, no closed-beta "invite" jargon. Open question: what should the end-of-anon-home-feed sell — the quiz, the Verity Score, the discussion, the brand idea? Revisit when owner has a direction.

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
