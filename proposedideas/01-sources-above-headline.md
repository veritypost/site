# 01 — Sources above the headline ("the trust headline")

## The idea

Before the article headline, render a small-caps line of the outlets this
piece was reported from. Not a footer credit. Not a "Read the original"
link at the bottom. **Above the headline**, as the first thing a reader
sees.

```
REPORTED FROM · NYT · REUTERS · BBC

Supreme Court narrowly upholds
federal wiretap framework

By Verity Editorial · 4 min read · Apr 20
```

## Why it's different

Every other news site treats sourcing as a footnote. Verity already stores
the source relationship in the DB (articles ↔ sources join). Surfacing it
as the lead visual element converts it from a compliance artifact into a
trust signal.

Corollary: articles drawn from 3+ independent outlets can earn a visible
badge (small dot next to the "Reported from" line). Optional.

## Where it lives

- **File:** `web/src/app/story/[slug]/page.tsx`
- **Area:** the article header block (category + title + byline area,
  currently around lines 780-800 in the `.tab-article` section)
- **Data:** already fetched — `sources` array comes from the existing
  Supabase query (same block that loads `timeline`). See
  `page.tsx:409-411`.

## What ships

1. Add a small-caps divider line above the category badge that renders the
   list of sources joined with ` · `.
2. Style: 11px letter-spacing 0.06em, uppercase, color `var(--muted)`,
   margin-bottom 12px.
3. If sources array is empty or 1, hide the line entirely (graceful fallback).
4. Optional: if `sources.length >= 3`, prepend a small ● glyph in
   `var(--accent)` color — no label needed.

## Risks / trade-offs

- Some articles may currently have stale or placeholder source data. Verify
  the live DB's `sources` table is clean before shipping, or gate on
  `sources.filter(s => s.is_verified).length`.
- Source outlet names could collide with trademark display rules on
  mobile (width). Truncate at 3 and append "+2 more" as a tooltip.

## Effort

~1 hour. Data already exists; this is render-only.
