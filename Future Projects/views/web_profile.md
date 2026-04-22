# Web — Profile Hub

**File:** `web/src/app/profile/page.tsx` (component `ProfilePageInner`)
**Owner:** Zhuo (cross-surface consistency), Vinh (typography).
**Depends on:** `08_DESIGN_TOKENS.md`, `16_ACCESSIBILITY.md`.
**DB touchpoints:** `users`, `category_scores`, `achievements`, `user_achievements`, `reading_log`, `comments`, `bookmarks`, `categories`, `score_tiers`.

---

## Current state

Tabbed profile hub: overview, activity, categories, milestones. Permissions gates: `profile.header_stats`, `profile.activity`, `profile.categories`, `profile.achievements`, `profile.card_share`, `messages.inbox.view`, `bookmarks.list.view`. Lazy-loaded tabs. Keyboard shortcuts (1/2/3/4 and g+chords) present.

Problems per web-recon:
- Keyboard shortcuts conflict with the no-shortcuts memory — remove.
- Tier progress logic is complex; UI is clear but logic is spread.
- 4 tabs is manageable but horizontal scroll on some widths.

## What changes

### Remove keyboard shortcuts

Per memory: no shortcuts on admin, keep click-driven everywhere. Remove 1/2/3/4 and g+chord from profile too. Tab navigation works via Tab key (standard); no custom bindings.

### Typography pass

Switch font sizing to the new token system (`08_DESIGN_TOKENS.md`). Stat cards use `typography.display` for the number + `typography.meta` for the label.

### Tier ring

The tier progress ring reads from `score_tiers` (DB). Already dynamic. Keep. Styling pass to match token system.

### Score delta on achievement

When a user earns an achievement while viewing this page (rare — usually happens on story detail), show a minimal toast. Don't animate. Don't celebrate. Adult restraint.

### Public profile (`/profile/[id]`)

Separate page per recon. Un-touched except for token-based styling pass. No structural change.

## Files

- `web/src/app/profile/page.tsx` — remove shortcuts, token-ify.
- `web/src/app/profile/[id]/page.tsx` — token-ify.
- `web/src/app/u/[username]/page.tsx` — token-ify.

## Acceptance criteria

- [ ] No keyboard shortcut handlers in profile.
- [ ] Stat cards use token typography.
- [ ] Tier ring reads from `score_tiers` (already does — verify).
- [ ] Tab keyboard navigation via Tab (standard).
- [ ] Accessibility: landmarks (`<main>`, `<nav>`), VoiceOver walkable.

## Dependencies

Ship after `08_DESIGN_TOKENS.md`.
