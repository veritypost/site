# Slice 02 — Story page & article reading

**Status:** locked
**Last touched:** 2026-04-30 (Session 4 — Q&A, adversarial review, lock)
**Adversarial review:** complete
**Implementation session:** not yet scheduled

---

## Scope

Files investigated:
- `web/src/app/[slug]/page.tsx`
- `web/src/app/[slug]/_ArticleFetchFailed.tsx`
- `web/src/app/[slug]/error.tsx`
- `web/src/app/[slug]/loading.tsx`
- `web/src/app/[slug]/not-found.tsx`
- `web/src/components/article/ArticleSurface.tsx`
- `web/src/components/article/ArticleTracker.tsx`
- `web/src/components/article/StoryArticlePicker.tsx`
- `web/src/components/article/SourcesSection.tsx`
- `web/src/components/article/TimelineSection.tsx`
- `web/src/components/ArticleEngagementZone.tsx` (boundary with slices 03/04)

User states walked: anon, free signed-in (quiz not taken), free signed-in (quiz passed), admin/editor, multi-article story reader.

FK hint check: no `!foreign_key_name` disambiguation hints found in any Slice 02 file. Rule satisfied.

Known gap from article-lifecycle: `stories` table missing `subtitle` and `description` columns. `ArticleSurface` uses `articles.subtitle` — not a story-level field. Confirmed active but not a UX gap in current code (column exists on articles, renders cleanly when null).

F4 verification (Session 4): `page.tsx:221` confirms `{articles.length > 1 && <StoryArticlePicker ...>}` — single-article stories correctly never render the picker. F4 narrowed to active-tab re-navigation only.

---

## Findings

### F1 — AI-generated articles not disclosed to readers
**Status:** won't-fix
**Priority:** HIGH
**Decision:** Owner decision (2026-04-30). No user-facing AI disclosure anywhere on the site. TC/PP handles disclosure at the policy level. `is_ai_generated`, `ai_model`, and `ai_provider` remain in the DB and fetch but are never passed to `ArticleSurface` or rendered.

---

### F2 — Anon reader: no CTA or explanation below the article
**Status:** decided
**Priority:** HIGH

**Reader experience.** An anon reader finishes the article and `ArticleEngagementZone` renders a read-only `CommentThread` with no explanation of why they can't participate. No sign-up CTA, no prompt, no framing.

**Root cause.** `web/src/components/ArticleEngagementZone.tsx:30–39` — anon branch returns `<CommentThread>` only, no CTA.

**Decision.** Add a CTA block directly above the read-only `CommentThread` in the anon branch. Thread stays fully visible — no blur, no lock. Two CTAs: [Sign in] [Create account].

**Fix plan.**
- File: `web/src/components/ArticleEngagementZone.tsx`
- In the anon branch (lines 30–39), insert a CTA block between the section heading (from F3) and `<CommentThread>`.
- Copy varies by `hasQuiz` prop (already available):
  - `hasQuiz === true`: "Join the conversation. Create a free account to take the knowledge quiz and unlock comments."
  - `hasQuiz === false`: "Join the conversation. Create a free account to unlock comments."
- Two CTAs: [Sign in] and [Create account] — link to auth routes per the auth surface.
- No new props needed. `hasQuiz` already flows into the component.
- No change to the signed-in branch.

---

### F3 — No visual or textual section break at the engagement zone
**Status:** decided
**Priority:** MEDIUM

**Reader experience.** Quiz and comment thread appear below the article body with only 40px of top margin. No section header, no rule, no label.

**Root cause.** `web/src/components/ArticleEngagementZone.tsx:32` (anon) and `:44` (signed-in) — only `marginTop: 40` on the section wrapper; no `<hr>`, no `<h2>`, no explanatory copy.

**Decision.** Full-width hairline rule + context-sensitive `<h2>` label at the top of both branches. Label text: "Test Your Knowledge" when `hasQuiz && !hasPassed && currentUserId`; "Discussion" for all other states (anon, quiz-passed, no-quiz article).

**Fix plan.**
- File: `web/src/components/ArticleEngagementZone.tsx`
- Both the anon branch (line 32) and signed-in branch (line 44) get the rule + label at the top of their `<section>`.
- `<hr>`: `border: none; border-top: 1px solid var(--border, #e5e5e5); margin: 0 0 20px`.
- `<h2>`: small-caps visual style (fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim, #888)', margin: '0 0 20px'). Matches `SourcesSection` HEADING_STYLE register.
- Anon branch label: always "Discussion".
- Signed-in branch label: `hasQuiz && !hasPassed` → "Test Your Knowledge"; else → "Discussion". Uses existing `hasPassed` state (line 21) and `hasQuiz` prop.
- Scope note: engagement zone only renders for published non-COPPA articles (`page.tsx:253`); no edge case for unpublished/COPPA articles.

---

### F4 — Active article picker tab re-navigates
**Status:** decided
**Priority:** MEDIUM

**Reader experience.** On a multi-article story, clicking the already-active article tab triggers a full Next.js `<Link>` navigation to `?a=<current-id>` — the URL the reader is already on.

**Verification.** `page.tsx:221` — `{articles.length > 1 && <StoryArticlePicker>}` — single-article guard is correct. Finding narrows to active-tab navigation only.

**Root cause.** `web/src/components/article/StoryArticlePicker.tsx:42–61` — every tab including the active one (`isActive === true`) renders as `<Link href={...}>`. No conditional to swap the active item to a non-navigating element.

**Decision.** Render active tab as `<span>` instead of `<Link>`. Keep `aria-current="page"` (already in place). Add `tabIndex={0}` to preserve keyboard accessibility.

**Fix plan.**
- File: `web/src/components/article/StoryArticlePicker.tsx:42–61`
- Wrap the render in a conditional: when `isActive`, render a `<span tabIndex={0} aria-current="page" style={...}>` with the same visual styles as the active `<Link>` (background, border, color, fontWeight). When not active, keep `<Link href={...}>` unchanged.
- `aria-current="page"` already computed at line 57 — move to `<span>` for active case.
- Inner `<span>` children (label + dateLabel) are identical in both paths.
- No new props needed.

---

### F5 — Source links have no visual affordance
**Status:** decided
**Priority:** MEDIUM

**Reader experience.** Sources section renders external links with no color change and no underline at rest. Source links are visually indistinguishable from surrounding text until hover.

**Root cause.** `web/src/components/article/SourcesSection.tsx:39–43` — `LINK_STYLE` sets `textDecoration: 'none'`. No hover state.

**Decision.** Persistent underline at rest. No color change — keep `color: inherit`. `text-underline-offset: 3px` tuned for Georgia body size.

**Fix plan.**
- File: `web/src/components/article/SourcesSection.tsx`
- In `LINK_STYLE` (lines 39–43): change `textDecoration: 'none'` → `textDecoration: 'underline'`; add `textUnderlineOffset: '3px'`.
- The fallback `<span>` at line 71 already has `{ ...LINK_STYLE, textDecoration: 'none' }` as an explicit override — it will not pick up the underline. No change needed to line 71.
- No new props. No visual change to publisher name, section heading, or non-link source items.

---

### F6 — Quiz-to-comment unlock has no affordance *(boundary with Slice 03)*
**Status:** deferred
**Priority:** MEDIUM

**Note.** Deferred to Slice 03 (quiz experience). This finding sits at the Slice 02/03 boundary; the unlock mechanic design belongs to the quiz UX slice. Carry-forward context for Slice 03:
- Connecting copy needed between quiz and locked comment thread.
- Recommended framing from expert panel: "Answer a few questions about this article to join the discussion." (avoids "unlock," "earn," "level up" — not a game, not a reward).
- Below the quiz, the locked comment thread should show: "Complete the quiz above to comment."
- The causal link (quiz → comment access) must be explicit on the page; readers do not infer it from layout proximity.

---

### F7 — Subtitle renders as `<p>` not `<h2>`
**Status:** decided
**Priority:** LOW

**Reader experience.** None visible to sighted readers. Semantic issue: `web/src/components/article/ArticleSurface.tsx:90` renders subtitle as `<p>`. Document heading hierarchy is `<h1>` → `<p>` → body copy, skipping `<h2>`.

**Decision.** Add `role="doc-subtitle"` to the existing `<p>`. Do not change the element to `<h2>`. The subtitle is editorial deck copy (standfirst), not a structural section heading. `role="doc-subtitle"` (DPUB-ARIA) is the semantically correct designation. 4/5 experts agreed; changing to `<h2>` would misrepresent the subtitle as a document section in the outline.

**Fix plan.**
- File: `web/src/components/article/ArticleSurface.tsx:90`
- Change `<p style={SUBTITLE_STYLE}>` → `<p role="doc-subtitle" style={SUBTITLE_STYLE}>`.
- One attribute addition. No visual change. No prop changes.
- Renders only when `reader.subtitle` is truthy (already conditional) — correct behavior when subtitle is null.

---

### F8 — Invalid `?a=` param silently redirects
**Status:** won't-fix
**Priority:** LOW
**Decision:** Won't-fix (2026-04-30). Silent redirect to story root on invalid `?a=` is correct graceful degradation. Reader lands on a valid article. Articles use soft-delete, so stale `?a=` params from hard deletion are rare. A notice would add client-side complexity for a negligible-frequency edge case. 4/5 experts agreed.

---

## Design decisions

| Finding | Decision | Date |
|---|---|---|
| F1 — AI disclosure | Won't-fix — owner decision; TC/PP only | 2026-04-30 |
| F2 — Anon CTA | CTA block above open thread; copy varies by hasQuiz; [Sign in] [Create account] | 2026-04-30 |
| F3 — Section break | Hairline rule + context-sensitive `<h2>` — "Test Your Knowledge" / "Discussion" | 2026-04-30 |
| F4 — Active tab | `<span tabIndex={0}>` for active tab instead of `<Link>` | 2026-04-30 |
| F5 — Source links | `textDecoration: 'underline'; textUnderlineOffset: '3px'` on LINK_STYLE | 2026-04-30 |
| F6 — Quiz unlock | Deferred to Slice 03 | 2026-04-30 |
| F7 — Subtitle semantic | Add `role="doc-subtitle"` to existing `<p>` | 2026-04-30 |
| F8 — Silent redirect | Won't-fix — graceful degradation, articles use soft-delete | 2026-04-30 |

---

## Cross-surface findings

**Post-read navigation (→ Slice 06):** No "next story," "more in this category," or "back to front page" navigation exists at the end of `ArticleSurface`. Deferred to Slice 06 (Post-read engagement).

---

## Adversarial review (Session 4)

Adversarial agent read all four component files. Two clarifications absorbed into fix plans:

1. **F2 — copy must vary by `hasQuiz`.** CTA text promising a quiz must not appear on no-quiz articles. Fix plan accounts for both branches.
2. **F4 — `<span>` needs `tabIndex={0}`.** Replacing `<Link>` with a bare `<span>` removes the element from the keyboard tab order. Added to fix plan.

Two flagged items ruled out as non-issues:
- F2 anon CTA visible to editors: editors are signed-in (`currentUserId !== null`) — they never hit the anon branch.
- F3 section break on COPPA/unpublished: `ArticleEngagementZone` is not rendered in those states (`page.tsx:253`) — no edge case.

---

## Implementation notes

**Files to change (5 total):**

| File | Finding | Change |
|---|---|---|
| `web/src/components/ArticleEngagementZone.tsx` | F2, F3 | CTA block + section break in both branches |
| `web/src/components/article/StoryArticlePicker.tsx` | F4 | `<span tabIndex={0}>` for active tab |
| `web/src/components/article/SourcesSection.tsx` | F5 | `textDecoration: 'underline'` on LINK_STYLE |
| `web/src/components/article/ArticleSurface.tsx` | F7 | `role="doc-subtitle"` on subtitle `<p>` |

**No new props** are required for any fix. All data needed for the context-sensitive label (F3) and copy variation (F2) is already available in `ArticleEngagementZone` (`hasQuiz`, `hasPassed` state, `currentUserId`).

**F3 + F2 sequencing in anon branch:** The anon branch should render: `<hr>` → `<h2>Discussion</h2>` → CTA block → `<CommentThread>`.

**F3 sequencing in signed-in branch:** `<hr>` → `<h2>{label}</h2>` → `{hasQuiz && <ArticleQuiz>}` → `<CommentThread>`.
