# Future Projects

**What this is.** The plan for Verity across web, adult iOS, and kids iOS. Every document is self-contained — hand any single MD to any engineer or editor and they can pick up the work without reading the rest.

**What this is not.** Not a redesign spec. Not a mood board. Not marketing copy. Each MD is grounded in a real codebase audit run 2026-04-21: web routes (141 mapped), adult iOS (19 views), kids iOS (full scene inventory), Supabase live state, and design tokens across all three surfaces.

## How to read this folder

1. Start with `00_CHARTER.md` — the commitments.
2. Then `18_ROADMAP.md` — the order of operations across 12 weeks.
3. Then pick the strategy doc for whatever you're working on.
4. For implementation: go to `views/` for the per-screen spec, `db/` for the schema change.
5. For the AI pipeline: `24_AI_PIPELINE_PROMPTS.md`.
6. For mockups: open `mockups/index.html` in a browser.

## Structure

```
Future Projects/
├── README.md                        this file
├── 00_CHARTER.md                    the commitments
├── 01_POSITIONING.md                what Verity is, in one paragraph
├── 02_PRICING_RESET.md              pricing teardown
├── 03_TRIAL_STRATEGY.md             trials don't exist in DB yet — fix it
├── 05_EDITOR_SYSTEM.md              editor team / front-page curation
├── 06_DEFECTION_PATH.md             "See also" inline link to peer / primary source
├── 07_KIDS_DECISION.md              flagship vs sidecar
├── 08_DESIGN_TOKENS.md              the token system as infrastructure
├── 09_HOME_FEED_REBUILD.md          dated editorial front page
├── 10_SUMMARY_FORMAT.md             prose summary, no labels; headline/body/timeline rules
├── 11_PAYWALL_REWRITE.md            wall → invitation, every surface
├── 12_QUIZ_GATE_BRAND.md            making the moat visible
├── 13_QUIZ_UNLOCK_MOMENT.md         the signature interaction
├── 14_KIDS_CHOREOGRAPHY.md          Pixar-level moments
├── 15_PERFORMANCE_BUDGET.md         sub-second, zero CLS, accessible
├── 16_ACCESSIBILITY.md              Dynamic Type, VoiceOver, Reduce Motion
├── 18_ROADMAP.md                    12-week sequenced plan
├── 19_MEASUREMENT.md                what success looks like
├── 20_RISK_REGISTER.md              what could go wrong, per move
├── 24_AI_PIPELINE_PROMPTS.md        V4 pipeline prompts, paste-ready
│
├── views/                           one MD per screen
├── db/                              one MD per schema change
└── mockups/                         static HTML renders, serve on localhost:4000
```

Removed in the 2026-04-21 cleanup:
- `04_TRUST_INFRASTRUCTURE.md` — scaffolding cut; the article is the product.
- `17_REFUSAL_LIST.md` — no public refusals page.
- `db/07_standards_doc_table.md` — no public standards doc.
- `mockups/web-standards.html`, `mockups/web-refusals.html`, `mockups/web-corrections.html`, `mockups/web-masthead.html`.

## The evidence base

All recon dated 2026-04-21.

- `plans` table: 9 rows across 4 tiers. **`trial_days=0` on every row.** Verity tier is `reduced_ads=true, ad_free=false` — ad-free starts at Pro. Family + Family XL rows exist but `is_active=false, is_visible=false`.
- `feature_flags`: only one row — `v2_live`.
- Web: 141 routes. Quiz + Discussion launch-hidden on `/story/[slug]` via `{false && ...}`. Regwall state in sessionStorage.
- Adult iOS: 19 views. Zero emoji. `SubscriptionView` has an infinite `Loading…` failure path.
- Kids iOS: strong choreography on Streak/Greeting/QuizPass/BadgeUnlock scenes. `ParentalGateModal` has zero callers. No `KidPressStyle`.
- Supabase has no `corrections`, `editorial_charter`, `standards_doc`, `trust_events`, or `defection_links` tables. Corrections, standards_doc, and trust_events are now deferred per the 2026-04-21 Charter update.

## Working rules inside this folder

1. Every doc names a panelist owner in the header.
2. Every doc cites the evidence — real file paths, real table rows.
3. Every doc names its files.
4. Every doc has acceptance criteria.
5. Every doc names what it does NOT change.
6. Shipped status is tracked in `Current Projects/FIX_SESSION_1.md` per CLAUDE.md, not in this folder.

## Panelist roster (for ownership headers)

**Strategy:** Bezos, Lessin, Thompson, Ali
**UI:** Spalter, Ive, Vinh
**UX:** Zhuo, Wroblewski, Weinschenk
**Developers:** Rauch, Abramov, Harris
**Marketers:** Dunford, Godin, Sutherland
**Media:** Huffman (Reddit), Drudge, Portnoy, Scott (Fox), Thompson (CNN), Veerasingham (AP), Bascobert (Reuters)
