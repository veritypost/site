# 02 — The reading receipt

## The idea

Every finished article ends with a monospaced stub — like a Kindle page
number or a grocery receipt — summarizing what the reader just did.

```
                    · · ·

         [quiz button renders here]

                    · · ·

  ──────────────────────────────────────
    READ   4m 12s
    QUIZ   3/5  — discussion unlocked
    SCORE  +12 category: politics
    SINCE  Apr 20, 9:14 am ET
  ──────────────────────────────────────
```

## Why it's different

No other news site does this. Newsletters have bylines, Kindle has page
numbers, Medium has "min to read." None of them close the loop with a
summary *after* reading. The receipt:

- Becomes a tiny shareable artifact ("here's my proof I read it")
- Reinforces the civic framing without gamification
- Signals completion in a way that's the opposite of an infinite scroll
- Is anti-Medium, anti-Substack — it treats the reading act as finite and
  worth marking

## Where it lives

- **File:** `web/src/app/story/[slug]/page.tsx`
- **Area:** below the article body + quiz block, above the "Where to
  next" section currently around `page.tsx:922-935`.
- **Data sources:**
  - Read duration — already tracked in `/api/stories/read` (see
    `timeSpentSeconds` at `page.tsx:383, 458`)
  - Quiz result — already in state via `userPassedQuiz` + existing
    score-bump response from the `ArticleQuiz` component
  - Category name — already derived (`categoryName` local variable)
  - Timestamp — generate client-side

## What ships

1. A new component `web/src/components/ReadingReceipt.tsx` that accepts
   `{ readSeconds, quizResult, scoreDelta, categoryName, completedAt }`
   and renders the monospaced block.
2. Mount it in `story/[slug]/page.tsx` after the quiz section renders
   (only when `userPassedQuiz === true` OR `completedAt` is set).
3. Style: `font-family: ui-monospace, SFMono-Regular, Menlo, monospace`,
   11px letter-spacing 0.04em, color `var(--dim)`, soft horizontal rules
   top and bottom, max-width 420px, center-aligned.
4. Hide on mobile if it makes the page feel cluttered — or keep, since
   the monospace contrast vs the serif article body is part of the look.

## Optional extension

Add a "copy receipt" button (small, text-only, next to the stub) that
copies a plain-text version of the receipt to clipboard. Users can paste
it into social or group chats. **Don't** build a dedicated share image or
auto-post flow. Keep it quiet.

## Risks / trade-offs

- Feels gimmicky if over-designed. Keep it strictly functional —
  monospace + rules + nothing else.
- Data precision: `readSeconds` from the existing API has noise (browser
  tab switching, etc.). Round to the nearest `30s` to avoid surfacing
  "4m 17s" that doesn't match the user's perception.
- Some users will skip the quiz. Decide: render a partial receipt
  (READ-only, no QUIZ line), or render nothing. My pick: partial.

## Effort

~3 hours. One new component + one mount site + a small amount of state
plumbing for `scoreDelta`.
