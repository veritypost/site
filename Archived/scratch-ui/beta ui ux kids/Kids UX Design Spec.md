# Kids UX Design Spec — Beta Redesign

Non-destructive design proposal for the Verity Post kids experience. Nothing in this folder touches production code. Prototypes render at `http://localhost:4000` and mirror the layouts below so the PM can click through them.

Target audience: 8–13-year-old readers on the Family plan, plus their parents who run the dashboard.

## Ground rules

- **Zero emojis anywhere.** No decorative glyphs, no Unicode symbols, no flames for streaks, no stars for badges. Colour, typography, and geometry carry the visual weight.
- **No social affordances.** No follow, no DM, no comment, no mention, no tap-through to another family's profile. Kids only see their own activity and ranked display names.
- **PIN-gated exit only** (Pattern B per D34). No PIN at entry to kid mode from the parent session; PIN required to switch profile or leave kid mode.
- **Per-kid theme colour.** Every kid picks an avatar colour at profile creation; that colour becomes the accent for headers, tile highlights, progress fills, tab selections. Creates a feeling of "my space."
- **Chunky, tactile, rounded.** 16–22 px corners on tiles, 10–14 px on pills, oversized touch targets (56 px minimum), visible press feedback. Designed for fingers, not mouse pointers.
- **Kid-safe content only.** All queries filter `is_kids_safe = true`. Adults never see kids' leaderboard entries; kids never see adult articles.

Shared tokens (used by the prototypes in `styles.css`):

```
--bg: #ffffff
--card: #f7f7f7
--border: #e5e5e5
--text: #111111
--muted: #666666
--danger: #dc2626
--success: #16a34a
--warn: #b45309

Kid accent palette (pick one per profile):
emerald  #10b981
amber    #f59e0b
blue     #3b82f6
rose     #f43f5e
violet   #8b5cf6
pink     #ec4899
indigo   #6366f1
teal     #14b8a6

Typography: system UI stack, rounded weight on iOS ("SF Pro Rounded" → "system-ui"),
heavy weights (700–900) for kid-facing headers, regular for body.
```

---

## 1. Kid Home

### Current state (for reference)

- `site/src/app/kids/page.js:28-258` — profile picker → category grid → article list. One long screen with the greeting, categories, and stories all stacked.
- `site/src/app/kids/page.js:70-75` — pulls every `is_kids_safe=true` category **including sub-categories**, producing a mixed-hierarchy grid (Bug 58).
- `site/src/app/kids/page.js:19-26` — `stripKidsPrefix` masks DB naming drift at render time (Bug 63).
- iOS equivalent: `VerityPost/VerityPost/KidViews.swift:102–388` (`KidHomeView`). Has a streak-dot row and horizontal scroll that web lacks.

### Problems to fix in the redesign

1. The greeting, category grid, and article list compete on the same screen — no visual hierarchy tells the kid where to look first.
2. No search, despite the prompt "What do you want to explore today?" reading like it invites one.
3. Sub-categories leak into the top-level grid when they shouldn't (Bug 58).
4. Articles list is plain grey cards — zero reward for tapping through, no indication of what the article is about visually.
5. Nothing surfaces what the kid has been doing — no "continue reading," no streak status, no daily progress.

### Proposed layout

Three stacked zones, each with a distinct purpose:

```
+---------------------------------------------------------------+
| GREETING BAND (kid's accent colour, full width)               |
|   "Hi, Maya"                           [streak chip: 5 days]  |
|   "What do you want to explore today?"                        |
|   [search input with placeholder "Try: oceans, Mars, climate"]|
+---------------------------------------------------------------+
| TODAY ROW (horizontal scroll, 2–3 cards visible)              |
|   [Today's pick]  [Continue reading]  [New expert session Fri]|
+---------------------------------------------------------------+
| CATEGORY GRID (2 columns on phone, 3 on tablet/web)           |
|   [Science]  [World]                                          |
|   [Nature]   [Space]                                          |
|   [Sports]   [Arts]                                           |
+---------------------------------------------------------------+
| (Once a category is picked, the grid collapses to a pill row  |
|  and the article list replaces the grid area below it.)       |
+---------------------------------------------------------------+
| FOOTER: VP 3-tab bottom nav (Home | Leaderboard | Profile)    |
+---------------------------------------------------------------+
```

**Greeting band**
- Background: `avatar_color` of the active kid at 100% (not a gradient — solid colour reads cleaner without decoration).
- Left: `Hi, {first name}` in 26 px heavy rounded white. Under it: "What do you want to explore today?" at 15 px regular white/90%.
- Right: streak chip — small white capsule containing the number only ("5") above a lowercase label "day streak". No flame. If the kid is at 0, the chip shows "Start a streak" instead of a zero.
- Search: full-width pill input, white with subtle inner border, placeholder cycles through 3 category examples.

**Today row**
- Horizontal carousel with 2 cards visible on mobile.
- Card types:
  - **Today's pick** — one curated kid-safe article (admin-editorial pick via a new `articles.kids_featured_at` field, fall back to most recent kid-safe article if none).
  - **Continue reading** — if the kid has a `reading_log` row with `completed_at IS NULL` in the last 7 days, show the article with a progress dot row.
  - **Next expert session** — if a session is scheduled in the next 48 hours, show it as a card with date/time and expert name. Tapping opens `/kids/expert-sessions/[id]`.
- If none of these three apply, hide the row entirely (don't pad the screen with empty state).

**Category grid**
- 2 columns on mobile, 3 on web ≥ 720 px.
- Tiles are coloured squircles (24 px radius). Each category has its own colour — reuse the `Kid.colorForCategory` deterministic hash from `VerityPost/VerityPost/KidViews.swift:30-33` on web so the colour is stable across sessions.
- Tile content: category name in 20 px heavy rounded white, centered. **Nothing else.** No emoji, no icon, no count. The colour IS the icon.
- Active category: the grid collapses into a horizontal pill row (category names as pills) and the article list fills the space below. One tap "back to all categories" pill at the left of the row.
- **Filter: `is_kids_safe = true AND parent_id IS NULL`** — fixes Bug 58 at the data layer. Do not use `stripKidsPrefix` at render time; assume a data migration has normalised names (Bug 63).

**Article list (after category pick)**
- Full-width rows, not tiles. Each row ~88 px tall.
- Row anatomy:
  - Left: a 56×56 coloured square with the first letter of the category name in white (uses the category's accent). Replaces an image thumbnail (images are noisy and kid-safe image moderation is an extra surface). If an article has a vetted `kid_hero_image` in future, swap in.
  - Middle: `kid_title` in 15 px heavy, then `kids_summary` in 13 px muted, max 2 lines with ellipsis.
  - Right: a small "3 min read" duration label, 11 px muted, uppercase.
- Tap → `/story/{slug}` (existing article surface — quiz + kid-safe-aware).
- Empty state: "No stories in this category yet. Try another one." 13 px muted, centered, 40 px top padding.

**Search**
- Tapping the search field in the greeting band expands an overlay with recent queries (client-side) and a single result list that mixes categories and article matches.
- Search only kid-safe articles and kid-safe categories.
- No autocomplete for user names — there is no kid user search (D12).

**Information hierarchy summary**
1. Who the kid is + what's hot today (greeting + today row)
2. What they could read (categories)
3. What they picked (articles for one category)

### Interaction notes

- Category tile press: scale to 0.96, haptic impact on iOS (matches `KidPressStyle` in `VerityPost/VerityPost/KidViews.swift:483-489`). Web: `transform: scale(0.96)` on `:active`.
- Swipe horizontally on the today row to browse.
- Pulling down at the top refreshes (on iOS) or triggers the existing Next.js route refresh on web.

### Falls short in current code

- `site/src/app/kids/page.js:175-198` — categories are dull grey boxes at 24 px padding. Redesign gives them their stable hash colour.
- `site/src/app/kids/page.js:239-245` — article cards have no duration, no category mark, no hierarchy.
- No "today" row on either platform.
- iOS at `VerityPost/VerityPost/KidViews.swift:94-388` has a streak-dots row that web lacks — the redesign promotes the dots into the streak chip (simpler, same signal) and uses the today row instead.

---

## 2. Kid Leaderboard

### Current state

- Web: `site/src/app/kids/leaderboard/page.js:1-133` — **family-only**. No global view exists on web (Bug 52 parity gap). Uses `/api/family/leaderboard`.
- iOS: `VerityPost/VerityPost/KidViews.swift:491–735` — has Global / Family / Category scopes. Compliant with D12 as clarified 2026-04-16.

### Problems to fix

1. Web has no global kids leaderboard at all — iOS already has one.
2. Family leaderboard on web shows kids and adults mixed, labelled "Kid" / "Adult" (`site/src/app/kids/leaderboard/page.js:117-118`). That framing is fine but the visual weight makes it feel like a quiz score grid, not a friendly household scoreboard.
3. No age-appropriate framing — the current copy "Who in your family has been reading the most?" is OK, but there's no encouragement for the bottom of the board.
4. No category lens on web (iOS has it at `VerityPost/VerityPost/KidViews.swift:562-589`).

### Proposed layout

```
+---------------------------------------------------------------+
| HEADER BAND (kid's accent colour, 120 px tall)                |
|   "Leaderboard"                                               |
|   "Who's reading the most this week?"                         |
+---------------------------------------------------------------+
| SEGMENT CONTROL (sticky, centered, 3 segments)                |
|   [ All kids ] [ My family ] [ By topic ]                     |
+---------------------------------------------------------------+
| (My family view)                                              |
|   [ You card: big your-accent badge, your rank, score diff    |
|     to next person, "up 2 places this week" ]                 |
|   - Row 1: avatar, name, Kid/Adult, score                     |
|   - Row 2: ...                                                |
|                                                               |
| (All kids view)                                               |
|   [ You card with global rank + "You beat 84% of readers" ]   |
|   - Ranked list of top 50 kid display names                   |
|                                                               |
| (By topic view)                                               |
|   [ Category chip row: Science | World | Nature | ... ]       |
|   - Leaderboard scoped to the chosen category                 |
+---------------------------------------------------------------+
```

**Header band**
- Full-width coloured band in the kid's accent, 120 px tall.
- Title: "Leaderboard" 26 px heavy rounded white.
- Subtitle: "Who's reading the most this week?" 14 px medium white/90%.
- No back button in kid mode — the bottom tab bar handles nav.

**Segment control**
- Single row, 3 equal segments: `All kids` / `My family` / `By topic`.
- Active segment: filled with the kid's accent, white text.
- Inactive: transparent with border.
- Persist last choice in `localStorage` (web) / `@AppStorage` (iOS) keyed per kid profile.

**"You" card (top of list, both scopes)**
- Card the width of the viewport, 24 px radius, kid's accent at 8% as background with a 2 px accent border.
- Big avatar bubble on the left (72 px), the kid's first letter in their accent colour on white.
- Middle: "You" label, their rank ("#12 this week"), and a friendly delta line:
  - If rank improved: "Up 3 places since Monday"
  - If rank held: "Steady — same as last week"
  - If rank dropped: "Two new readers passed you — catch up!" (encouraging, not punishing)
- Right: their score in 28 px heavy. Below the score: small "pts" label 10 px muted uppercase.
- Never show decline as red; never punish. Colour stays in the accent.

**Ranked rows**
- Each row: 68 px tall, white background, 2 px border.
- Anatomy:
  - Left: rank medallion — 40 px circle. Rank 1 filled with gold (`#f5b800`), rank 2 silver (`#a6a6a6`), rank 3 bronze (`#cd7f32`), ranks 4+ white with a thin grey border. Number inside, 18 px heavy.
  - Avatar: 44 px circle in the reader's own avatar colour (for All kids this is the kid's own chosen colour — never their parent's). First letter inside.
  - Middle: display name 16 px heavy. Under it in muted 11 px: for Family view "Kid" or "Adult" (existing behavior); for All kids view, the kid's score band e.g. "Rising reader" / "Regular" / "Super reader" based on score buckets (no family identifier, no parent info — D12).
  - Right: score 22 px heavy in kid's accent colour.

**All kids scope (NEW on web)**
- New API: `/api/kids/global-leaderboard` that mirrors the iOS query at `VerityPost/VerityPost/KidViews.swift:672-693`.
- Select only: `kid_profiles.id, display_name, verity_score, avatar_color`. No parent_user_id, no username, no email. Server-enforced via a DB view or RPC.
- Do not make rows tappable. No navigation on row tap. Score and name only, per D12 clarification.
- Limit to top 50. Below that, show "… and {count} more readers" as a muted footer with no action.

**By topic scope (NEW on web)**
- Category chip row at the top, horizontal scroll, pills identical to the home page category chips.
- Picking a chip re-queries `category_scores` scoped to `category_id` with `kid_profile_id IS NOT NULL` (same as iOS at line 658-664).
- The empty state copy varies by scope (mirror iOS at line 591-597):
  - All kids empty: "No readers ranked yet — be the first!"
  - Family empty: "Nobody in the family yet!"
  - By topic empty: "No readers in this category yet."

### Age-appropriate framing

- Never display a gap like "You're 5,000 points behind the leader" — that's demoralising. Instead: "You beat X% of readers this week" or "Read 3 more articles to jump a place."
- Weekly resets on the All kids scope. The permanent all-time ranking is hidden — kids don't need it. Weekly makes losing tolerable because next week is a fresh shot.
- No negative colour (no red). Declines are muted grey. Gains are the kid's accent colour.

### Falls short in current code

- `site/src/app/kids/leaderboard/page.js:88-127` — rows are dense and adult-looking, no delta context, no "you" card.
- Web is missing global + by-topic scopes (Bug 52 parity gap).
- `site/src/app/kids/leaderboard/page.js:97-104` — rank medallion is grey for all ranks. Redesign gives 1/2/3 distinct colours so there's a clear podium without needing trophy emoji.

---

## 3. Kid Profile

### Current state

- `site/src/app/kids/profile/page.js:198-370` — header band (kid's accent) → 4 stat cards → badges grid → bookmarks → Switch / Exit buttons with PIN modal.
- iOS: `VerityPost/VerityPost/KidViews.swift:743-977` (`KidProfileView`). Similar shape, same PIN modal.
- **Bug 59:** web shows `parentStreak` (parent's streak_current) on the kid's own Day streak tile.

### Problems to fix

1. Streak tile is wired to the parent's streak (Bug 59) — kid sees someone else's number as their own.
2. Four stat cards are equally weighted, so the kid's primary number (Verity Score) doesn't stand out.
3. Badges are identified only by name text. With no icon and no colour differentiation, a grid of three grey cards reading "Week 1", "Curious mind", "Nature lover" looks the same to a kid.
4. The bottom actions (Switch / Exit) are both fairly heavy styles — the action the kid is most likely to want (switch to a sibling) and the one they shouldn't use casually (leave kid mode) look similar.
5. No visibility into streak freezes used/remaining, despite D19 giving kids 2/week.

### Proposed layout

```
+---------------------------------------------------------------+
| IDENTITY BAND (kid's accent colour, 180 px tall)              |
|   [88px avatar bubble, white fill, kid's first letter]        |
|   "Maya"                                                      |
|   "Joined March 2026 · Verity Family"                         |
+---------------------------------------------------------------+
| VERITY SCORE HERO CARD (overlaps band by 32 px)               |
|   Big number centered, "Verity Score" label                   |
|   Thin progress bar → next milestone                          |
+---------------------------------------------------------------+
| 3-TILE STAT ROW                                               |
|   [Articles read] [Day streak] [Badges]                       |
+---------------------------------------------------------------+
| STREAK SECTION                                                |
|   Week row: 7 dots, filled for days the kid read              |
|   "2 freezes left this week"                                  |
+---------------------------------------------------------------+
| BADGES                                                        |
|   3-col grid of named achievement tiles                       |
|   Each tile: badge colour band + name + one-line unlock rule  |
+---------------------------------------------------------------+
| SAVED ARTICLES                                                |
|   Same row style as kid home                                  |
+---------------------------------------------------------------+
| ACTIONS                                                       |
|   [ Switch profile ]   (secondary, lower contrast)            |
|   [ Exit kid mode ]    (primary, full-width, dark)            |
+---------------------------------------------------------------+
```

**Identity band**
- 180 px tall coloured band. Centre-aligned avatar (88 px), name under it (22 px heavy white), join date + plan sub-label (13 px white/80%).
- No streak pill here — streak gets its own section below.

**Verity Score hero**
- Card that overlaps the band by 32 px so it feels like it sits on the accent.
- Big number (40 px heavy), label "Verity Score" below (11 px uppercase muted).
- Under that: a 4 px progress bar filled in the kid's accent showing distance to the next milestone (e.g., "120 pts to Super Reader"). Milestones come from existing achievements keyed by score thresholds.
- **Why elevate Verity Score:** it's the only stat that captures "I'm getting better at this." Articles read and streak are habit signals; Verity Score is the reward signal. Making it the hero is the most kid-rewarding framing without needing gold/trophy glyphs.

**3-tile stat row**
- `Articles read` = `kid_profiles.articles_read_count`
- `Day streak` = `kid_profiles.streak_current` — **fix Bug 59 by selecting `streak_current` on the `kidRow` query (currently missing from `site/src/app/kids/profile/page.js:58-60`) and rendering `kid.streak_current` in place of `parentStreak`.**
- `Badges` = count of `user_achievements` rows for this kid
- Each tile: 16 px radius, white, 2 px border, 16 px padding. Number 28 px heavy, label 10 px uppercase muted.

**Streak section (NEW)**
- Row of 7 dots representing Mon–Sun. Each dot is either:
  - Filled in kid's accent (read that day)
  - Outlined (didn't read / future day)
  - Outlined with an inner X (no glyph — a dashed border instead) for a used freeze
- Below: "2 freezes left this week" or "1 freeze used this week" (D19).
- No flame, no fire colour. Accent colour only.

**Badges**
- 3-column grid on mobile. Tile anatomy:
  - 6 px coloured top band — each achievement category gets a colour from the kid palette (reading = blue, quiz-mastery = amber, exploration = violet, etc.). This is the visual differentiator in lieu of icons.
  - Body: badge name (13 px heavy, 2 lines max), description (11 px muted, 2 lines max).
  - Earned badges: full colour band, full opacity.
  - Locked badges: greyed band, 60% opacity, name still readable. Gives the kid something to aim at.
- Empty state: a placeholder tile with copy "Read your first article to earn your first badge."

**Saved articles**
- Identical row style to kid home article list. Pulls from parent's bookmarks filtered `is_kids_safe = true` (current behaviour at `site/src/app/kids/profile/page.js:85-91`).
- Empty state copy: "Bookmark kid-friendly stories to find them here."
- Cap at 20 (current limit) with a muted "Show more" if more exist.

**Actions**
- **Switch profile** — secondary: grey background, dark text, 14 px bold.
- **Exit kid mode** — primary: dark background (#111), white text, full width.
- Both trigger the same PIN modal as today. Modal copy already differentiates them at `site/src/app/kids/profile/page.js:326-328`.
- Put a subtle "Parent PIN required" helper text (11 px muted) above the Exit button so kids aren't surprised by the modal.

### Falls short in current code

- `site/src/app/kids/profile/page.js:26-95` — wires `parentStreak` to the Day streak tile (Bug 59).
- `site/src/app/kids/profile/page.js:241-251` — badges are identical grey tiles; no visual hierarchy between categories of achievements.
- `site/src/app/kids/profile/page.js:283-305` — Switch and Exit both render as full-width buttons with comparable weight; kids hit Exit by accident.
- No streak-week row; no freeze-remaining counter (D19).

---

## 4. Kid Expert Sessions

### Current state

- List: `site/src/app/kids/expert-sessions/page.js:26-55` — flat list of upcoming sessions. LIVE badge appears if `now` is between `scheduled_at` and end.
- Room: `site/src/app/kids/expert-sessions/[id]/page.js:64-127` — title + description, kid picker for "Ask as", question textarea, Q&A log.
- iOS: `VerityPost/VerityPost/KidViews.swift:980-1047` (`KidExpertSessionView`). Minimal — browser web view wrapper suggestion in the comments, but currently renders a placeholder.

### Problems to fix

1. The sessions list looks like an email list — no sense of event. A kid landing on it won't feel like "oh, something cool is happening Friday."
2. In the room, the "Ask as" flow is awkward — kids don't pick who they are, the active kid profile is already known. The picker only makes sense for parents testing.
3. Past sessions are hidden entirely (the list only shows `status=scheduled`). Kids can't revisit the answers from last week's session.
4. No countdown, no "next session in 2 days" copy, no calendar chip.
5. Submitted-question state is a small green flash that disappears quickly — kid doesn't know if the expert saw it.

### Proposed layout

**List screen**

```
+---------------------------------------------------------------+
| HEADER BAND (kid's accent colour, 160 px tall)                |
|   "Expert Sessions"                                           |
|   "Ask a real scientist, historian, or reporter — live."      |
+---------------------------------------------------------------+
| NEXT-UP HERO CARD (overlaps band by 32 px)                    |
|   "Live in 2 hours"                                           |
|   Session title                                               |
|   Expert name · category · duration                           |
|   [ Join when live ]  (disabled until LIVE, then filled)      |
+---------------------------------------------------------------+
| UPCOMING                                                      |
|   Scheduled cards, compact. Date chip on the left.            |
+---------------------------------------------------------------+
| PAST SESSIONS                                                 |
|   Cards showing "Replay Q&A" — links to the answered log.     |
+---------------------------------------------------------------+
```

**Next-up hero card**
- Dominates the top. Big countdown text (dynamic: "In 2 hours", "Tomorrow at 4 PM", "LIVE NOW").
- Session title in 20 px heavy, 2 lines max.
- Expert name + title (e.g., "Dr. Sanchez · Marine biologist") — pulled from `users.display_name` + `users.expert_title` (already in the query at `site/src/app/kids/expert-sessions/[id]/page.js:27`).
- Category tag pill using that category's colour.
- Primary button: `Join when live` — disabled (grey) until the session is live; turns filled in the kid's accent when `isLive = true`.
- When live, a small pulsing dot (CSS animation, not a glyph) in the top-right corner of the card, red (`#dc2626`).

**Upcoming list**
- Cards 72 px tall, white, 1 px border.
- Left: date chip (48×48 coloured square in category colour, "FRI" top line heavy, "18" bottom line 20 px heavy).
- Middle: title (14 px heavy), expert + category (11 px muted).
- Right: time in kid's local timezone (11 px muted).
- Tap → detail screen.

**Past sessions (NEW)**
- Same row style. Left chip uses grey instead of the category colour.
- Label change: "Replay Q&A" (past tense). Tap → detail screen in read-only mode (no textarea).
- Date chip reads the session date; session title retained for discoverability.

**Detail / room screen**

```
+---------------------------------------------------------------+
| HEADER: category-coloured band                                |
|   "LIVE" pulsing chip (if live)                               |
|   Title                                                       |
|   Expert name · Expert title · scheduled_at                   |
+---------------------------------------------------------------+
| SESSION DESCRIPTION  (if set)                                 |
+---------------------------------------------------------------+
| ASK A QUESTION (only if LIVE)                                 |
|   [ textarea 3 lines, 180 char limit ]                        |
|   [ Send question ]                                           |
|   (Kids profile is inferred from ACTIVE_KID_KEY — no picker.) |
+---------------------------------------------------------------+
| YOUR QUESTION (if submitted)                                  |
|   Quoted, muted background, status: "Waiting for expert..."   |
|   Updates to "Answered" with the expert's reply below.        |
+---------------------------------------------------------------+
| EVERYONE'S QUESTIONS (approved + answered only)               |
|   - Q/A pairs, question on top, answer below in a green card  |
|   - Unanswered approved questions show "Waiting..."           |
+---------------------------------------------------------------+
```

**Interaction notes**
- Submit flow: optimistic — question appears in the "Your question" slot instantly. Server round-trip happens in the background. On failure, show a retry affordance.
- Character counter under the textarea, yellow at 150+, red at 180.
- Send button disabled until there's text + the session is live.
- Kids pose questions as their active profile automatically — drop the "Ask as" picker at `site/src/app/kids/expert-sessions/[id]/page.js:81-91`. Infer from `localStorage.vp_active_kid_id`. Parents opening the page from a non-kid context get routed back to `/kids` instead of being given a picker.
- After posting, show a persistent "waiting for expert" state (not a 2-second flash). Poll the questions list every 15 s while the session is live.

**Event feel**
- Make the copy excited without emoji: "Live in 2 hours", "Happening now", "Replay the Q&A" — temporal urgency instead of decorative symbols.
- The coloured header bands reuse category colours for continuity with the home grid.
- Pulsing dot for LIVE status replaces any "LIVE" badge that reads like a news banner.

### Falls short in current code

- `site/src/app/kids/expert-sessions/page.js:31-52` — flat list, no hero, no past sessions.
- `site/src/app/kids/expert-sessions/[id]/page.js:81-91` — redundant "Ask as" picker; should read active kid from localStorage.
- `site/src/app/kids/expert-sessions/[id]/page.js:76-77` — `flash` state is a 13 px green line that vanishes; redesign makes the submitted-question state permanent until answered.

---

## 5. Parent Dashboard

### Current state

- List: `site/src/app/profile/kids/page.js:24-234` — trial banner, kid list, create form, COPPA consent, PIN setup.
- Per-kid: `site/src/app/profile/kids/[id]/page.js:1-136` — stats, recent quiz attempts, achievements, streak-freeze action.
- **Bug 2 + 61:** destructuring shape mismatch means `kids` and `trial` are always `[]` and `{}` → page renders empty for every parent.

### Problems to fix (design-level)

1. Parents opening this page see an empty state even when they have kids (Bug 2 + 61) — spec assumes the destructuring bug is fixed separately, but flagging here because the empty state currently looks like the feature doesn't work.
2. No at-a-glance weekly family snapshot — parents have to click into each kid to see activity. D24 specifies a Weekly Family Reading Report that should have a home here.
3. Trial banner is tangled with the kid list — three states (no trial, trial active, trial expired) render inline, making the page flicker visually as data loads.
4. COPPA consent form is embedded in the kid creation form — long, daunting, and mobile-unfriendly. Should be a modal or a distinct step.
5. Per-kid dashboard is text-heavy and looks like an admin panel — no identity/theme, no visual grouping.

### Proposed layout — list view

```
+---------------------------------------------------------------+
| BREADCRUMB: ← Back to settings                                |
+---------------------------------------------------------------+
| HEADER                                                        |
|   "Kid profiles"                                              |
|   Plan status: "Verity Family · 2 of 2 kids"                  |
+---------------------------------------------------------------+
| WEEKLY FAMILY SNAPSHOT (if household has ≥1 kid)              |
|   "This week"                                                 |
|   [ Household read: 14 articles  |  Longest streak: 5 days ]  |
|   [ Most active: Maya (8 reads)  |  New badges: 3           ] |
|   [ View weekly report → ]                                    |
+---------------------------------------------------------------+
| TRIAL STRIP (only if a trial is active/expired)               |
|   Single-line status, no decoration.                          |
+---------------------------------------------------------------+
| KID LIST                                                      |
|   Cards (not rows). Each card:                                |
|     - Avatar bubble in kid's accent colour                    |
|     - Name, age, tier/plan status                             |
|     - Week stats: reads, streak, score delta                  |
|     - Actions: [Open dashboard] [Pause] [Delete]              |
+---------------------------------------------------------------+
| ADD KID PROFILE                                               |
|   Tile (dashed outline) with "+ Add a kid" if under cap       |
|   At-cap message if at cap                                    |
+---------------------------------------------------------------+
| FOOTER LINKS                                                  |
|   Family dashboard → · Expert sessions →                      |
+---------------------------------------------------------------+
```

**Weekly Family Snapshot (NEW)**
- 4-stat grid in the header region:
  - Household articles read this week
  - Longest current streak in the household
  - Most active reader this week
  - Badges earned this week
- Link underneath: "View weekly report →" goes to `/profile/family/weekly` (new route, out of scope for this spec).
- Represents D24 family-engagement surfacing.

**Trial strip**
- Single row, not a card:
  - Eligible (not used): muted background, link "Start a 7-day trial"
  - Active: warning-coloured single line "Trial ends Fri · upgrade to keep progress →"
  - Expired: danger-coloured single line "Trial ended · kid profile frozen · upgrade to unfreeze"

**Kid list cards**
- Card per kid. 16 px radius, 1 px border, 16 px padding, kid's accent at 4% as card background.
- Top row: avatar (52 px circle, kid's accent), name (16 px heavy), kid/trial/frozen tags as pills under the name.
- Middle: 3 inline micro-stats — Reads this week / Current streak / Verity Score delta this week.
- Right: chevron + `Open dashboard` link.
- Bottom row (secondary actions, smaller, muted): `Pause` (new — sets `kid_profiles.is_active = false`), `Delete`.
- On a frozen card (plan lapsed, trial expired): the card shows a lock label and the kid's numbers are rendered in muted text. Matches D40 frozen mechanic for kid profiles.

**Add-kid flow (re-architected)**
- Move COPPA consent OUT of the inline form and into a full-screen modal with 3 steps:
  1. **Basics** — display name, DOB, avatar colour.
  2. **Parent PIN** — 4 digits + confirm (reject weak PINs per `WEAK_PINS` at `site/src/app/profile/kids/page.js:10`).
  3. **COPPA consent** — the long legal text lives here, scrollable, plus parent full-name and checkbox acknowledgment.
- Each step has a progress indicator (3 dots, current dot filled in kid's accent).
- Submit only on step 3. Cancel at any step discards.

### Proposed layout — per-kid view

```
+---------------------------------------------------------------+
| BREADCRUMB: ← All kids                                        |
+---------------------------------------------------------------+
| IDENTITY BAND (kid's accent, 140 px tall)                     |
|   Avatar, name, age, plan, trial/frozen status                |
+---------------------------------------------------------------+
| KEY STATS (4 tiles)                                           |
|   Reads 7d · Quizzes total · Current streak · Best streak     |
+---------------------------------------------------------------+
| STREAK FREEZE PANEL                                           |
|   "This week: 1 of 2 freezes remaining"                       |
|   [ Use a freeze ]                                            |
+---------------------------------------------------------------+
| READING ACTIVITY (last 30 days)                               |
|   Simple bar chart: 30 bars, filled in kid's accent if they   |
|   read that day                                               |
+---------------------------------------------------------------+
| RECENT QUIZ ATTEMPTS                                          |
|   List with article title, attempt #, score /5, date.         |
+---------------------------------------------------------------+
| ACHIEVEMENTS                                                  |
|   Same grid as kid-side profile, plus locked badges to show   |
|   the parent what's coming.                                   |
+---------------------------------------------------------------+
| SETTINGS                                                      |
|   [ Change PIN ] [ Pause profile ] [ Delete profile ]         |
+---------------------------------------------------------------+
```

**What parents actually want at a glance (ranked)**
1. Is my kid reading this week? (Reads 7d — keep prominent)
2. Are they keeping their streak? (Current streak, freeze remaining)
3. Are they actually learning? (Quiz attempts with pass/fail)
4. What milestone are they chasing? (Achievements with locked badges visible)
5. Am I going to be charged / is the trial ending? (Plan + trial strip on list view, not per-kid)

**Falls short in current code**

- `site/src/app/profile/kids/page.js:42-50` — Bug 2 shape mismatch leaves the whole page empty.
- `site/src/app/profile/kids/page.js:141-158` — kid list uses thin row cards with no weekly-snapshot affordance.
- `site/src/app/profile/kids/page.js:195-205` — COPPA block is inline and mobile-hostile.
- `site/src/app/profile/kids/[id]/page.js:92-101` — stats are 10 px labels with 20 px numbers; no chart; no freeze panel state beyond a button.
- No pause-profile action exists yet.

---

## 6. Cross-platform notes

| Surface | Web behaviour | iOS behaviour | Identical or diverge? |
|---|---|---|---|
| Bottom nav | 3-tab fixed bar at page bottom, `NavWrapper.js:184-213`. Tabs render as `<a>` elements in kid mode. | Floating capsule tab bar, `KidViews.swift:46-92`, uses the active kid's accent for selection. | **Diverge** — iOS keeps its floating capsule; web keeps the flat bar. Both use the same 3 tabs (Home, Leaderboard, Profile) and the same kid-mode gate. |
| Greeting band | Solid colour rectangle, rendered via CSS. | Same shape, SwiftUI `ZStack` with `ignoresSafeArea(edges: .top)`. | **Identical visually.** |
| Category tiles | CSS grid, 2 columns mobile / 3 desktop, 24 px radius. | `LazyVGrid`, identical columns, `RoundedRectangle(cornerRadius: 24)`. | **Identical visually.** |
| Article list rows | Flat rows, 1 px bottom border, no divider decoration. | Native `List` would add insets and separators Apple controls — use `LazyVStack` with custom rows instead so the look matches web. | **Identical** — deliberately avoid `List` on iOS for visual parity. |
| Leaderboard segment control | Custom 3-segment pill, web-styled. | Can use `Picker(.segmented)` OR custom capsule. Prefer custom to keep kid-accent colouring consistent. | **Identical.** |
| "You" card on leaderboard | Fixed at top of list on both scopes. | Same. | **Identical.** |
| Stat tiles | White card, 1 px border, 14 px radius, uppercase micro-label. | Same. | **Identical.** |
| Badges grid | 3-column CSS grid. | `LazyVGrid(columns: 3)`. | **Identical.** |
| PIN exit modal | Centered overlay, focus-trapped (`useFocusTrap` at `site/src/app/kids/profile/page.js:120-122`). | `.sheet(isPresented:)` detent, full-width on phone. | **Diverge** — iOS uses a sheet because that's native; web uses an overlay modal because fixed-position modals feel more trustworthy than drawer sheets on desktop browsers. Interaction/content identical. |
| Streak dots row | CSS flex of 7 circles. | `HStack` of 7 circles. | **Identical.** |
| Expert session LIVE indicator | CSS pulsing dot (`@keyframes`). | `withAnimation(.easeInOut.repeatForever)` on a `Circle`. | **Identical visually.** |
| Hero countdown copy | `Intl.RelativeTimeFormat` to produce "Live in 2 hours". | `Date.FormatStyle.relative(presentation: .named)`. | **Identical output.** |
| Saved articles | Same row style as home. | Same. | **Identical.** |
| Parent dashboard | Web-only currently. iOS has `FamilyDashboardView` (bugs 57, 62). | Parent dashboard on iOS = `FamilyViews.swift:1-100` approximately. | **Diverge** — iOS should NOT try to replicate the full parent dashboard in this pass. iOS surfaces kid selection + PIN entry + a "Manage on web" link for the full dashboard. Cross-platform parity for creation/COPPA/pause is out of scope until the iOS plan-field bugs (57) are resolved. |
| Navigation to settings | `/profile/settings` | `SubscriptionView` sheet via `NavigationLink`. | **Diverge** — follow platform patterns. |
| Colours | CSS variables in `site/src/app/globals.css`. | `Kid.backgroundColors` array at `KidViews.swift:17-26`. | **Identical palette**; name each one in a shared doc so web and iOS stay in sync when a colour changes. |

**Principle:** pick web OR iOS patterns wherever they're native (nav chrome, modals, keyboard affordances, haptics), but keep the kid-facing content surfaces (greeting, tiles, leaderboard rows, stat tiles, badges) pixel-similar so a kid moving between their parent's phone and the family laptop sees the same Verity Post.

---

## Appendix A — Known kid-mode bugs the redesign assumes are fixed

The redesign is a spec, not a bug-fix plan, but several known bugs would make the spec look broken if shipped as-is. Flagging so implementation doesn't land on top of them:

- **Bug 2** — parent dashboard destructuring (`site/src/app/profile/kids/page.js:42-50`).
- **Bug 50 / 51 / 64** — kid PIN flow (verify body shape, hash mismatch between create and verify, iOS sends no kid id). Redesign still depends on PIN-gated exit so this must work.
- **Bug 52** — web lacks global kids leaderboard (spec adds it).
- **Bug 56** — iOS `KidLeaderboardView` queries non-existent `kid_reading_log` table.
- **Bug 57** — iOS family-plan gate reads `users.plan` text field that doesn't exist.
- **Bug 58** — web kid home grid includes subcategories (spec relies on top-level-only).
- **Bug 59** — kid profile Day-streak tile wired to parent's streak (spec relies on kid's own streak).
- **Bug 60** — COPPA consent double-write (spec redesigns the COPPA step but data shape should be canonicalised first).
- **Bug 61** — trial banner relies on broken fetch (Bug 2 sibling).
- **Bug 63** — `stripKidsPrefix` working around DB naming drift; spec assumes names are normalised in the DB.

---

## Appendix B — Prototypes

The `beta ui ux kids/` folder contains a set of static HTML prototypes implementing the layouts above. They're served at `http://localhost:4000` so the PM can click through without running Next.js. Nothing here touches the production `site/` code.

Screens included:

1. `index.html` — hub linking to every screen below.
2. `profile-picker.html` — "Who is reading today?" picker.
3. `kid-home.html` — greeting + today row + categories.
4. `kid-home-category.html` — category selected, article list visible.
5. `kid-leaderboard-all.html` — All kids segment.
6. `kid-leaderboard-family.html` — My family segment.
7. `kid-leaderboard-topic.html` — By topic segment.
8. `kid-profile.html` — kid's own profile.
9. `expert-sessions-list.html` — sessions list with hero card.
10. `expert-session-live.html` — live session room with question composer.
11. `expert-session-replay.html` — past session read-only.
12. `parent-dashboard.html` — parent's kids list + weekly snapshot.
13. `parent-kid-detail.html` — per-kid parental view.
14. `parent-create-kid-basics.html` — step 1 of 3 of the new add-kid flow.
15. `parent-create-kid-pin.html` — step 2 of 3.
16. `parent-create-kid-coppa.html` — step 3 of 3.

Each prototype is a single self-contained HTML file referencing `styles.css`. No JavaScript dependencies, no build step — open in a browser.
