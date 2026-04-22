# Web — Bookmarks

**File:** `web/src/app/bookmarks/page.tsx`
**Owner:** Wroblewski (list UX).
**Depends on:** `08_DESIGN_TOKENS.md`, `11_PAYWALL_REWRITE.md`.
**DB touchpoints:** `bookmarks`, `articles`.

---

## Current state

Saved articles list. Permission gate: `bookmarks.list.view`. Free tier: 10-cap. Paid tier: unlimited. At-cap banner shown.

## What changes

### At-cap surface → invitation voice

Current: generic "Bookmark limit reached" message.

New per `11_PAYWALL_REWRITE.md`:

```
You've saved 10 bookmarks.

That's the free tier limit. Verity Pro removes the cap — save everything, organize into collections, export for later.

7-day free trial, then $12.99/mo.

[ Start free trial ]
[ Not now ]
```

Uses `LockModal` with `surface="bookmarkCap"` per the paywall refactor.

### Collections

Paid tier gets collections. Existing feature per recon. Token pass.

### List UX

- Articles ordered by save date, descending.
- Each bookmark shows: headline, summary (or just fact beat), saved date, reading time, remove button.
- Hairline dividers between bookmarks.
- Empty state: "Nothing saved yet. Bookmark articles from the story page to find them here later."

## Files

- `web/src/app/bookmarks/page.tsx` — paywall surface swap, token pass, empty state.

## Acceptance criteria

- [ ] At-cap paywall uses invitation voice via `LockModal`.
- [ ] Collections render for paid tier.
- [ ] Token pass.
- [ ] Empty state copy is warm.
- [ ] Accessibility: list semantics, keyboard nav.

## Dependencies

Ship after `11_PAYWALL_REWRITE.md`, `08_DESIGN_TOKENS.md`.
