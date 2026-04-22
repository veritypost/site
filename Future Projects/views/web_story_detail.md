# Web — Story Detail

**File:** `web/src/app/story/[slug]/page.tsx` (main component `StoryPage`)
**Owner:** Thompson (editorial hierarchy), Weinschenk (quiz + comment interaction).
**Depends on:** `10_SUMMARY_FORMAT.md`, `06_DEFECTION_PATH.md`, `12_QUIZ_GATE_BRAND.md`, `13_QUIZ_UNLOCK_MOMENT.md`, `11_PAYWALL_REWRITE.md`.
**DB touchpoints:** `articles`, `timelines`, `quizzes`, `quiz_attempts`, `comments`, `bookmarks`, `user_achievements`, `defection_links` (new).

---

## Current state (verified 2026-04-21)

`StoryPage` renders the article reader.

- Auth optional; logged-out readers hit regwall after N free articles (tracked in `sessionStorage`).
- Permissions: `article.view.body`, `article.bookmark.add`, `article.listen_tts`, `article.view.timeline`, `article.view.ad_free`.
- Tabs exist for timeline and discussion but are launch-hidden via `{false && ...}` branches.
- Quiz gate is implemented but invisible to readers who don't click to comment.

Problems:
- Quiz hidden by launch flag — un-hide per `12_QUIZ_GATE_BRAND.md`.
- Timeline and discussion tabs also launch-hidden — un-hide.
- Byline, read time, published-timestamp, corrections count, sourcing-strength row, sources block, editor-placement line all present in the current code or prior spec drafts — all cut per Charter commitment 4.
- Fragile regwall state management.

## What changes

### Article surface (top to bottom)

The entire article is:

1. Eyebrow (category · subcategory)
2. Headline
3. Deck (one line completing the headline)
4. Prose summary — one paragraph, 2–4 sentences. No labels. Identical text to feed card.
5. Timeline (above body): ≤7 events, vertical, absolute dates, ≤22 words each. No source-number superscripts — the timeline reads as journalism, not footnoted research.
6. Body: prose paragraphs. Inline attribution for every quote and every number. Counter-evidence paragraph mandatory. Kicker points to a dated scheduled next event.
7. Defection link: one small line, "See also: [peer outlet] · [primary document]." Below body, above quiz.
8. Quiz block: 5 questions, Type A + Type D mandatory.
9. Comment thread: gated by quiz pass; header reads "Every reader here passed the quiz."

**What is NOT rendered on the article surface (per Charter commitment 4):**

- No reporter byline. No "by [name], [role]" line.
- No read time.
- No publication timestamp ("posted 2h ago," "published 4:28 PM ET").
- No updated timestamp.
- No editor-placement line ("Placed by [editor]").
- No corrections count or corrections banner.
- No sourcing-strength row.
- No "See a problem?" button.
- No standards-link under metadata (the site-footer link to `/standards` is enough).
- No sources block at the end of the article. Attribution lives in the prose only.

### Regwall body fade

Current implementation cuts body text at a paragraph boundary. Change to a gradient fade that runs the last ~150 pixels into white, with the paywall card below. Per `11_PAYWALL_REWRITE.md`.

### Quiz block

Always visible at the end of every article (remove `{false && ...}` launch-hide flag). Copy:

> **Pass to comment.** Five questions about what you just read. Get three right and the conversation opens. No timer, no streak.
>
> [ Submit answers ]

### Quiz interaction (per `13_QUIZ_UNLOCK_MOMENT.md`)

- Submit → 300–500ms "Checking..." state.
- Result card on pass: score + "You're in. The conversation is below."
- Score delta pill if points earned.
- Smooth scroll into comment section (600ms).
- Cursor lands on composer.

On fail:
- Calm card: "2 of 5. You missed [Central Claim] and [Scope Boundary] questions. Want to take another look at the article?"
- [ Reread and try again ] [ Not right now ]
- Retry: 3 attempts → scroll-depth re-read beacon → 10-min cool-down → unlimited. Verity Pro bypasses cool-down.

### Comment thread (un-hidden)

Remove `{false && ...}` flag. Header: "Every reader here passed the quiz." Each comment shows inline `<PassedMark />`.

### Timeline section (un-hidden)

Always visible above the body when timeline data exists. No tab structure. Vertical, static, printed.

## What to delete from current file

- `{false && ...}` around quiz and discussion sections.
- Tab navigation for Article / Timeline / Discussion — restructure as inline sections.
- Any hardcoded paywall copy — route to `paywalls/storyRegwall.ts`.
- Any `<Byline />`, `<ReadTime />`, `<PublishedAt />`, `<CorrectionsBanner />`, `<SourcingStrength />`, `<SourcesBlock />`, `<ReportFormButton />` components. Delete both the components and their call sites.

## Regwall interaction (cleaned up)

- State management extracted to `useRegwall()` hook.
- Wall renders invitation-voice copy.
- Fade effect (not cut) on body above the wall.
- Trial timeline component visible.

## Accessibility

- Semantic HTML (`<article>`, `<header>`, `<section>`).
- Keyboard: Tab through interactive elements. Quiz options accessible via radio inputs with labels.
- VoiceOver announces quiz state transitions ("Question 2 of 5").
- Reduce motion replaces scroll animation with instant scroll.
- Focus management: after quiz pass, focus moves to comment composer.
- Typography scales with browser zoom.

## Files

- `web/src/app/story/[slug]/page.tsx` — rewrite, strip launch-hide flags, strip metadata components.
- `web/src/components/StoryQuizBlock.tsx` — new — the inline quiz CTA + engine.
- `web/src/components/ArticleQuiz.tsx` — existing, rewritten per `13_QUIZ_UNLOCK_MOMENT.md`.
- `web/src/components/DefectionLinks.tsx` — new.
- `web/src/hooks/useRegwall.ts` — new.

Delete:
- `web/src/components/StoryByline.tsx` (if present — scaffolding per removed metadata)
- `web/src/components/CorrectionsBanner.tsx`
- `web/src/components/SourcingStrengthRow.tsx`
- `web/src/components/SourceList.tsx`
- `web/src/components/ReportForm.tsx`

## DB touchpoints

Reads:
- `articles` (summary, body, metadata).
- `timelines` + `timeline_events` (join, conditional render).
- `quizzes` + `quiz_attempts` + `quizzes_completed` (quiz state).
- `comments` (paginated, lazy-loaded).
- `bookmarks` (for bookmark button state).
- `user_achievements` (for score delta).
- `defection_links` (rows for this article).

Writes (via APIs):
- `quiz_attempts` via `/api/quiz/submit`.
- `comments` via `/api/comments` POST.
- `bookmarks` via `/api/bookmarks` POST.
- `events` pipeline: pageview, quiz events, defection clicks.

## Acceptance criteria

- [ ] Article surface renders ONLY: eyebrow, headline, deck, summary, timeline, body, defection link, quiz, comments.
- [ ] No byline, no read time, no publication timestamp, no corrections banner, no sourcing-strength row, no sources block visible on article.
- [ ] Summary renders as a single prose paragraph. No labels.
- [ ] Timeline always visible above body when data exists.
- [ ] Quiz always visible at end of article.
- [ ] Comment thread header "Every reader here passed the quiz" renders on pass.
- [ ] `<PassedMark />` shows inline with each commenter name.
- [ ] Quiz fail diagnostic shows Type names missed, never correct answers.
- [ ] Regwall invitation voice; fade-to-paywall effect works.
- [ ] Lighthouse accessibility ≥ 95.
- [ ] TTI < 1500ms on reference device.

## Dependencies

Ship after `10_SUMMARY_FORMAT.md`, `06_DEFECTION_PATH.md`, `12_QUIZ_GATE_BRAND.md`, `13_QUIZ_UNLOCK_MOMENT.md`, `11_PAYWALL_REWRITE.md`, `08_DESIGN_TOKENS.md`.
