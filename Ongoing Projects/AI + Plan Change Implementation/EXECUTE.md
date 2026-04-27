# Execute checklist — what I do when I start

This is the tight, in-order action list. Drop-in execution doc. No discussion, no soaks, no calendar speculation. Step-by-step.

---

## Pre-flight (before any code)

Locked 2026-04-26:
- ✅ Pricing: $7.99 Verity / $14.99 Family / $4.99 extra kid
- ✅ Family XL dropped permanently
- ✅ Pro grandfather: Option B (auto-migrate at next renewal)

Still need before starting:
- [ ] Owner explicit "go" signal (currently held — owner said "don't start yet")
- [ ] Owner action: apply for Apple Small Business Program (in parallel with my work, when started)
- [ ] Owner action: apply for AdSense (in parallel, when started)
- [ ] Owner action: apply for AdMob (in parallel, when started)

---

## PHASE 0 — Pass A (target: 4 hours of dev time)

### 0.1 — `web/src/lib/pipeline/editorial-guide.ts`

Strip these blocks:
- [ ] Lines 43-62: "RELATED VP STORIES" section in EDITORIAL_GUIDE
- [ ] Lines 222-224: "No subheadings. No bold text..." rule (contradicts JSON markdown override)
- [ ] Lines 325-327: `<!-- insufficient_data: -->` instruction
- [ ] Lines 333-336: "Return ONLY the article body as plain text..." (contradicts JSON output)
- [ ] Lines 339-342: `<!-- word_count: 178 -->` trailing comment instruction
- [ ] TIMELINE_PROMPT lines 746-805: "LINKING TO EXISTING VP ARTICLES" + "INHERITING THREAD TIMELINES" sections
- [ ] TIMELINE_PROMPT lines 818-825: the `text`/`summary` field block (contradicts OUTPUT FORMAT)

Fix these:
- [ ] HEADLINE_PROMPT lines 672-676: change OUTPUT `"title"` → `"headline"`, add `"slug"` field
- [ ] QUIZ_PROMPT line 713: confirm `correct_index` (matches code)
- [ ] KID_QUIZ_PROMPT line 1015: change `correct_answer` → `correct_index` (unify with adult)
- [ ] KID_ARTICLE_PROMPT lines 967-973: replace OUTPUT FORMAT with `{"title", "body", "word_count", "reading_time_minutes"}` (matches BodySchema)
- [ ] AUDIENCE_PROMPT line 940-941: change `"reason": "..."` → `"reasons": [...]`

### 0.2 — `web/src/app/api/admin/pipeline/generate/route.ts`

- [ ] Lines 352-358: drop `title` and `description` optional fields from `TimelineEventSchema` (vestigial)
- [ ] Line 994: rewrite summary user-turn — pick path:
  - **Path A (recommended):** add `SUMMARY_PROMPT` constant in editorial-guide.ts, switch system prompt for summary step, add new `SummarySchema` with `summary` only
  - **Path B (faster):** make `headline` optional in `HeadlineSummarySchema`
- [ ] Line 1383: rewrite quiz user-turn to include explicit JSON schema reminder (kills the bare-string options bug)

### 0.3 — Verify before deploy

- [ ] `grep -E "vp_slug|RELATED VP|insufficient_data|<!-- word_count" web/src/lib/pipeline/editorial-guide.ts` returns 0 lines
- [ ] `grep -E "leave as empty string" web/src/app/api/admin/pipeline/generate/route.ts` returns 0 lines
- [ ] TypeScript compiles: `cd web && npm run typecheck`
- [ ] Local test: trigger 1 generation in staging if available, else go direct to prod with cluster ready to sacrifice

### 0.4 — Deploy + smoke test

- [ ] Commit: `fix(pipeline): align prompts with schemas, strip dead instructions`
- [ ] Push, deploy
- [ ] Pick a real cluster from `/admin/newsroom`
- [ ] Trigger 1 adult generation → reaches `persist`?
- [ ] Trigger 1 kid generation → reaches `persist`?
- [ ] Check `pipeline_runs` last 2 rows: status='completed', error_type=null

If both succeed → Phase 0 done. Move to Phase 1 immediately.
If either fails → debug from `pipeline_runs.error_message`, iterate.

---

## PHASE 1 — kid_articles consolidation (target: 6 hours)

### 1.1 — Pre-drop verification

- [ ] Run SQL: `SELECT (SELECT count(*) FROM kid_articles), (SELECT count(*) FROM kid_sources), (SELECT count(*) FROM kid_timelines), (SELECT count(*) FROM kid_quizzes), (SELECT count(*) FROM kid_discovery_items);`
- [ ] All five MUST be 0. If any > 0 → STOP, escalate to owner.

### 1.2 — `web/src/lib/pipeline/persist-article.ts`

- [ ] Update `PersistArticlePayload` type:
  - Add `audience: 'adult' | 'kid'`
  - Add `age_band?: 'kids' | 'tweens' | 'adult'`
  - Add `kids_summary?: string | null`

### 1.3 — Rewrite `persist_generated_article` RPC

Migration file: `supabase/migrations/{timestamp}_consolidate_kid_articles.sql`

- [ ] Pre-step: drop kid_articles family policies (else FK + DROP fails)
- [ ] Rewrite RPC body:
  - Validate `audience IN ('adult', 'kid')` and if 'kid' then `age_band IN ('kids', 'tweens')`
  - Always INSERT INTO `articles` (no branch)
  - Set `is_kids_safe = (v_audience = 'kid')`
  - Set `age_band = NULLIF(p_payload->>'age_band', '')`
  - Set `kids_summary = NULLIF(p_payload->>'kids_summary', '')` for kid runs
  - Always INSERT INTO `sources`, `timelines`, `quizzes` (no kid_* tables)
- [ ] Drop tables: `kid_quizzes`, `kid_timelines`, `kid_sources`, `kid_articles`, `kid_discovery_items` (in that order — FK dependencies)
- [ ] DROP all kid_* RLS policies (kid_articles_admin_all, kid_articles_block_adult_jwt, kid_articles_read_kid_jwt, etc.)

### 1.4 — Update generate route

`web/src/app/api/admin/pipeline/generate/route.ts`:
- [ ] Pass `audience` field through `persistGeneratedArticle` call
- [ ] If kid run, pass `age_band` (always 'tweens' until Phase 3 splits to bands)
- [ ] Pass `kids_summary` (use `summary` value)

### 1.5 — Update other consumers

- [ ] `web/src/app/api/cron/pipeline-cleanup/route.ts` — drop kid_articles handling
- [ ] `web/src/app/api/admin/articles/[id]/route.ts` — drop kid_articles branch
- [ ] `web/src/app/api/admin/newsroom/clusters/articles/route.ts` — drop kid_articles branch
- [ ] Search remaining: `grep -rn "kid_articles\|kid_sources\|kid_timelines\|kid_quizzes\|kid_discovery_items" web/src` — all references should be in migrations or types only

### 1.6 — Test

- [ ] Trigger 1 kid generation
- [ ] Verify row appears in `articles` with `is_kids_safe=true`
- [ ] Verify NO row in kid_articles (table is gone)

### 1.7 — Run M2 (drop tables)

- [ ] Apply migration
- [ ] Re-run verification SQL — tables should be gone (will error)
- [ ] Confirm next generation still works

Phase 1 done.

---

## PHASE 2 — Plan structure rewrite (target: 12 hours dev + owner setup)

### 2.1 — Owner-side setup (parallel)

Owner does these. Don't block on them; do code in parallel.

- [ ] Apply for Apple Small Business Program
- [ ] Create Apple subscription group `Verity Subscriptions` in App Store Connect
- [ ] Create 10 Apple SKUs:
  - `com.veritypost.verity.monthly` ($7.99)
  - `com.veritypost.verity.annual` ($79.99)
  - `com.veritypost.family.1kid.monthly` ($14.99)
  - `com.veritypost.family.2kids.monthly` ($19.98)
  - `com.veritypost.family.3kids.monthly` ($24.97)
  - `com.veritypost.family.4kids.monthly` ($29.96)
  - `com.veritypost.family.1kid.annual` ($149.99)
  - `com.veritypost.family.2kids.annual` ($199.98)
  - `com.veritypost.family.3kids.annual` ($249.97)
  - `com.veritypost.family.4kids.annual` ($299.96)
- [ ] Create 4 Stripe products + 6 prices: Verity (monthly+annual), Family base (monthly+annual), Family Extra Kid (monthly+annual)
- [ ] Apply for AdSense + AdMob

### 2.2 — DB migration M3 (plan structure)

`supabase/migrations/{timestamp}_plan_structure.sql`:

- [ ] UPDATE `verity_monthly` price_cents=799
- [ ] UPDATE `verity_annual` price_cents=7999
- [ ] UPDATE `verity_family_monthly` metadata: `{"included_kids": 1, "max_kids": 4, "extra_kid_price_cents": 499, "max_total_seats": 6}`
- [ ] UPDATE `verity_pro_monthly` is_active=false, is_visible=false
- [ ] UPDATE `verity_pro_annual` is_active=false, is_visible=false
- [ ] INSERT `verity_family_annual`: $149.99/yr, same metadata + `is_annual=true`

### 2.3 — DB migration M4 (subscription columns)

- [ ] Add `kid_seats_paid INTEGER NOT NULL DEFAULT 1` on subscription table (verify table name first)
- [ ] Add `platform TEXT NOT NULL DEFAULT 'stripe' CHECK (platform IN ('stripe', 'apple'))` on subscription table
- [ ] Add `external_subscription_id TEXT`
- [ ] Add `next_renewal_at TIMESTAMPTZ`

### 2.4 — Stripe webhook handler

`web/src/app/api/webhooks/stripe/route.ts` (verify path; create if missing):
- [ ] Handle `customer.subscription.created` → write subscription row
- [ ] Handle `customer.subscription.updated` → update plan + kid_seats_paid from item quantities
- [ ] Handle `customer.subscription.deleted` → mark cancelled
- [ ] Handle `invoice.paid` → flip access on
- [ ] Handle `invoice.payment_failed` → grace period state
- [ ] Idempotent: dedupe by `event.id` to avoid duplicate processing

### 2.5 — Apple webhook handler

`web/src/app/api/webhooks/apple/route.ts` (verify path; create if missing):
- [ ] Handle `SUBSCRIBED` / `DID_RENEW` / `EXPIRED` / `DID_FAIL_TO_RENEW` / `REFUND`
- [ ] Parse product ID to derive plan + kid_seats_paid
- [ ] Idempotent: dedupe by `notificationUUID`

### 2.6 — `web/src/app/api/family/seats/route.ts` (NEW)

- [ ] GET: returns `{ seats_used, seats_paid, max_seats, plan_tier }`
- [ ] POST: change paid seat count → triggers Stripe `subscription_items.quantity` update OR Apple SKU upgrade
- [ ] Permission: `family.seats.manage`
- [ ] Validation: requested seats <= max_total_seats, requested kids <= max_kids

### 2.7 — `web/src/app/api/kids/route.js` updates

- [ ] Pre-flight check: `current_kid_count < kid_seats_paid` else 402 "Add a kid seat to continue"

### 2.8 — `web/src/app/api/kids/[id]/route.js` updates

- [ ] Remove `'date_of_birth'` from `allowed[]` array (DOB is locked post-creation)

### 2.9 — `web/src/app/api/family/config/route.js` updates

- [ ] Drop `verity_family_xl: 4` from DEFAULTS
- [ ] Add `extra_kid_price_cents` to response

### 2.10 — Web paywall + billing UI

- [ ] `web/src/app/profile/settings/billing/page.tsx` — new plan display + seat breakdown
- [ ] Public pricing page (verify path; build if missing) — 3 plan cards, no Pro/XL
- [ ] `web/src/app/profile/family/page.tsx` — seat counter + add-kid-with-cost-confirmation modal

### 2.11 — iOS StoreKit + paywall

- [ ] `VerityPost/VerityPost/StoreManager.swift` — drop XL refs, add 10 new product IDs, add `upgradeToFamilyTier(kidCount:)` helper
- [ ] `VerityPost/VerityPost/SubscriptionView.swift` — 3 plan cards
- [ ] `VerityPost/VerityPost/FamilyViews.swift` — DOB lock (read-only), seat-add confirmation, drop reading_level picker

### 2.12 — Cross-platform conflict UX

- [ ] Web paywall: hide purchase if `subscription.platform = 'apple'`
- [ ] iOS paywall: hide purchase if `subscription.platform = 'stripe'`
- [ ] Show "Manage on [platform]" link instead

### 2.13 — Pro grandfather migration cron

- [ ] `web/src/app/api/cron/pro-grandfather-notify/route.ts` (NEW): identify subscribers 30 days from renewal, send notification email
- [ ] At renewal: webhook auto-migrates Stripe sub Pro → Verity SKU
- [ ] Apple Pro users: in-app banner + manual conversion (no auto-migrate possible)

### 2.14 — Permission gating

- [ ] Add `family.kids.manage` and `family.seats.manage` permission keys (M12)
- [ ] Wire plan-tier checks into `compute_effective_perms`

### 2.15 — Test

- [ ] Stripe test mode: full Verity signup → upgrade to Family → add kid → remove kid → cancel
- [ ] Apple sandbox: same flow on iOS
- [ ] Cross-platform conflict: web sub seen on iOS shows correct UX
- [ ] DOB lock: PATCH `/api/kids/[id]` with date_of_birth field → 400 error

Phase 2 done.

---

## PHASE 3 — Banded generation (target: 10 hours)

### 3.1 — DB migration M5 (age band columns)

- [ ] Add `kid_profiles.reading_band` with default 'kids', backfill from DOB
- [ ] Add `kid_profiles.band_changed_at`
- [ ] Add `kid_profiles.band_history` JSONB
- [ ] Drop `kid_profiles.age_range` (vestigial)
- [ ] Add `articles.age_band` with check constraint
- [ ] Backfill existing kid-safe articles with `age_band='tweens'`
- [ ] Index on `(is_kids_safe, age_band, status, published_at DESC)`

### 3.2 — DB migration M11 (category dedup)

- [ ] Reparent any references from `(Kids)` variants to base categories
- [ ] DELETE `(Kids)` variant rows
- [ ] UPDATE `is_kids_safe=true` on the natural-kid base categories

### 3.3 — DB migration M10 (band-aware RLS)

- [ ] Helper SQL function `kid_visible_bands(profile_id)` returning `text[]`
- [ ] Helper SQL function `current_kid_profile_id()` from JWT
- [ ] Drop old `kid_articles_*` policies (already gone post-Phase-1, just confirm)
- [ ] New policy on `articles` for kid SELECT with band filter

### 3.4 — Editorial guide updates

`web/src/lib/pipeline/editorial-guide.ts`:
- [ ] Add `KIDS_HEADLINE_PROMPT` (ages 7-9 voice)
- [ ] Add `TWEENS_HEADLINE_PROMPT` (ages 10-12 voice)
- [ ] Add `KIDS_ARTICLE_PROMPT` (ages 7-9, 80-120 words, concrete examples)
- [ ] Add `TWEENS_ARTICLE_PROMPT` (ages 10-12, 120-180 words, real news rhythm)
- [ ] Add `KIDS_TIMELINE_PROMPT` (4-6 events, simple)
- [ ] Add `TWEENS_TIMELINE_PROMPT` (4-8 events)
- [ ] Add `KIDS_QUIZ_PROMPT` (easier ramp, friendly)
- [ ] Add `TWEENS_QUIZ_PROMPT` (closer to adult difficulty)
- [ ] Retire old `KID_*` constants (or repurpose as `TWEENS_*`)

### 3.5 — Generate route refactor

`web/src/app/api/admin/pipeline/generate/route.ts`:
- [ ] Extract `runBandChain(band, corpus, cat)` helper running headline → summary → body → grounding → plagiarism → timeline → kid_url_sanitizer → quiz → quiz_verification with band-specific prompts
- [ ] When `audience='kid'`: run `audience_safety_check`, then `Promise.all([runBandChain('kids', ...), runBandChain('tweens', ...)])`
- [ ] Persist BOTH outputs (two `persist_generated_article` calls)
- [ ] Return `{ ok: true, articles: [{ id, age_band: 'kids' }, { id, age_band: 'tweens' }] }`
- [ ] Per-band failure isolation: one failed band doesn't kill the other

### 3.6 — Cluster sibling tracking

- [ ] Add columns to `feed_clusters`: `primary_kid_article_id`, `primary_tween_article_id`
- [ ] Update generate route to set these on success
- [ ] Update cluster detail admin view to show all 3 articles

### 3.7 — Kid iOS app band filter

- [ ] `VerityPostKids/VerityPostKids/Models.swift` — add `readingBand` to `KidProfile`, `ageBand` to `KidArticle`
- [ ] `VerityPostKids/VerityPostKids/KidsAppState.swift` — hold `readingBand`, expose `visibleBands` helper
- [ ] `VerityPostKids/VerityPostKids/ArticleListView.swift` — `.in("age_band", value: visibleBands)` filter
- [ ] `VerityPostKids/VerityPostKids/KidReaderView.swift` — same filter on individual fetch
- [ ] `VerityPostKids/VerityPostKids/KidQuizEngineView.swift` — same filter on quiz pool

### 3.8 — Admin Tweens Story Manager

- [ ] Create shared editor: `web/src/app/admin/_shared/BandedStoryEditor.tsx`
- [ ] Refactor `web/src/app/admin/kids-story-manager/page.tsx` to use shared editor + filter `age_band='kids'`
- [ ] Create `web/src/app/admin/tweens-story-manager/page.tsx` using shared editor + filter `age_band='tweens'`

### 3.9 — Newsroom cluster 3-tab view

- [ ] `web/src/app/admin/newsroom/clusters/[id]/page.tsx` — tabs: Adult / Kids / Tweens
- [ ] Each tab links to or embeds the appropriate manager

### 3.10 — Test

- [ ] Trigger 1 kid generation → verify 2 articles persisted with correct `age_band`
- [ ] Kid iOS app with kids-band profile → only sees `age_band='kids'` articles
- [ ] Kid iOS app with tweens-band profile → sees both `kids` and `tweens` articles
- [ ] Admin: Kids Story Manager shows only kids; Tweens Story Manager shows only tweens
- [ ] RLS test: try to fetch `age_band='tweens'` article as kids-band JWT → blocked

Phase 3 done.

---

## PHASE 4 — DOB correction system (target: 8 hours, parallel with Phase 3)

### 4.1 — DB migrations (M6, M7, M8, M9, M12)

- [ ] M6: DOB immutability trigger
- [ ] M7: Band ratchet trigger
- [ ] M8: `kid_dob_correction_requests` table + indexes
- [ ] M9: `kid_dob_history` audit table
- [ ] M12: `admin.kids.dob_corrections.review` permission seed
- [ ] `admin_apply_dob_correction` RPC

### 4.2 — Parent-side endpoints

- [ ] `web/src/app/api/kids/[id]/dob-correction/route.ts`:
  - POST: insert request, auto-reject older-band without docs
  - GET: list this kid's request history
- [ ] `web/src/app/api/kids/[id]/dob-correction/upload/route.ts`:
  - POST: encrypted doc upload, return URL

### 4.3 — Admin endpoints

- [ ] `web/src/app/api/admin/kids-dob-corrections/route.ts` — list queue
- [ ] `web/src/app/api/admin/kids-dob-corrections/[id]/route.ts` — detail GET
- [ ] `web/src/app/api/admin/kids-dob-corrections/[id]/decision/route.ts` — POST approve/reject

### 4.4 — Cooldown cron

- [ ] `web/src/app/api/cron/dob-correction-cooldown/route.ts` — daily auto-approve younger-band requests > 7 days old with no fraud signals
- [ ] Add to vercel.json cron config

### 4.5 — Web request form

- [ ] `web/src/components/family/DobCorrectionRequest.tsx` (NEW) — modal with form + upload + preview
- [ ] Integrate into `web/src/app/profile/kids/[id]/page.tsx`

### 4.6 — iOS request sheet

- [ ] `VerityPost/VerityPost/FamilyViews.swift` — add `DobCorrectionRequestView`
- [ ] DOB field becomes read-only with "Was this entered incorrectly?" link

### 4.7 — Admin queue page

- [ ] `web/src/app/admin/kids-dob-corrections/page.tsx` — queue list with filters + fraud signals
- [ ] `web/src/app/admin/kids-dob-corrections/[id]/page.tsx` — detail with household context + decision panel

### 4.8 — Email templates

- [ ] `dob_correction_received` (parent submits)
- [ ] `dob_correction_approved` (auto or admin)
- [ ] `dob_correction_rejected` (admin)
- [ ] `dob_correction_documentation_requested`

### 4.9 — Test

- [ ] Submit younger-band correction in staging → wait 7 days (or manually trigger cron) → auto-approves
- [ ] Submit older-band correction without docs → auto-rejects with helpful message
- [ ] Submit older-band correction with docs → pending in admin queue → admin approves → DOB updates + band recomputes + audit row written
- [ ] Trigger M6/M7 attempted bypass → triggers reject

Phase 4 done.

---

## PHASE 5 — Graduation + parent flows (target: 12 hours)

### 5.1 — Endpoints

- [ ] `web/src/app/api/kids/[id]/advance-band/route.ts` — POST `{to: 'tweens' | 'graduated', email?, password?}`
- [ ] `web/src/app/api/auth/graduate-kid/claim/route.ts` — accepts graduation token, completes adult signup

### 5.2 — Birthday cron

- [ ] `web/src/app/api/cron/birthday-band-check/route.ts` — daily, identifies band-boundary crossings, inserts parent notifications + emails
- [ ] Add to vercel.json cron config

### 5.3 — Email templates

- [ ] `band_advance_birthday_prompt`
- [ ] `kid_graduation_account_created`

### 5.4 — Web parent flows

- [ ] `web/src/app/profile/family/page.tsx` — birthday-prompt banner, advance + graduation CTAs per kid
- [ ] `web/src/app/profile/kids/[id]/page.tsx` — band display + advance buttons

### 5.5 — iOS parent flows

- [ ] `VerityPost/VerityPost/FamilyViews.swift` — birthday banner, advance modal, graduation modal (with email/password input)

### 5.6 — Adult onboarding (graduated kid path)

- [ ] `VerityPost/VerityPost/SignupView.swift` — detect graduation token in URL, pre-fill display name
- [ ] `VerityPost/VerityPost/AuthViewModel.swift` — handle graduation token validation
- [ ] `VerityPost/VerityPost/WelcomeView.swift` — graduated welcome screen

### 5.7 — Kid app graduated handoff

- [ ] `VerityPostKids/VerityPostKids/KidsAppRoot.swift` — detect graduated state on launch, show one-time handoff screen, deep link to VerityPost

### 5.8 — Permissions

- [ ] Verify graduated adult account inherits family plan correctly
- [ ] Verify category prefs carry over (kid → adult user prefs)

### 5.9 — Test

- [ ] Set staging kid DOB to 9y 364d, trigger birthday cron → prompt fires
- [ ] Parent triggers advance → kid sees both kids + tweens content
- [ ] Set staging kid DOB to 12y 364d → birthday cron prompts graduation
- [ ] Parent triggers graduation → adult account created, kid app shows handoff, adult app onboards
- [ ] Verify net-zero seat math: kid graduates from Family-2kid → Family-1kid SKU at next renewal

Phase 5 done.

---

## PHASE 6 — Polish + testing (target: 8 hours)

### 6.1 — Reconciliation crons

- [ ] `web/src/app/api/cron/subscription-reconcile-stripe/route.ts` — daily Stripe drift check
- [ ] `web/src/app/api/cron/subscription-reconcile-apple/route.ts` — daily Apple drift check
- [ ] Add both to vercel.json cron config

### 6.2 — Public pricing page

- [ ] `web/src/app/pricing/page.tsx` (new or update) — 3-plan comparison + Family per-kid scaling explanation
- [ ] SEO meta + Schema.org Product markup

### 6.3 — Plan permission gating verification

- [ ] Free user can't bookmark, can't comment, hits metered paywall
- [ ] Verity user has bookmark + comment, no kid features
- [ ] Family user has all + kid app access

### 6.4 — Admin tools polish

- [ ] Plan management page (verify path; basic version OK at launch)
- [ ] Subscriptions support view (lookup by email → full sub state)
- [ ] Family-seats reconciliation manual button (optional)

### 6.5 — Email template polish

- [ ] Review all transactional emails: dob_correction_*, band_advance_*, kid_graduation_*, family_seat_*, verity_pro_migration
- [ ] Tone, branding, links

### 6.6 — Static content

- [ ] FAQ updates: pricing, kid graduation, DOB correction policy
- [ ] Privacy Policy: add DOB-correction process language
- [ ] T&C: confirm new pricing matches what's in DB

### 6.7 — Monitoring + alerts

- [ ] `pipeline_runs.error_type` daily count alert
- [ ] Stripe webhook failure rate alert
- [ ] Apple webhook delivery delay alert
- [ ] DOB correction queue backlog alert (>24h pending)
- [ ] Kid pipeline cost per cluster alert (>2.5× adult baseline)

### 6.8 — Comms cutover

- [ ] Pro grandfather migration emails fire (queued cron from Phase 2)
- [ ] In-app banner: "New family pricing! Add kids for $4.99/mo."
- [ ] Marketing email blast (if applicable)

### 6.9 — Final manual test pass

- [ ] All 18 flows in `08_FLOWS.md` exercised in staging or prod
- [ ] All 50 scenarios in `09_SCENARIOS.md` reviewed for unhandled cases

Phase 6 done. Project complete.

---

## What I won't do without owner action

1. Apply for Apple SBP (owner account)
2. Create Apple SKUs in App Store Connect (owner account)
3. Create Stripe products in dashboard (owner account)
4. Submit iOS apps to App Store (owner account)
5. Apply for AdSense / AdMob (owner account)
6. Send transactional emails from owner's domain (DKIM/SPF setup is owner-side)
7. First production Stripe live charge (owner enters their card)
8. Approve marketing copy + outbound emails (brand voice = owner)

Everything else is mine.

---

## What's still open (need owner before Phase 5+)

- Trial period at launch? (yes 7-day, no, or other)
- Stripe Customer Portal scope? (allow plan changes whitelisted, or disable)
- Free metered paywall threshold (5/mo? 10/mo? different for anon vs verified?)
- Ages 3-6 kid app behavior (gate out, or curated kids-band feed)
- Refund policy (7-day grace, or platform-handled only)
- Adult-transition account email (parent enters at graduation — confirm)
- Stripe + Apple dual-sub conflict policy (block, prefer, warn)

These don't block Phase 0-2. Surface and decide before Phase 5.

---

## Daily ship rhythm

Each phase ends with:
1. Deploy to prod
2. Smoke-test the phase's primary flow
3. Update CHANGELOG.md with phase completion + commit hash
4. Move to next phase

If a phase fails verification: revert, debug, retry. Don't move forward on red.

---

**Status: HELD.** Owner explicitly said "don't start yet" on 2026-04-26. Pre-flight decisions locked, waiting for owner go-signal to begin Phase 0.

When owner says go: start Phase 0, work through phases sequentially, deploy as each phase completes verification.
