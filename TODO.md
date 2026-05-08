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

  - ~~**Native JSON mode**~~ — DOWNGRADED to prompt-fix 2026-05-08 (8 audit agents converged: failures are <0.5%, no existing retry loop, "silent abort" was overstated). Shipped: every JSON-emitting user prompt (headline+summary, summary, body, categorization) now ends with "Respond with the JSON object only — no preamble, no markdown fence, no explanation." extractJSON's existing fence-strip + first-`{...}` fallback already handles the rest. Future: revisit native tool-use only if json_parse error rate climbs above 0.5% in production.
  - ~~**Cache restructuring**~~ — SHIPPED 2026-05-08. `CallModelParams` got a `system_cache_stable` prefix; `callAnthropicOnce()` splits the system into a cached prefix block + uncached overrides/append block. Wired across all 11 call sites in `generate/route.ts` (audience check, headline, summary, categorization, body, source grounding, timeline, kid url sanitizer, quiz, quiz verification). For body, the stable is `EDITORIAL_GUIDE` (~5.3K tokens, ~99% of the system payload); for kid/tween audiences it's the whole prompt. Expect ~5–10× cost reduction on repeated Anthropic generation steps within a 5-min window.
  - ~~**Per-claim source provenance**~~ — DOWNGRADED to prompt-fix + regex-check 2026-05-08 (audit agents: full structured-provenance schema is for legal-defense audit trail, not actual libel prevention; 80% solution is real). Shipped: editorial-guide rule NEVER INVENT ATTRIBUTION strengthened with concrete BAD/GOOD examples; new ATTRIBUTION_PATTERNS regex pass after body generation flags libel-shaped phrasings ("according to a person familiar," "officials said," "sources said") and flips needs_manual_review; source_grounding threshold tightened from >3 unsupported claims (warn-only) to >0 (flips needs_manual_review). Future revisit: full per-claim JSONB schema only if a lawyer asks for the audit trail.
  - ~~**≥2 sources required**~~ — DOWNGRADED to prompt-fix + UI badge 2026-05-08 (audit agents: hard gate is paternalistic for a manual-pick workflow). Shipped: editorial-guide rule SINGLE-OUTLET FRAMING (when corpus has only one outlet, attribute every contested claim to that outlet by name, with BAD/GOOD examples); body system prompt detects single-outlet corpora at runtime and appends a SINGLE OUTLET ALERT directive naming the sole outlet; SourcesBlock UI shows a "Single outlet" danger pill so the operator sees the legal-shape risk before clicking Generate. Future revisit: hard gate at `/api/admin/pipeline/generate` once traffic is non-trivial (the hot-news / compilation-copyright argument applies once volume + revenue exist; today's manual-review workflow + prompt rule + UI badge is sufficient).
  - ~~**Serialize summary AFTER body**~~ — DROPPED 2026-05-08 (audit agents: documented as deferred; tighter prompt closes the gap cheaper). Shipped: summary prompt rewritten as 3-sentence scaffold (sentence 1 = setup/context, sentence 2 = event/development, sentence 3 = significance/what-comes-next), 40–60 words total. Future revisit only if user engagement metrics show the deck is failing readers.
  - ~~**Trust signals on AudienceCard**~~ — SHIPPED 2026-05-08. Operator now sees inline pills on the success state (Needs review / Rewritten / Original kept · review / Rewrite failed) sourced from `articles.plagiarism_status` + `articles.needs_manual_review`. Empty-good = no badge spam.
  - ~~**Cost hint on model picker**~~ — SHIPPED 2026-05-08. `MODEL_OPTIONS` got a `costPerArticle` field (~$0.05–~$10 across the 5 entries); the Select label now reads "Claude Opus 4.7 · ~$10/article" so the 100× cost delta is visible before clicking Generate.
  - ~~**Regenerate doesn't orphan operator hand-edits**~~ — SHIPPED 2026-05-08. AudienceCard's failed-state Retry button now arms a two-step confirm: first click swaps the action row to a warning ("Retry creates a new article row. Any hand-edits to the previous one will be stranded.") + Yes, regenerate / Cancel pair; second click fires the existing retry endpoint. Inline text-only confirmation, no modal component, no icons. Approach B from the 4+4 panel (preferred over UPDATE-in-place because the latter loses audit trail of prior generations and can't reliably distinguish operator-dirty columns from pipeline-fresh ones).
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
