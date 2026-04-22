# iOS Adult — Story Detail

**File:** `VerityPost/VerityPost/StoryDetailView.swift`
**Owner:** Thompson (editorial hierarchy), Weinschenk (quiz interaction).
**Depends on:** `10_SUMMARY_FORMAT.md`, `06_DEFECTION_PATH.md`, `12_QUIZ_GATE_BRAND.md`, `13_QUIZ_UNLOCK_MOMENT.md`, `11_PAYWALL_REWRITE.md`, `16_ACCESSIBILITY.md`.

---

## Current state (verified 2026-04-21)

- 3-tab TabView: Article, Timeline, Discussion.
- Article body + expert responses.
- Quiz player inline.
- Discussion (comments, vote, mention autocomplete).
- Bookmark (with free-tier cap alert).
- TTS player.

Issues:
- Tabs split the reading experience.
- Comment upvote counts can stale if sync fails.
- No "comment posted" toast.
- Quiz auto-advances with 0.35s delay, no manual-next affordance.
- Byline, read time, publish timestamp, sources tab, corrections concept all present — all cut per Charter commitment 4.

## What changes

Mirror the web rewrite from `views/web_story_detail.md`.

### Un-tab the structure

Article body, timeline (when applicable), quiz, comments — all inline on one scrolling view. Tabs removed.

### Article surface (top to bottom)

1. Eyebrow (category · subcategory)
2. Headline
3. Deck
4. Prose summary — one paragraph, 2–4 sentences. No labels. Identical text to feed card.
5. Timeline (above body): vertical stack of ≤7 events, each with absolute date, ≤22 words. No source-number superscripts.
6. Body: prose paragraphs, `typography.body` (17pt, scaled via `Font.scaledSystem`). Line height 1.5.
7. Defection link: inline single line below body. "See also: [peer] · [primary document]". Tracked via `defection.click` event.
8. Quiz block: "Pass to comment." inline CTA.
9. Comment thread.

**What is NOT rendered on the article surface:**

- No byline, no reporter photo/name/role.
- No published-at timestamp.
- No updated-at line.
- No read-time indicator.
- No corrections count / corrections banner.
- No editor-placement line.
- No standards link inside the article (site-wide footer link is enough).
- No sourcing-strength row.
- No sources block at end of body.
- No "See a problem?" button.

### Quiz interaction (per `13_QUIZ_UNLOCK_MOMENT.md`)

- Submit → calm "Checking..." card (300ms).
- Result card: "3 of 5. You're in. The conversation is below."
- Score delta pill if points earned.
- Smooth scroll into comments (`.spring(response: 0.55, dampingFraction: 0.85)`).
- Comment composer auto-focuses.
- Single `.soft` haptic on pass.

### Quiz fail (per manifest)

- Calm card: "2 of 5. You missed Central Claim and Scope Boundary questions. Want to take another look?"
- [ Reread and try again ] [ Not right now ]
- No haptic on fail.
- Retry policy: 3 attempts → scroll-depth re-read beacon → 10-min cool-down → unlimited. Verity Pro skips cool-down. No timer.

### Comments (un-hidden)

Header: "Every reader here passed the quiz." Each comment shows inline `PassedMark`.

### Toast on comment post

Add: "Posted." lasting 1.2s. Soft haptic on success.

### Error recovery

Per-section retry. If body failed, "Couldn't load the article — retry." Retry button reloads only that section.

### TTS

Keep. Audio player sits at top of article area when active.

## Files

- `VerityPost/VerityPost/StoryDetailView.swift` — major rewrite, strip metadata.
- `VerityPost/VerityPost/Views/SummaryBlock.swift` — new. Single prose paragraph.
- `VerityPost/VerityPost/Views/DefectionLinks.swift` — new.
- `VerityPost/VerityPost/Views/QuizResultCard.swift` — new.

Delete if present: `StoryBylineView`, `SourceListView`, `CorrectionsBannerView`, `SourcingStrengthRow`, `ReportFormSheet`.

## DB touchpoints

Reads: `articles`, `timelines`, `quizzes`, `quiz_attempts`, `comments`, `bookmarks`, `defection_links`.
Writes via APIs: `quiz_attempts`, `comments`, `bookmarks`, `events`.

## Acceptance criteria

- [ ] Tabs removed; single-scroll article.
- [ ] Summary block renders one prose paragraph. No labels.
- [ ] No byline, no read time, no publish-at timestamp, no corrections banner, no sourcing row, no sources block visible.
- [ ] Timeline inline above body when data exists.
- [ ] Defection link inline below body.
- [ ] Quiz inline at article end.
- [ ] Unlock moment spec (scroll + composer focus + haptic).
- [ ] Comment thread header "Every reader here passed the quiz".
- [ ] `PassedMark` inline on each comment.
- [ ] Comment post shows "Posted." toast.
- [ ] Per-section error recovery.
- [ ] Reduce Motion path.
- [ ] Dynamic Type scales.
- [ ] Story detail open from home tap < 400ms perceived.

## Dependencies

Ship after `16_ACCESSIBILITY.md`, `10_SUMMARY_FORMAT.md`, `06_DEFECTION_PATH.md`, `12_QUIZ_GATE_BRAND.md`, `13_QUIZ_UNLOCK_MOMENT.md`, `11_PAYWALL_REWRITE.md`.
