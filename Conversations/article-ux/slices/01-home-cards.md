# Slice 01 — Home card layout

**Status:** locked
**Last touched:** 2026-04-30 (Session 2 — Q&A, adversarial review, lock)
**Adversarial review:** complete
**Implementation session:** not yet scheduled

---

## Scope

Files investigated:
- `web/src/app/page.tsx`
- `web/src/app/_homeShared.ts`
- `web/src/app/_HomeBreakingStrip.tsx`
- `web/src/app/_HomeFooter.tsx`
- `web/src/app/_HomeFirstLoginMoment.tsx`
- `web/src/app/_HomeVisitTimestamp.tsx`
- `web/src/app/_HomeFetchFailed.tsx`

User states walked: anon, free signed-in, pro signed-in.

FK hint check: no `!foreign_key_name` disambiguation hints in home queries. `stories(slug, lifecycle_status)` is a column projection, not a hint. FK rule satisfied.

---

## Findings

### F1 — Double closing + bottom-of-page composition
**Status:** decided (two items deferred — see below)
**Priority:** HIGH

**Reader experience.** Two near-identical closing messages appear back-to-back: "That's today's front page." (`_HomeFooter.tsx:39`) followed by "That's today's edition." (`page.tsx:376`). For anon users, the sign-up CTA is sandwiched between them — the "Browse past editions →" link fires after the conversion ask. For signed-in users, "Browse all categories →" and "Browse past editions →" appear back-to-back with no hierarchy. The "today's edition" framing is also wrong for the product — the owner has confirmed the home feed should not be capped to a single day.

**Design decision.** Drop both closing sentences entirely. Drop "Browse past editions →" from `page.tsx:378–382`. The page ending is self-evident — no rolling live feed narrates its own close. Single footer zone, one action per auth state: for signed-in users, "Browse by category →" (shortened from current copy); for anon users, the sign-up pitch structure (copy deferred — see below).

**Deferred — CTA copy.** The current anon pitch ("Create a free account to unlock comments and track your reading streak.") uses gamification language ("reading streak") that undercuts the brand, and undersells the most differentiated feature (ask-an-expert). Expert panel recommended: something like "Read without limits. Join the conversation." But CTA copy should be decided after Slices 04 (discussion) and 05 (ask-an-expert) are investigated so the pitch reflects the real value. Defer to post-04/05 session.

**Deferred — feed pagination model.** The owner confirmed no "today only" cap. Whether the home feed becomes a rolling paginating feed ("Load more") or a curated fixed-N list (Drudge model — larger than 12 but finite, editor-controlled) is undecided. The bottom-of-page cleanup (dropping the two closings) can ship immediately regardless of this decision. Pagination implementation defers to when the feed model is decided.

**Fix plan (shippable now).**
- `_HomeFooter.tsx:39` — remove the `<p>` element containing "That's today's front page." (lines 31–40 of that file)
- `_HomeFooter.tsx:42–56` (signed-in branch) — update "Browse all categories →" copy to "Browse by category →"
- `page.tsx:368–384` — remove the edition-ender div entirely (the `<div>` with "That's today's edition." and the "Browse past editions →" Link)
- Keep `<HomeFooter />` render at `page.tsx:366` — the component is still needed for its auth-switching CTA structure

**Deferred fix.** CTA copy update and feed pagination — separate implementation session after Slices 04/05 are locked.

---

### F2 — Breaking strip pop-in
**Status:** decided
**Priority:** HIGH

**Reader experience.** For signed-in users the breaking strip is invisible on load, then pops into view above the masthead after the permission RPC resolves — causing a full layout shift in the most prominent position on the page. For anon users there is no delay.

**Design decision.** Server-render the strip immediately. Remove the `if (!permsReady) return null` guard. The timestamp is the only gated element — it appears additively after hydration when `canSeePaid` resolves to true. The strip's height does not change when the timestamp appears (it's a trailing inline element), so no layout shift occurs on hydration. Keep above-masthead placement — this is editorial convention for breaking news (AP, Reuters, BBC, CNN all use it) and is not tabloid when the visual treatment is restrained.

**Adversarial clarification.** The current href fallback (`story.stories?.slug ? '/${story.stories.slug}' : '#'`) already handles null slug. Add an explicit guard at top of render: `if (!story.stories?.slug) return null` to avoid rendering a non-navigable strip.

**Fix plan.**
- `_HomeBreakingStrip.tsx:39` — remove `if (!permsReady) return null`
- Add guard before the Link render: `if (!story.stories?.slug) return null;`
- Leave `canSeePaid` defaulting to `false` on first render — `useEffect` still runs and updates it; timestamp appears additively
- `permsReady` state variable can remain for internal use but no longer gates the render
- Optional polish: remove the nested dark pill background on "BREAKING" inside the strip (the strip itself is already a distinct visual zone; the nested pill is cable-news style redundancy). "BREAKING" as weighted letter-spaced inline text in the strip is enough. This is a CSS-only change.

---

### F3 — Two sources of truth for breaking state
**Status:** decided (implementation deferred to migration session)
**Priority:** MEDIUM

**Reader experience.** `articles.is_breaking` drives the breaking strip; `stories.lifecycle_status` drives the card lifecycle pill. Admin sets them independently. A reader who sees a BREAKING banner but finds no breaking treatment on the card experiences a trust inconsistency.

**Design decision.** `stories.lifecycle_status` is the canonical source of truth for story lifecycle state. `articles.is_breaking` is a write-convenience artifact that should write through to `lifecycle_status` or be removed entirely. One admin control, one fact. The breaking strip query (currently `.eq('is_breaking', true)` at `page.tsx:217`) should eventually filter on `stories.lifecycle_status = 'breaking'` via a join.

**Fix plan.** No home page code change needed now — this is a DB/admin layer fix. Implement in a dedicated migration session:
- Admin UI: expose one lifecycle status control on stories, not separate `is_breaking` and `lifecycle_status` toggles
- Breaking strip query: rewrite from `.eq('is_breaking', true)` to join-filter on `stories.lifecycle_status = 'breaking'`
- `articles.is_breaking` column: either remove from DB after all callers migrated, or maintain as a trigger-synced denormalization for query performance

---

### F4 — First-login moment
**Status:** decided
**Priority:** MEDIUM

**Reader experience.** 1.6-second full-screen white overlay, auto-dismisses, no user control. Copy "you made it." for new users with no referred/waitlist context. Fires once only.

**Design decision.** Keep the overlay — the cinematic ephemeral acknowledgment is right for this product's tone. Fix execution:
1. **Extend timing:** 200ms fade-in → 2000ms hold → 300ms fade-out (total 2500ms). Current 1.6s doesn't give the copy time to register as a felt moment. Eye-tracking research shows ~2.5s is needed for a 5-word sentence to form a recalled impression.
2. **Fix fallback copy:** "you made it." → "welcome to verity post." — lowercase, serif, period. The period signals declarative confidence. The product is a news publication, not an app; the copy should feel like a formal acknowledgment, not a celebration.
3. **Keep other variants:** "[Referrer] reads this every morning." (best variant — specific, social proof, behavioral) and "you've been on the list N days." (honors the wait, makes the reader feel selected) — both stay.
4. **No orientation in the overlay.** This is a tonal moment, not a tutorial. The news page is immediately self-evident. No arrows, buttons, or "here's how it works."

**Fix plan.**
- `_HomeFirstLoginMoment.tsx:107` — `outTimer`: change `1400` → `2200` (200ms fade-in + 2000ms hold)
- `_HomeFirstLoginMoment.tsx:108` — `doneTimer`: change `1600` → `2500`
- `_HomeFirstLoginMoment.tsx:87` — change `setCopy('you made it.')` → `setCopy('welcome to verity post.')`
- All other logic (copy variants, `onboarding_completed_at` write, `completedRef`, animation) unchanged

---

### F5 — Category pills not clickable
**Status:** decided
**Priority:** MEDIUM

**Reader experience.** Every card shows a category label (e.g., "POLITICS", "FINANCE") as a static `<span>`. Verified: `Eyebrow` at `page.tsx:480–495` renders `<span>` only. No path from the card to more stories in that category except the footer "Browse by category →" link.

**Design decision.** Make category labels links to `/category/${category.slug}`. Same visual style — uppercase, muted color, letter-spacing — unchanged. Underline on hover only. Cursor change to pointer is sufficient affordance at rest. Destination confirmed: `/app/category/[id]/page.js` resolves both UUID IDs and slugs (tries by ID first at line 34, then by slug at line 41), so `/category/${category.slug}` is correct.

**Adversarial clarifications.**
- The `Eyebrow` component at `page.tsx:480–495` is used only in `SupportingCard` (line 706) — it needs to become a Link.
- The hero card's category label is a **separate inline `<span>`** at `page.tsx:566–579` (white-on-dark, `rgba(255,255,255,0.65)`) — it is **not** using `Eyebrow`. It also needs to become a Link, with `textDecoration: 'none'` on the link and underline on hover only.
- Guard both: if `!category.slug`, fall back to `<span>` (no broken href).

**Fix plan.**
- `page.tsx:483–495` — `Eyebrow` component: change `<span>` to `<Link href={/category/${category.slug}}>`, add `textDecoration: 'none'` on the Link; guard: `if (!category.slug) return <span style={...}>{category.name}</span>`. Add `Link` import if not already present.
- `page.tsx:566–579` — hero category span: wrap in `<Link href={/category/${category.slug}}>` with `textDecoration: 'none'`, `color: 'inherit'`, `display: 'inline'`; keep existing span styling inside; same guard.

---

### F6 — `is_breaking` and `is_developing` redundant in home query
**Status:** decided
**Priority:** LOW

**Reader experience.** None directly — data model issue.

**Design decision.** Remove `is_breaking` and `is_developing` from `SELECT_COLS` and from the `HomeStory` type. They are not consumed by any rendering code (confirmed: `LifecyclePill` reads `stories.lifecycle_status` only; no conditional in rendering reads `story.is_breaking` or `story.is_developing`). Do NOT remove from the DB or from the breaking strip filter query (`.eq('is_breaking', true)` at `page.tsx:217`) — those stay until the F3 migration is complete.

**Adversarial clarification.** `SELECT_COLS` is a projection (what fields to return). The `.eq('is_breaking', true)` filter is a separate chained call — removing from SELECT_COLS does not remove the filter. These are independent.

**Fix plan.**
- `page.tsx:103` — `SELECT_COLS` string: remove `, is_breaking, is_developing` → `'id, title, stories(slug, lifecycle_status), excerpt, category_id, published_at'`
- `page.tsx:233` — top_stories select string also includes `is_breaking, is_developing` — remove same fields from that select
- `_homeShared.ts:9–13` — `HomeStory` type: remove `'is_breaking' | 'is_developing'` from the `Pick<>` call
- Breaking strip filter at `page.tsx:217` (`.eq('is_breaking', true)`) — leave unchanged

---

### F7 — System map says footer fires `page_view` — not present in code
**Status:** won't-fix
**Reason:** Global listener already covers this. `PageViewTrackListener` is mounted in `NavWrapper.tsx:426` and fires `page_view` on every route change including `/`. Adding a component-level event would double-count every home visit. The system map note in `00-system-map.md` is stale — remove it from the doc.

---

### F8 — No images on any card
**Status:** won't-fix
**Reason:** Deliberate editorial aesthetic, correct for this product. Text-only signals editorial confidence. The hero card's dark category-colored band (dark navy for politics, dark green for markets, etc.) provides visual hierarchy without photography. Supporting cards derive presence from typography and hairline rules. If images are introduced in the future, hero only, editorial weight only, via `next/image` with fixed aspect-ratio container. Won't-fix for this program.

---

## Adversarial review — new finding

### F9 — Empty feed state: just the masthead (new, found in adversarial review)
**Status:** deferred
**Priority:** LOW

**Finding.** If `displayedStories` is empty (no articles fetched, or feed returns 0 results), the home page renders only the masthead with nothing below. `_HomeFetchFailed.tsx:10–12` explicitly documents this: "Distinct from EmptyDay (which we don't currently render — empty days fall through to the empty `supporting` array and just show the masthead alone)."

**Why deferred.** With the move away from "today's edition" to a rolling feed, a truly empty feed state becomes extremely unlikely (the feed will draw from all published articles, not just today's). Address when the feed model is decided and implemented.

---

## Design decisions — summary

| Finding | Decision | Status |
|---|---|---|
| F1 — closing copy | Drop both closing sentences + Browse past editions link | Decided |
| F1 — CTA copy | Deferred to post-slices-04/05 | Deferred |
| F1 — feed model | Finite curated list vs. paginating — undecided | Deferred |
| F2 — strip pop-in | Server-render immediately; gate timestamp only | Decided |
| F3 — breaking source of truth | `lifecycle_status` canonical; migration session | Decided |
| F4 — first-login moment | Keep overlay; extend to 2.5s; fix fallback copy | Decided |
| F5 — category pills | Links to `/category/${slug}`; same style | Decided |
| F6 — redundant booleans | Remove from SELECT_COLS + HomeStory type | Decided |
| F7 — page_view tracking | Won't-fix; global listener exists | Won't-fix |
| F8 — no images | Won't-fix; deliberate aesthetic | Won't-fix |

---

## Fix plans — ready for implementation

| Finding | Files touched | Notes |
|---|---|---|
| F1 (partial) | `_HomeFooter.tsx`, `page.tsx` | Drop closing lines + Browse past editions; update signed-in CTA copy |
| F2 | `_HomeBreakingStrip.tsx` | Remove permsReady gate; add slug guard; optional BREAKING pill cleanup |
| F4 | `_HomeFirstLoginMoment.tsx` | Timer values + fallback copy |
| F5 | `page.tsx` | Eyebrow → Link; hero category span → Link; both guarded |
| F6 | `page.tsx`, `_homeShared.ts` | Remove is_breaking/is_developing from SELECT_COLS and HomeStory type |

F3 deferred (migration session). F7/F8 won't-fix. F1 CTA copy and feed pagination deferred.

---

## Adversarial review

**Conducted:** 2026-04-30 Session 2
**Result:** 6 clarifications absorbed into fix plans above; 1 new finding (F9) added as deferred; 2 decisions confirmed as still needed (both now explicitly deferred with named reasons).
