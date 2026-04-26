# db/08 — Feature Flags Expansion

**Owner:** Rauch (infrastructure), Ali (launch-phase hiding).
**Purpose:** Current `feature_flags` has one row (`v2_live`). Per-feature killswitches are needed per the launch-phase memory: "hide via gates/flags, keep state + queries + types alive so unhide is one-line flip."
**Migration filename:** no schema change required (table exists) — this is a data migration.

---

## Current state (verified 2026-04-21)

`feature_flags` table has one row:

| key | is_enabled | is_killswitch | rollout_% | description |
|-----|------------|---------------|-----------|-------------|
| v2_live | true | false | 100 | Master rollback switch |

## The change

Seed additional flags for per-feature kill-switch control. These let the team hide features behind flags rather than removing code — supports the "unhide is a one-line flip" pattern.

### SQL

```sql
INSERT INTO feature_flags (key, is_enabled, is_killswitch, rollout_percent, description) VALUES
  ('quiz_gate_visible', true, false, 100, 'Shows the quiz gate on article pages. Disable to hide quiz + comments site-wide.'),
  ('comments_enabled', true, false, 100, 'Comment thread visible on story pages. Disable to hide comments entirely.'),
  ('dms_enabled', false, false, 0, 'Direct messaging. Off at launch; flip true to enable Pro-tier DM feature.'),
  ('defection_links_visible', true, false, 100, 'See-also links below articles.'),
  ('kids_app_available', false, false, 0, 'Controls family-tier visibility on web and Apple-account-gated launch.'),
  ('expert_qa_kids', true, false, 100, 'Kid-to-expert question submit flow.'),
  ('adsense_enabled', false, false, 0, 'Google AdSense inventory on free tier. Off until AdSense account approved.'),
  ('trial_offered', true, false, 100, 'Trials shown on paywall. Off reverts to direct-start copy.'),
  ('editorial_frontpage', false, false, 0, 'Use front_page_state table instead of algorithmic feed. Off = old HomePage logic.'),
  ('corrections_public', true, false, 100, 'Corrections feed at /corrections is publicly visible. Disable hides feed but keeps writes.'),
  ('trust_report_button', true, false, 100, 'See-a-problem button on article pages.'),
  ('masthead_editor_visible', false, false, 0, 'Show on-shift editor on home masthead. Off until editor rotation is live.'),
  ('recent_articles_feed', true, false, 100, 'The /recent chronological feed (secondary to curated home).'),
  ('kids_leaderboard_family_scope_only', true, false, 100, 'Kids leaderboard is family-only. Disable only with explicit COPPA review.')
ON CONFLICT (key) DO NOTHING;
```

## Categorizing flags

Five categories:

1. **Launch-phase hides** (enabled will be true at some point; currently false): `dms_enabled`, `kids_app_available`, `adsense_enabled`, `editorial_frontpage`, `masthead_editor_visible`.
2. **Post-launch features** (can be disabled in emergency): `quiz_gate_visible`, `comments_enabled`, `defection_links_visible`, `expert_qa_kids`, `trial_offered`, `corrections_public`, `trust_report_button`, `recent_articles_feed`.
3. **Policy flags** (semantic protection, not just UI toggles): `kids_leaderboard_family_scope_only` — enabling the "global" scope would require COPPA review, so this flag stays as a semantic gate in code.
4. **Kill-switches** (`is_killswitch=true`): reserved. Currently only `v2_live` — stays.
5. **Reserved / future** — do not pre-seed flags that don't yet have a planned call site. Flag-creep is its own problem.

## Callers

- `web/src/lib/featureFlags.js` — existing lib, reads flags with 10s cache.
- `/admin/features/page.tsx` — existing admin UI; flags render in the list.
- Code call sites — wherever a feature conditionally renders:
  - `web/src/app/page.tsx` — `if (!isFlagEnabled('editorial_frontpage')) return <LegacyHomePage />`
  - `web/src/app/story/[slug]/page.tsx` — quiz block, comments, defection links, see-a-problem button all wrapped.
  - `web/src/app/profile/kids/page.tsx` — `kids_app_available` wraps the whole page.
  - Story editor — `defection_links_visible` gates the editor UI.

## Rollout percentage

Supports gradual rollout via `rollout_percent`. Currently the `featureFlags.js` lib respects full-or-nothing. If we want gradual rollout, `isFlagEnabled()` needs to read `rollout_percent` and bucket users (e.g., hash user_id mod 100 < rollout_percent).

Implement the percentage-respecting logic as a v2 of the flag lib; not blocking for the initial seeding.

## Acceptance criteria

- [ ] All flags seeded.
- [ ] `/admin/features` renders and allows toggling.
- [ ] `isFlagEnabled(key)` works for every seeded flag.
- [ ] Feature-gate wrappers added at call sites as surfaces ship.
- [ ] `feature_flags.rollout_percent` respected if gradual-rollout logic ships (stretch).

## Dependencies

Seed early — Phase 1. Ship before any feature that needs a flag-guard.
