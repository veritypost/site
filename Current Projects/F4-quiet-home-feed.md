# 04 — Stockholm-quiet home feed

## The idea

Strip the home feed to near-nothing. No category pills, no trending rail,
no "popular" section, no breaking banner, no author avatars, no cover
images. Just headlines in serif, with a single muted line of meta.

```
┌─────────────────────────────────────────────────┐
│  Verity Post                                    │
│                                                 │
│  Wednesday, April 20                            │
│                                                 │
│  ────────────────────────────────────────       │
│                                                 │
│  Supreme Court narrowly upholds federal         │ ← serif display, 28pt
│  wiretap framework                              │
│  POLITICS · 4 min · 3 sources                   │ ← small caps, muted
│                                                 │
│  ────────────────────────────────────────       │
│                                                 │
│  Chinese AI regulation tightens after second    │
│  deepfake election incident                     │
│  WORLD · 6 min · 5 sources                      │
│                                                 │
│  ────────────────────────────────────────       │
│                                                 │
│  [continues — no ads, no rails, no modules]     │
└─────────────────────────────────────────────────┘
```

## Why it's different

NYT home has ~47 distinct modules. WaPo is similar. Apple News is a
rail-heavy magazine. All of them optimize home pages for ad density and
page views per session.

Verity is subscription + earned comments. It doesn't need home-page page
views to print money. A quiet home is a power move that only works
because of the business model.

## Where it lives

- **File:** `web/src/app/page.tsx`
- **Current state:** lots of modules — breaking banner (already
  permission-gated and currently hidden via launch flag), category pills
  (now wrapped in `{false && …}`), subcategory pills (same),
  feed cards with cover images, ad slots, recap card, bottom-nav footer.
- **Area:** the main feed section starting around `page.tsx:719` (the
  maxWidth 680 container).

## What ships

1. **Remove** (via `{false && …}` wrappers, already done for categories
   at `page.tsx:722-745`):
   - Cover image thumbnails on each article card
   - Ad slots in the feed (if any render for anon)
   - Breaking banner even when `canBreakingBanner === true` (owner choice)
   - Recap card
2. **Keep**:
   - Brand lockup at top
   - A single date line: "Wednesday, April 20"
   - The article list — one headline per row, tight serif typography
3. **Redesign each feed row** to be:
   ```
   {title}                                  ← serif, 22-28pt, weight 700
   {category} · {min read} · {source count} ← small caps, 11pt, muted
   ── horizontal rule ──
   ```
4. **Spacing:** 40px vertical between rows on desktop, 28px on mobile.
   The page should feel *long* and *calm*, not packed.
5. **Type pairing:** Source Serif 4 (already loaded) for headlines + Inter
   for the meta line. Already in `layout.js:15-27`.

## What it looks like in practice

Visiting the home page feels like picking up a small broadsheet. No
branding noise, no "YOU MIGHT LIKE" rails, no auto-playing video, no
category filters to click. You read down the list. You click a headline
you want. You're on the article.

This is the same visual language as a really well-designed newsletter —
except it's the whole home page.

## Risks / trade-offs

- **Bounce rate may go up** if first-time visitors expect grid UIs.
  Mitigation: the bounce rate for an ad-free subscription product matters
  less; the real KPI is quiz pass rate for signed-in users.
- **Cold-start problem.** New visitors with no signal of what Verity is
  about might not stick. Mitigation: a single line of landing copy above
  the date ("News with a quiz-gated comment section. Score 3/5 on the
  article quiz to join the discussion.") — already in the metadata,
  could render on first view only, hidden on return.
- **Editor-pick elevation.** If editorial wants to elevate one story per
  day, they lose the "above-the-fold cover image" move. Replacement: a
  tiny glyph next to the headline in `EDITOR'S PICK` small-caps (same
  pattern as #1's source badge). No hero image needed.

## Effort

~4 hours. Strip modules (mostly already hidden via launch flag), restyle
the feed rows, commit to serif. Most of the deletion work is already done.

## Why this one is lowest priority

It's an aesthetic move, not a thesis move. The quiet home is *lovely* but
it's not what makes Verity different — the earned chrome (#3) is.
Shipping #3 first + this later compounds: a quiet home that surfaces
articles whose comments are unlockable via quiz is the full brand in one
page.
