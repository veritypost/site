# Kids Interactive Moments — Build Plan (revised: two-mode toggle)

## 0. The shape

Kid iOS reader gets a 2-pill toggle near the top of every article:

- **Quick** (default) — today's 50-word summary, no markers, no interactivity. **No behavioral change vs. today.**
- **Deep dive** — the full 250–450-word kid body, parsed for `[[GLOSS]]` / `[[REVEAL]]` / `[[PREDICT]]` markers, rendered as native tap cards.

Per-article toggle. No persistence. Kid can be Quick on one story, Deep dive on another. Articles open in Quick by default (matches today).

**No DB migration for the article body** — both surfaces already exist. `articles.kids_summary` holds the summary; `articles.body` holds the full kid body. Server pipeline already writes both. iOS just needs to read both columns.

## 1. Locked decisions

- **Marker syntax**: `[[GLOSS:term::definition]]`, `[[REVEAL:fact]]`, `[[PREDICT:question::option1||option2||correct=N]]`. Terms cannot contain `::`; predict options cannot contain `||`.
- **Markers go into BODY only**, never summary. KIDS_ARTICLE_PROMPT extends to emit markers in the 250-450 word body. Summary prompt unchanged.
- **Web/adult-iOS handling: transform, not strip.**
  - `[[GLOSS:term::def]]` → `term — def`
  - `[[REVEAL:fact]]` → `fact`
  - `[[PREDICT:q::a||b||correct=1]]` → `q Answer: <option-N>.`
- **Marker types**: GLOSS replaces inline jargon translation in body (no double-define); REVEAL overlays "wait, really?" 1:1 (≥2/article); PREDICT optional, max 1, between P2 and final paragraph.
- **Default mode**: Quick. No per-kid persistence — each article opens fresh in Quick.
- **Logging**: 5 columns added to `reading_log` — `mode_used TEXT` (`'quick' | 'deep'`), `moment_glossary_taps INT`, `moment_reveal_taps INT`, `moment_predict_shown BOOL`, `moment_predict_correct BOOL NULL`. Aggregate-only. COPPA-clean.
- **Session state**: view-local `@State` in `KidReaderView`. Resets on article re-fetch / foreground transition.
- **Tap behavior**: subsequent taps toggle hidden/shown; logs only the first reveal-from-hidden. PREDICT locks after first answer.
- **Mode switching**: instant. The currently-revealed marker state is dropped on switch (re-entering Deep dive resets reveal counters too — keeps the data model simple).

## 2. Build waves

### Wave A — Server (prompt + transform)
- `web/src/lib/pipeline/editorial-guide.ts` — extend `KIDS_ARTICLE_PROMPT` with marker rules. **Insertion point: end of LANGUAGE RULES / VOICE block, before OUTPUT JSON** (around line 1495 — verify by reading current file). Add a new `INTERACTIVE MOMENT MARKERS` section. Update the OUTPUT JSON `body` field comment to note markers may appear in body.
- `web/src/lib/pipeline/render-body.ts` — add `transformInteractiveMomentsForWeb(markdown)` function and chain it as the first step. New pipeline: `transformInteractiveMomentsForWeb → marked.parse → insertPullQuote → markOverCapParagraphs → sanitize`.
- `web/src/lib/pipeline/clean-text.ts` — add a comment noting bracket markers must survive (do NOT add a regex like `/\[\[.+?\]\]/g` here).
- **No `route.ts` change** — kids_summary stays the summary.

**Pull-quote interaction:** the transform runs BEFORE marked.parse, so by the time `insertPullQuote` sees HTML the markers are inline text. A transformed paragraph could now match the pull-quote heuristic. Test with a fixture: a `[[REVEAL:short fact]]` paragraph between 8–35 words shouldn't get accidentally promoted. Acceptable if it does (the fact will be the pull quote, which reads fine).

### Wave B — iOS render
- New: `VerityPostKids/VerityPostKids/InteractiveMomentParser.swift` — `parse(_ body: String) -> [BodySegment]`, enums for `BodySegment` (paragraph/predict) and `InlineRun` (text/gloss/reveal).
- New: `VerityPostKids/VerityPostKids/KidArticleBodyView.swift` — renders segments, owns per-session reveal state, surfaces aggregate counters via callback.
- Edit: `KidReaderView.swift`:
  - **Update the SELECT** at line ~348 from `.select("kids_summary")` to `.select("kids_summary, body")`.
  - **Update the local `Row` decode struct** (lines 332–334) — add `let body: String?` alongside `kids_summary`.
  - **Capture both** into local state — keep existing `body_` for the Quick-mode summary; add `bodyFull_: String?` for the Deep dive body.
  - Add a file-local `enum ReaderMode { case quick, deep }` and `@State private var mode: ReaderMode = .quick`.
  - Add a 2-pill segmented control above the body content (per section 4 below).
  - Render summary text in Quick mode (existing paragraph-split renderer at lines 78–90).
  - Render `KidArticleBodyView(body: bodyFull, ...)` in Deep dive mode.
  - If `bodyFull` is empty/nil, hide the toggle entirely (no Deep dive available — fall back to Quick-only).
  - Hold `@State private var counters: InteractiveMomentCounters = .zero` for aggregate logging.

### Wave C — iOS logging + DB
- New migration: `web/supabase/migrations/20260510120000_reading_log_modes.sql` — 5 column adds (`mode_used`, `moment_glossary_taps`, `moment_reveal_taps`, `moment_predict_shown`, `moment_predict_correct`) with bounds CHECK constraints. Verify existing RLS policies on `reading_log` still apply to new columns; if no INSERT policy exists for the kid-JWT path, add one.
- Edit: `Models.swift` (`ReadingLogInsert` extension — 5 new optional fields).
- Edit: `KidReaderView.swift:417–426` — pass `mode_used` (read from `mode` state at log time) + counters into the log payload.
- Regenerate: `web/src/types/database.ts` reading_log block.

### Order
A → B → C strictly. B and C both edit `KidReaderView.swift`; B adds the `@State counters` and `mode`, C reads them.

## 3. Marker schemas

```
[[GLOSS:term::definition]]
[[REVEAL:fact]]
[[PREDICT:question::option_a||option_b||option_c||correct=N]]
```

`correct=N` is 0-indexed. Options 2–4. PREDICT position rule: after P2, before final paragraph.

### Regex (TypeScript / Swift NSRegularExpression)
```
/\[\[GLOSS:([^\n\]]*?)::([^\n\]]*?)\]\]/g
/\[\[REVEAL:([\s\S]*?)\]\]/g
/\[\[PREDICT:([^\n\]]*?)::([^\n\]]*?)\]\]/g
```

Newline-excluding inner classes (`[^\n\]]`) prevent runaway matches across paragraph breaks for GLOSS/PREDICT. REVEAL allows multi-line.

### Failure modes
- Server logs malformed markers but doesn't strip them in `body` — they survive to iOS for graceful fallback.
- `transformInteractiveMomentsForWeb` leaves malformed markers as literal text on `body_html`.
- iOS parser falls back to literal text on malformed markers — no crash.
- `correct=N` out of range → falls back to question-as-text.

## 4. Toggle UX

A simple segmented control near the article title:

```
┌──────────────────────────────┐
│   Quick     │   Deep dive    │
└──────────────────────────────┘
```

- Pill width matches title underline; height ~36pt.
- Selected pill: `K.teal` background, white text, semibold.
- Unselected pill: transparent background, `K.dim` text, normal weight.
- Tap → light haptic + `withAnimation(K.springSnap)` transition.
- No keyboard shortcut (LockedDecision #12, n/a iOS).
- No color-per-tier (LockedDecision #9 — `K.teal` is the brand color, not tier-coded).

Mode default: Quick on every article load. Switching to Deep dive on one article doesn't change the next article's default.

## 5. Cross-platform applicability (LockedDecisions #18)

- **Web (desktop + mobile)**: applicable for marker transformation only. No interactive cards, no toggle. The transformed body_html reads inline as before.
- **iOS adult**: not applicable. Adult iOS does not consume kid articles.
- **iOS Kids (VerityPostKids)**: applicable — primary build target. Toggle + interactive moments live here.
- **Web kids reader**: per Decision #15, kids product is iOS only; web is redirect/promo. Not applicable.

## 6. Test plan

**Server (Wave A):**
- Generate fixture kid article on staging with all three marker types.
- Verify `articles.body` raw markdown carries markers.
- Verify `articles.body_html` is transformed inline form, no `[[`.
- Verify `articles.kids_summary` is unchanged (still the 50-word summary, no markers).

**iOS render (Wave B):**
- Snapshot tests in new `InteractiveMomentParserTests.swift`:
  - Empty body → empty segments
  - 3 paragraphs no markers → 3 paragraph segments with text runs
  - One of each marker → expected segment + run shapes
  - Malformed: `[[GLOSS:term-no-doublecolon]]` → literal text
  - Malformed: `[[PREDICT:q::a||b||correct=99]]` → question-as-text fallback
  - Two PREDICT in one body → first promotes, second inline
  - Adjacent markers → separate runs
  - 30-marker stress test → parses fast (<10ms simulator)
- Manual UI: simulator + staging article. Toggle Quick/Deep, tap each card type. Dynamic Type XL — confirm no clipping.

**Logging (Wave C):**
- Read in Quick mode, complete: log row has `mode_used='quick'`, all marker counters 0/FALSE/NULL.
- Read in Deep dive mode, tap 3 glossary + 2 reveal + answer predict correct: `mode_used='deep'`, counters 3, 2, TRUE, TRUE.
- Switch modes mid-read, complete: `mode_used` reflects mode at completion (the mode the kid was in when they tapped "Take the quiz").

## 7. Risk callouts

1. **Mode-switch state reset**: switching to Deep dive after partial Quick read clears tap state on mode-switch back. By design — keeps data model simple. Document.
2. **Foreground re-fetch resets per-session state** (KidReaderView:126–129) — by design. State is per-session only.
3. **Font scaling**: every Font call in new files MUST use `Font.scaledSystem(...)`. Apple Kids review requires Dynamic Type.
4. **SwiftUI inline `Button` in `Text`** is the highest-risk layout decision in `KidArticleBodyView`. If 16+ inline-buttons-in-text proves layout-buggy, fall back to a custom `Layout` (FlowLayout). Flag in PR.
5. **RLS** on new `reading_log` columns inherits the row-level kid policy. Verify on a Supabase branch.
6. **PREDICT correct nullability semantics**: `NULL` = not answered or not shown. `predict_shown=TRUE && predict_correct=NULL` = shown but bailed.
7. **`cleanText()` regex set** does not strip brackets today — landmine if future regex adds bracket stripping. Add a comment in `cleanText()`.
8. **GLOSS over-use** (LLM emits 12 instead of 3-6) — soft-warn server-side; out of scope for v1.
9. **`mode_used` race**: kid switches mode during read, taps "Take the quiz." Log the mode at quiz-tap time, not at first switch. Implement via single read of `mode` state at `logReading()` time.
10. **Discoverability**: kids may not notice the Deep dive pill. Acceptable for v1 — first signal in `mode_used` data shows whether kids find it. Add a friendly tooltip or onboarding only if data shows zero engagement.

11. **Completion bias in `mode_used`**: only completed reads (kid taps "Take the quiz") log a row. A kid who taps Deep dive but bails generates no row. Deep dive engagement metrics will under-count. Monitor drop-off rate separately if partial engagement matters for product decisions.

12. **Articles without a body**: if `articles.body` is empty/nil for a kid article (older articles pre-F8 or pipeline failures), Deep dive offers nothing. The toggle hides automatically when `bodyFull` is empty — kid sees Quick-only, same as today. No UX surprise.

## 8. Rollback per wave

- **Wave A**: `git revert <commit>`. Markers in body persist on past articles; iOS without parser shows them as literal `[[…]]`. (Until Wave B ships, no iOS reads markers.)
- **Wave B**: `git revert <commit>` — KidReaderView reverts to the paragraph-split summary renderer (Quick mode only). Markers in body unused.
- **Wave C**: `git revert <commit>` + optional `ALTER TABLE public.reading_log DROP COLUMN mode_used, DROP COLUMN moment_*` if needed. Older clients keep working because columns are nullable/defaulted.
