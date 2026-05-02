# UI/UX Review — Out-of-wave drift bin

Findings spotted outside the active unit, parked until wave-end triage. Each entry: pattern + first sighting + which units likely repeat it. Decide at wave-end whether each becomes a sweep unit (5+ units affected) or gets folded into a per-unit fix.

Format: `S?<n> — <pattern>` — `S?` = sweep candidate, becomes `S<n>` if promoted.

---

## Wave A candidates

### S?1 — White-only chrome backgrounds (top bar + bottom nav)
- **First sighted:** Unit 1 (Home), 2026-05-02
- **Pattern:** `NavWrapper.tsx` top bar (`:393,423`) and bottom nav background hard-code `rgba(255,255,255,0.97)`. In dark mode the chrome is a white slab floating on a dark page. Backdrop-blur amplifies the contrast.
- **Affected units (likely):** every web unit that shows chrome — Home, Browse, Search, Category, Leaderboard, Marketing bundle, Legal sweep, Profile shell, Bookmarks, Notifications, Messages, Following, Recap, Billing. Probably 15+ web units.
- **Fix shape:** swap to `var(--p-bg)` (or a chrome-specific token) + a derived border/shadow that respects `data-theme`. PRINCIPLE §1.1.
- **Decision needed at wave-end:** promote to sweep unit `S1`.

### S?3 — Focus-visible outline hard-coded `#111` (invisible in dark mode)
- **First sighted:** Unit 1 (Home), 2026-05-02 (3-agent pass)
- **Pattern:** `globals.css:349-352` global focus-visible style uses `outline: 2px solid #111111`. In dark mode that outline is invisible against `--p-bg: #0a0a0a`, breaking WCAG 2.4.7 Focus Visible.
- **Affected units (likely):** every web unit with focusable elements — every unit in waves A + B.
- **Fix shape:** swap to `var(--p-ink)` or a dedicated `--focus-ring` token defined once per theme.
- **Decision needed at wave-end:** promote to sweep unit `S3`.

### S?4 — Form input colors hard-coded
- **First sighted:** Unit 1 (Home), 2026-05-02
- **Pattern:** `globals.css:340-348` form input default text `color:#111111` and placeholder `color:#999999`. In dark mode, near-black text on a dark background is unreadable.
- **Affected units (likely):** every web unit with a form — login, signup, search, comments, profile settings, billing, contact, etc.
- **Fix shape:** swap to `var(--p-ink)` text + `var(--p-ink-muted)` placeholder.
- **Decision needed at wave-end:** promote to sweep unit `S4`.

### S?5 — Skeleton shimmer light-mode-only
- **First sighted:** Unit 1 (Home), 2026-05-02
- **Pattern:** `globals.css:391` skeleton shimmer hard-codes `linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)` — appears as a near-white block in dark theme.
- **Affected units (likely):** every web unit that renders a loading skeleton.
- **Fix shape:** define light + dark gradients via CSS custom properties.
- **Decision needed at wave-end:** promote to sweep unit `S5`.

### S?6 — StoryEditor stale subcategory on category change (admin)
- **First sighted:** Slice 2 adversary pass, 2026-05-02
- **Pattern:** `StoryEditor.tsx:1242` category `onChange` updates `story.category` but does NOT reset `story.subcategory`. The subcategory dropdown visually clears (no matching option for new parent) but `story.subcategory` still holds the old ID. On save (line 860), the stale subcategory_id from the previous parent category gets written to the DB.
- **Affected units:** Admin story-manager (Unit 49) and kids-story-manager. KidsStoryEditor likely has the same pattern.
- **Fix shape:** Add `updateStory('subcategory', '')` inside the category onChange handler before or after updating category. One-line fix per editor.
- **Scope:** Admin surface only; not a public-facing bug. Flag when Unit 49 (Newsroom cluster) is reviewed.

### S?2 — Footer links at 11px without hit-target padding
- **First sighted:** Unit 1 (Home), 2026-05-02
- **Pattern:** `NavWrapper.tsx:530-563` global footer renders 14 links + Cookie preferences button at `fontSize:11` with no padding. Tap targets ~14px tall, far below §2.1's 44px floor.
- **Affected units (likely):** every web unit that renders the global footer — same blast radius as S?1.
- **Fix shape:** wrap each link in a min-height:44 inline-flex with vertical padding; row gap stays the same.
- **Decision needed at wave-end:** promote to sweep unit `S2`.
