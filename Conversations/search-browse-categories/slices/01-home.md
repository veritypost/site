# Slice 01 — Home Feed

**Status:** locked
**Session:** 2026-04-29 (Session 2)
**Locked decisions:** 5 (edition model, top stories, previous editions, personalization, breaking strip)

---

## What this slice covers

The home feed is the entry point for every reader. It exists on web (`web/src/app/page.tsx`) and iOS (`HomeView.swift`). This slice locks the design direction for the home experience before execution begins.

---

## The core model: daily edition, not feed

The home feed is a **daily edition** — a finite, editorially curated set of articles that a reader can actually finish. Not a river. Not infinite scroll. Not the 20 most-recent articles regardless of date.

The distinction matters more than it sounds. A river trains readers to leave rather than finish. An edition trains readers to complete and return. The psychological difference between "I stopped scrolling" and "I finished today's edition" is the difference between compulsion and habit. This product competes on the second.

Each edition has a shape: top stories, today's articles, a clear end. When a reader has opened everything, the product says something like *"That's today's edition."* Then it stops. No recommendations, no infinite scroll, no "you might also like." The stop is the product.

---

## Locked decision 1: Top Stories replaces the single daily hero

The current `hero_pick_for_date` system (one article pinned to one calendar day) is replaced by a **Top Stories pinned stack**.

The editor pins 1–5 stories into the Top Stories section. There is no date limit — a major story goes up Monday and stays through Thursday if it's still the most important thing happening. The editor sets positions (1st, 2nd, 3rd) and removes stories manually when they're no longer top-priority. No automatic expiry, no calendar logic.

This mirrors how Drudge Report has operated for 25 years: editorial judgment about importance is continuous, not calendar-locked. The product communicates what matters, not what's newest.

**Admin flow:** Open a story → "Pin to Top Stories" → set position → stays until manually removed or replaced.

**Why this is better than the current model:** The single daily hero forces an editorial decision to expire at midnight regardless of whether the story is still the most important thing. Top Stories gives editors a living editorial front page they manage directly.

The `hero_pick_for_date`, `hero_pick_set_at`, `hero_pick_set_by` columns on `articles` are superseded by this model. A new `top_stories` table or a pinned-positions mechanism on articles needs to be designed in execution. The exact schema is deferred to the execution program.

---

## Locked decision 2: Edition model, scope, and previous editions

**Scope:** 8–12 articles per edition. The top stories anchor the top (editor-pinned, variable count). Below them, today's new articles fill the edition. The total visible on home is editorially curated, not algorithmically selected.

**Volume lives in categories, not the home feed.** As publishing scales — 10, 30, 50 articles per day — the home edition stays 8–12 curated picks. The rest live in their respective category pages. Readers who want more go deeper via categories. The home feed never bloats.

**Web and iOS: same model.** The current divergence (web fetches 20 most-recent with no date filter; iOS filters to today only) is wrong on both ends. The edition model replaces both. The home feed shows the editorial top stories stack plus today's articles, never an undated river of the 20 most-recent regardless of day.

**Previous editions:** When a reader finishes today's edition, the end state offers "Yesterday's edition →". Each previous day is its own discrete, completable artifact — its own front page, its own top stories, its own end. Navigable by date. Never appended to the current day's feed. The archive is deep; the home feed is finite.

---

## Locked decision 3: Personalization — home feed is never touched

The editorial front page is sacred. No reranking, no preferred-category float, no "in your interests" labels anywhere on the home feed. The editor's selection is the product.

`user_preferred_categories` stays in the schema but is not populated or read for any home feed purpose. A "My Feed" personalization surface (explicit category preferences, non-exclusionary, depth-first rather than more-of-same) is a future program, not this one. The seams for it should be kept in mind when designing category pages (Slice 03) and browse (Slice 02) so it slots in cleanly later.

**Why:** At current publishing volume, personalizing the home feed narrows a set that isn't dense enough to absorb filtering without visible gaps. The editorial identity is built on the premise that the editors decide what matters. Personalization on the home feed contradicts that premise. The right surface for personalization is an adjacent view, not the front page.

**Named deferred:** My Feed — explicit category preference selection, depth-first curation, adjacent surface. Trigger conditions: 500+ MAU, 600+ published articles, consistent publishing across 8+ categories.

---

## Locked decision 4: Breaking strip open to all readers

The breaking strip is visible to every reader, regardless of subscription tier. Hiding it from free users is a credibility problem: the strip is proof of editorial judgment, and hiding it from the people you're trying to convert means hiding the thing you're asking them to pay for.

**The paywall lives on the article, not the alert.** A free reader sees "BREAKING: [headline]" → clicks → hits the upgrade gate with urgency built in. That is the highest-intent conversion moment in the product. Every breaking story that goes live is a conversion opportunity that the current model throws away.

**The paid perk is proactive delivery, not strip visibility.** Paid subscribers get push/email alerts when something breaks — the product comes to them. Free users find out when they check the feed. "We reach out to you" vs. "you find out when you visit" is a real, felt tier difference.

**Editorial discipline:** The strip has signal value that degrades with use. Use it 4–6 times a year at most. Require two-person editorial sign-off before it goes live. Remove it when the story moves from breaking to developing — a strip that's still up 8 hours later wasn't breaking news, it was a feature that wasn't dismissed. When the strip is rare, it means something. When it's common, it means nothing.

The permission keys `home.breaking_banner.view` (currently gates strip visibility for free users) and `home.breaking_banner.view.paid` (gates timestamp) need to be restructured in execution: strip visibility moves to all-users, proactive alert delivery becomes the paid gate.

---

## Read-state and "new" badge

**Read-state dimming:** Articles the reader has opened appear visually quieter in the feed — dimmed title, not hidden. The top stories section is exempt: pinned editorial picks always appear at full visual weight regardless of whether the reader has opened them. The editor's recommendation for what matters doesn't expire when you've read it.

**Web:** Current implementation (reading_log query, last 200 entries, 30 days) is correct. Keep it.

**iOS:** Local UserDefaults set, capped at 200 article IDs. Written on article open. No network round-trip on home load. Cross-device sync (reading_log query on home load, matching web) is a named deferred item — ship local first.

**"New" badge:** Articles published since the reader's last visit get a badge. Semantics: no badge on first visit (no reference point). Write the last-visit timestamp after the first successful load, not before. Web: `vp_last_home_visit_at` cookie. iOS: UserDefaults timestamp key, same semantics.

**Named deferred:** Cross-device read-state sync via reading_log query on iOS home load.

---

## Cross-surface seams this slice affects

- **Browse (Slice 02):** The "today's volume lives in categories" model means category pages need to be well-designed — they're where readers go after finishing the home edition. Browse needs to surface this naturally.
- **Categories (Slice 03):** Category pages become first-class editorial surfaces, not just filtered article lists. The home edition sends readers there.
- **My Feed (future program):** Browse (Slice 02) is where the "follow a category" affordance should live. The home edition is never personalized, but the seam for My Feed should be kept in mind when designing browse and categories.
- **Top Stories schema:** The execution program needs to design the data model for editor-pinned top stories. `hero_pick_for_date` is superseded. The exact approach (new table vs. a pinned-positions column) is an execution decision.

---

## What this slice does not decide

- Exact copy for the edition end state (pixel-level deferred)
- Visual design of the "new" badge (typographic, not a red dot — polish pass)
- Exact push/email alert delivery mechanism for paid breaking news (implementation detail for execution)
- Top stories schema (execution program designs it)
- My Feed surface (future program)
