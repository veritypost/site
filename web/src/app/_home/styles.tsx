// Home stylesheet. Imported by HomeLayout.tsx so all home surfaces
// share one source of truth for `vp-rh-*` classes.
import React from 'react';

export default function RhStyles() {
  const css = `
    /* v2 palette — internal --rh-* tokens are aliases over the
       centralized --vp-* token block in app/globals.css (single source
       of truth for the burgundy editorial palette). Existing
       var(--rh-*) references throughout this stylesheet keep working;
       only the values below change. */
    .vp-rh {
      /* Owner call: cards should NOT contrast against the canvas —
         everything reads as one continuous cream surface. --rh-bg
         (used by every card body) and the page wrapper both map to
         var(--vp-bg). */
      --rh-bg: var(--vp-bg);
      --rh-ink: var(--vp-ink);
      --rh-ink-2: var(--vp-text-muted);
      --rh-ink-3: var(--vp-text-soft);
      --rh-accent: var(--vp-accent);
      --rh-accent-soft: var(--vp-accent-soft);
      --rh-accent-dark: var(--vp-accent-dark);
      --rh-border: var(--vp-border);
      --rh-border-soft: var(--vp-border-soft);
      --rh-surface-soft: var(--vp-surface-soft);
      background: var(--vp-bg);
      color: var(--rh-ink);
      min-height: 100vh;
    }
    /* Keep the light burgundy palette on dark mode rather than flipping
       the entire home to a dark theme. The article page made the same
       choice after the v2 migration; home should match. */
    @media (prefers-color-scheme: dark) {
      .vp-rh {
        --rh-bg: var(--vp-bg);
        --rh-ink: var(--vp-ink);
        --rh-ink-2: var(--vp-text-muted);
        --rh-ink-3: var(--vp-text-soft);
        --rh-accent: var(--vp-accent);
        --rh-accent-soft: var(--vp-accent-soft);
        --rh-accent-dark: var(--vp-accent-dark);
        --rh-border: var(--vp-border);
        --rh-border-soft: var(--vp-border-soft);
        --rh-surface-soft: var(--vp-surface-soft);
      }
    }

    /* Bundle 7 — font-family bindings. The CSS variables are sourced
       from next/font invocations in app/layout.js (single source of truth)
       and applied here via class hooks. .vp-rh inherits IBM Plex Sans
       as the body font; serif + mono classes opt into the editorial
       families. */
    .vp-rh {
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .vp-rh-title,
    .vp-rh-lead-title,
    .vp-rh-arrow,
    .vp-btn-rail__fig,
    .vp-btn-band-wide__fig {
      font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
    }
    .vp-rh-tag,
    .vp-rh-tag-accent {
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .vp-rh a { color: inherit; text-decoration: none; }
    .vp-rh-sr {
      position: absolute; width: 1px; height: 1px;
      padding: 0; margin: -1px; overflow: hidden;
      clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }
    .vp-rh-empty {
      text-align: center;
      padding: 96px 24px;
      color: var(--rh-ink-3);
      font-style: italic;
    }

    /* ============ GRID ============
       12-track grid drives the layout from >=720px. Slots set
       grid-column: span N (N in {3,4,6,8,12}) on their outer element
       to claim a fraction of the row -- span 8 fills the main column,
       span 4 fills the right rail. Below 720px the grid collapses to
       a single column and the .vp-rh-grid > * rule forces every slot
       to a full row regardless of its declared span. Legacy slot kinds
       whose CSS already declares grid-column: 1 / -1 work unchanged. */
    /* Pill search bar at the top of the home grid. White surface on
       the cream canvas, soft warm shadow, rounded pill chrome. Owner
       call 2026-05-16. */
    .vp-rh-search {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      max-width: 720px;
      margin: 8px auto 4px;
      padding: 12px 20px;
      background: var(--vp-surface);
      border: 1px solid var(--vp-border);
      border-radius: 999px;
      box-shadow: 0 6px 18px rgba(20, 16, 12, 0.04);
      box-sizing: border-box;
    }
    .vp-rh-search__icon { color: var(--vp-text-soft); flex-shrink: 0; }
    .vp-rh-search__input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      color: var(--vp-ink);
    }
    .vp-rh-search__input::placeholder { color: var(--vp-text-soft); }
    .vp-rh-search:focus-within {
      border-color: var(--vp-accent);
      box-shadow: 0 6px 18px rgba(20, 16, 12, 0.04), 0 0 0 3px var(--vp-accent-soft);
    }
    .vp-rh-search-wrap {
      position: relative;
      width: 100%;
      max-width: 720px;
      margin: 8px auto 4px;
    }
    .vp-rh-search-wrap .vp-rh-search { margin: 0; max-width: none; }
    /* Live-search dropdown — sits flush under the search pill,
       matches its width, rounded chrome, soft warm shadow. */
    .vp-rh-search-results {
      margin-top: 8px;
      background: var(--vp-surface);
      border: 1px solid var(--vp-border);
      border-radius: 18px;
      box-shadow: 0 18px 48px rgba(20, 16, 12, 0.08);
      max-height: 480px;
      overflow-y: auto;
    }
    .vp-rh-search-results__empty {
      margin: 0;
      padding: 16px 20px;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      color: var(--vp-text-soft);
    }
    .vp-rh-search-results__list {
      list-style: none;
      margin: 0;
      padding: 6px;
    }
    .vp-rh-search-results__item { margin: 0; }
    .vp-rh-search-results__link {
      display: block;
      padding: 10px 14px;
      border-radius: 12px;
      text-decoration: none;
      color: var(--vp-ink);
      transition: background 0.12s;
    }
    .vp-rh-search-results__link:hover {
      background: var(--vp-accent-soft);
    }
    .vp-rh-search-results__kicker {
      display: block;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--vp-accent);
      font-weight: 700;
      margin-bottom: 4px;
    }
    .vp-rh-search-results__title {
      display: block;
      font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
      font-size: 15px;
      line-height: 1.2;
      color: var(--vp-ink);
    }
    .vp-rh-search-results__dek {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-top: 4px;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      color: var(--vp-text-muted);
    }
    .vp-rh-search-results__seeall {
      display: block;
      width: 100%;
      padding: 12px 18px;
      border: 0;
      border-top: 1px solid var(--vp-border-soft);
      background: transparent;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--vp-accent);
      cursor: pointer;
      text-align: left;
    }
    .vp-rh-search-results__seeall:hover {
      background: var(--vp-accent-soft);
    }

    /* Two-band masthead browse nav.
       Band 1 = the taxonomy spine: 20 top-level categories typeset as
       quiet Plex Sans text links (NOT pills, NOT serif — research
       panel converged: serif reserved for editorial body content,
       all-caps mono reserved for kicker meta, Plex Sans 13/500 with
       slight tracking reads as wayfinding furniture).
       Band 2 = cross-cutting filters (Today / Most discussed / etc.)
       in IBM Plex Mono 11px caps — visually demoted vs categories
       because they are lenses applied to a destination, not
       destinations themselves. */
    /* Unified masthead block — search pill, catbar, subcatbar, and
       filter strip all share one white surface with a single soft
       border + rounded corners. Internal hairlines separate the
       bands so it reads as one masthead module instead of four
       disconnected bars on cream. */
    .vp-rh-masthead {
      width: 100%;
      max-width: 1408px;
      margin: 8px auto 0;
      background: var(--vp-surface);
      border: 1px solid var(--vp-border-soft);
      border-radius: 22px;
      box-shadow: 0 6px 18px rgba(20, 16, 12, 0.04);
      /* No overflow: hidden — the catbar's hover flyouts need to
         escape below the masthead. Rounded corners still trim the
         filled background via border-radius alone. */
      position: relative;
      z-index: 5;
    }
    .vp-rh-masthead .vp-rh-search-wrap {
      max-width: none;
      margin: 0;
    }
    .vp-rh-masthead .vp-rh-search {
      border: 0;
      border-radius: 0;
      box-shadow: none;
      border-bottom: 1px solid var(--vp-border-soft);
      max-width: none;
      margin: 0;
      padding: 14px 20px;
      background: transparent;
    }
    .vp-rh-masthead .vp-rh-search:focus-within {
      border-color: transparent;
      border-bottom-color: var(--vp-accent);
      box-shadow: none;
    }
    .vp-rh-catbar {
      width: 100%;
      max-width: none;
      margin: 0;
      background: transparent;
      border-top: 0;
      border-bottom: 1px solid var(--vp-border-soft);
    }
    .vp-rh-catbar__inner {
      display: flex;
      align-items: center;
      gap: 28px;
      padding: 12px 24px;
      /* overflow-x: clip allows overflow-y: visible (auto/scroll on
         one axis forces the other to clip in CSS spec). Hover flyouts
         can now escape downward without being clipped. Long category
         lists overflow horizontally with no scrollbar — flex-wrap on
         narrow viewports handles the wrap. */
      overflow-x: clip;
      overflow-y: visible;
      white-space: nowrap;
    }
    @media (max-width: 720px) {
      .vp-rh-catbar__inner {
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        gap: 18px;
        padding: 10px 16px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .vp-rh-catbar__inner::-webkit-scrollbar { display: none; }
    }
    .vp-rh-catbar__link {
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: var(--vp-ink);
      text-decoration: none;
      flex-shrink: 0;
      position: relative;
      padding-bottom: 4px;
      transition: color 0.12s;
    }
    .vp-rh-catbar__link:hover { color: var(--vp-accent); }
    .vp-rh-catbar__link[aria-current="page"] {
      font-weight: 600;
      color: var(--vp-ink);
    }
    .vp-rh-catbar__link[aria-current="page"]::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: -1px;
      height: 2px;
      background: var(--vp-accent);
    }
    .vp-rh-catbar__link--home {
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--vp-text-soft);
      padding-right: 12px;
      border-right: 1px solid var(--vp-border-soft);
    }
    .vp-rh-catbar__link--home:hover { color: var(--vp-accent); }
    /* Subcategory rail — only renders when an active topic is in
       the URL. Shows the active category's subcategories so the
       reader who clicked "Politics" sees Congress / Supreme Court /
       White House / Elections without leaving the page. */
    .vp-rh-subcatbar {
      width: 100%;
      max-width: 1408px;
      margin: 0 auto;
      background: var(--vp-surface);
      border-bottom: 1px solid var(--vp-border-soft);
    }
    .vp-rh-subcatbar__inner {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 10px 24px;
      overflow-x: auto;
      scrollbar-width: none;
      white-space: nowrap;
    }
    .vp-rh-subcatbar__inner::-webkit-scrollbar { display: none; }
    /* All-subs variant on the home — flex-wrap into multiple rows
       grouped by parent. Each group reads: parent name kicker +
       subs after it; thin divider between groups. */
    .vp-rh-subcatbar__inner--wrap {
      flex-wrap: wrap;
      overflow-x: visible;
      white-space: normal;
      gap: 4px 14px;
      padding: 10px 20px;
    }
    .vp-rh-subcat-group {
      display: inline-flex;
      align-items: baseline;
      gap: 10px;
    }
    .vp-rh-subcat-group__head {
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--vp-text-soft);
    }
    .vp-rh-subcat-group__sep {
      display: inline-block;
      width: 1px;
      height: 12px;
      background: var(--vp-border);
      align-self: center;
      margin: 0 4px;
    }
    .vp-rh-subcatbar__link {
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      font-weight: 400;
      color: var(--vp-text-muted);
      text-decoration: none;
      flex-shrink: 0;
      transition: color 0.12s;
    }
    .vp-rh-subcatbar__link:hover { color: var(--vp-accent); }
    .vp-rh-subcatbar__link[aria-current="page"] {
      color: var(--vp-accent);
      font-weight: 500;
    }
    /* Filter strip — mono caps, smaller than categories, visually
       distinct as "lenses" rather than destinations. */
    .vp-rh-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      align-items: center;
      justify-content: center;
      max-width: 1408px;
      margin: 0 auto;
      padding: 12px 24px;
    }
    .vp-rh-masthead .vp-rh-filters {
      max-width: none;
      margin: 0;
      padding: 10px 24px;
    }
    @media (max-width: 720px) {
      .vp-rh-filters {
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        justify-content: flex-start;
        gap: 14px;
        padding: 10px 16px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .vp-rh-filters::-webkit-scrollbar { display: none; }
      .vp-rh-masthead .vp-rh-filters { padding: 10px 16px; }
    }
    .vp-rh-masthead .vp-rh-subcatbar {
      max-width: none;
      margin: 0;
    }
    .vp-rh-filter {
      display: inline-flex;
      align-items: center;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vp-text-soft);
      text-decoration: none;
      white-space: nowrap;
      transition: color 0.12s;
    }
    .vp-rh-filter:hover { color: var(--vp-accent); }
    .vp-rh-filter[aria-current="page"] {
      color: var(--vp-accent);
    }
    .vp-rh-filter__sep {
      display: inline-block;
      width: 1px;
      height: 14px;
      background: var(--vp-border);
      margin: 0 2px;
    }

    /* New layout shape — full-width top band, 2-col body (main left +
       rail right, independent vertical stacks), full-width bottom band.
       Replaces the previous 12-col paired-row grid so rail-card
       spacing doesn't lock to story-card heights and vice versa. */
    .vp-rh-grid {
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 1440px;
      margin-left: auto;
      margin-right: auto;
      padding: 16px;
      box-sizing: border-box;
    }
    @media (max-width: 599px) {
      .vp-rh-grid { padding: 12px; gap: 16px; }
    }
    /* Body wraps the main + rail columns. Mobile collapses both
       columns into a single feed and reorders slots by their
       position via the order property + the --slot-order custom
       variable set on each wrapper. Desktop keeps the two-column
       flex layout so main and rail flow independently. */
    .vp-rh-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .vp-rh-body__main,
    .vp-rh-body__rail {
      display: contents;
    }
    .vp-rh-body .vp-rh-slot {
      order: var(--slot-order, 0);
    }
    @media (min-width: 900px) {
      .vp-rh-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 32px;
      }
      .vp-rh-body__main {
        display: flex;
        flex-direction: column;
        gap: 0;
        min-width: 0;
      }
      .vp-rh-body__rail {
        display: flex;
        flex-direction: column;
        gap: 24px;
        min-width: 0;
      }
      .vp-rh-body .vp-rh-slot { order: 0; }
      /* Hero gets a tiny gap before the first story card so its
         shadow doesn't crowd the next headline. */
      .vp-rh-body__main > .vp-rh-slot:has(.vp-rh-story-card--hero) {
        margin-bottom: 24px;
      }
    }
    /* Rail cards are capped at 320px max-width inside a 360px rail
       column. Right-align each slot wrapper on desktop so the rail
       cards' right edge sits flush with the right edge of the top
       banner (which spans the full grid width). Stretch on mobile
       since rails fill the body width there. */
    .vp-rh-body__rail > .vp-rh-slot {
      display: flex;
      justify-content: flex-end;
    }
    @media (max-width: 899px) {
      .vp-rh-body__rail > .vp-rh-slot { justify-content: stretch; }
    }
    .vp-rh-grid__top,
    .vp-rh-grid__bottom {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Section head — mono label + optional "more" link. Grid-spans the row;
       used by cluster slots that opt in via config.title. */
    .vp-rh-sect-head {
      grid-column: 1 / -1;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 24px 24px 12px;
      border-bottom: 1px solid var(--rh-border);
    }
    .vp-rh-sect-head__title {
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--rh-ink-2);
      font-weight: 500;
    }
    .vp-rh-sect-head__more {
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rh-accent);
      font-weight: 500;
    }
    .vp-rh-sect-head__more:hover { color: var(--rh-accent-dark); }

    /* ============ DENSITY WALL (cluster slot) ============ */
    .vp-rh-density-wall {
      grid-column: 1 / -1;
      padding: 0 24px 24px;
    }
    .vp-rh-density-wall .vp-rh-sect-head {
      padding-left: 0;
      padding-right: 0;
    }
    @media (min-width: 720px) {
      .vp-rh-density-wall { padding: 0 32px 32px; }
    }
    @media (min-width: 1100px) {
      .vp-rh-density-wall { padding: 0 40px 40px; }
    }
    .vp-rh-story-preview {
      padding: 16px 0;
      border-bottom: 1px solid var(--rh-border-soft);
      display: block;
    }
    .vp-rh-story-preview:last-child { border-bottom: 0; }
    .vp-rh-density-wall .vp-rh-card-ad {
      border-right: 0;
      border-bottom: 1px solid var(--rh-border-soft);
      padding: 16px 0;
      min-height: 0;
    }
    .vp-rh-density-wall .vp-rh-card-ad:last-child { border-bottom: 0; }
    .vp-rh-story-preview__kicker {
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
    }
    .vp-rh-story-preview__kicker .sep {
      margin: 0 8px;
      opacity: 0.6;
    }
    .vp-rh-story-preview__title {
      margin: 6px 0 6px;
      font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
      font-size: 22px;
      line-height: 1.05;
      letter-spacing: -0.025em;
      font-weight: 400;
      color: var(--rh-ink);
    }
    .vp-rh-story-preview__title a {
      color: inherit;
      text-decoration: none;
    }
    @media (hover: hover) and (pointer: fine) {
      .vp-rh-story-preview__title a:hover { color: var(--rh-accent-dark); }
    }
    .vp-rh-story-preview__summary {
      margin: 0;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--rh-ink-2);
      max-width: 62ch;
    }
    .vp-rh-story-state {
      margin-top: 10px;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: var(--rh-ink-3);
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }

    /* ============ CARD ============ */
    .vp-rh-card {
      background: var(--rh-bg);
      color: var(--rh-ink);
      padding: 26px 48px 26px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: background .15s, color .15s;
      border-right: 1px solid var(--rh-border);
      border-bottom: 1px solid var(--rh-border);
      position: relative;
      cursor: pointer;
    }
    @media (min-width: 720px) {
      .vp-rh-grid > .vp-rh-card:nth-child(2n) { border-right: none; }
      /* Wave 4 — incomplete trailing 2-col row: last card in col 1 with col 2
         empty leaves a stray right border floating in whitespace. Drop it. */
      .vp-rh-grid > .vp-rh-card:last-child:nth-child(2n+1) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-rh-grid > .vp-rh-card:nth-child(2n) { border-right: 1px solid var(--rh-border); }
      .vp-rh-grid > .vp-rh-card:nth-child(3n) { border-right: none; }
      /* Wave 4 — incomplete trailing 3-col row: last card terminates the
         visual flow at col 1 (3n+1) or col 2 (3n+2). Right border becomes a
         stray vertical bar in empty space. */
      .vp-rh-grid > .vp-rh-card:last-child:nth-child(3n+1),
      .vp-rh-grid > .vp-rh-card:last-child:nth-child(3n+2) { border-right: none; }
    }

    /* persistent click cue on regular cards */
    .vp-rh-arrow {
      position: absolute;
      bottom: 20px;
      right: 22px;
      font-size: 22px;
      font-weight: 600;
      color: var(--rh-accent);
      transition: color .15s, transform .15s;
      line-height: 1;
    }

    /* Hover — subtle burgundy-cream tint instead of the older
       invert-to-black behavior. Gated on hover-capable devices so touch
       taps don't trigger a brief flash (mobile tap would otherwise
       :hover-stick until the next tap elsewhere). */
    @media (hover: hover) and (pointer: fine) {
      .vp-rh-card:hover {
        background: var(--rh-accent-soft);
      }
      .vp-rh-card:hover .vp-rh-arrow {
        color: var(--rh-accent-dark);
        transform: translateX(4px);
      }
      .vp-rh-card-ad:hover {
        background: var(--rh-bg);
      }
    }

    /* keyboard focus — card-shaped outline so Tab users see the focus
       indicator at the card border, not just on the inner Link. */
    .vp-rh-card:focus-within {
      outline: 2px solid var(--rh-accent);
      outline-offset: -2px;
    }
    .vp-rh-lead:focus-within {
      outline: 2px solid var(--rh-accent);
      outline-offset: -2px;
    }

    /* ad cell — same border treatment as article cards, but suppresses
       the hover tint and the persistent arrow cue (those are article
       affordances; the ad has its own click target and visual). */
    .vp-rh-card-ad {
      cursor: default;
      padding: 16px 24px;
      min-height: 120px;
    }
    .vp-rh-card-ad .vp-rh-arrow { display: none; }

    /* tag chip — Plex Mono, calmer letter-spacing (was 0.2em + weight 700,
       which read as ALL-CAPS shouty against the new editorial chrome). */
    .vp-rh-tag {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rh-accent);
      background: transparent;
      font-weight: 500;
      align-self: flex-start;
      padding: 4px 0;
    }
    .vp-rh-tag--lead { font-size: 11px; }
    .vp-rh-tag-accent {
      color: var(--rh-accent);
      background: transparent;
    }

    /* density-wall card title — editorial weight 400 matches the hero,
       so the page reads as one typography system rather than display
       headlines bolted onto an editorial centerpiece. */
    .vp-rh-title {
      margin: 0;
      font-weight: 400;
      font-size: 22px;
      line-height: 1.15;
      letter-spacing: -0.025em;
      color: var(--rh-ink);
    }
    .vp-rh-summary {
      margin: 0;
      font-size: 14.5px;
      line-height: 1.55;
      color: var(--rh-ink-2);
      font-weight: 400;
      max-width: 60ch;
    }

    /* ============ LEAD ============ */
    /* v2 hero — cream gradient + warm border + soft elevation + radius 28.
       Weight 400 with tight letter-spacing reads as editorial elegance,
       not display punch. Hover state is intentionally suppressed (the
       card is its own destination; no need to invert). */
    .vp-rh-lead {
      cursor: default;
      padding: 22px 18px;
      background: linear-gradient(180deg, var(--rh-bg) 0%, var(--rh-surface-soft) 100%);
      border: 1px solid var(--rh-border);
      border-radius: 22px;
      box-shadow: 0 12px 28px rgba(20, 16, 12, 0.05);
    }
    @media (hover: hover) and (pointer: fine) {
      .vp-rh-lead:hover {
        background: linear-gradient(180deg, var(--rh-bg) 0%, var(--rh-surface-soft) 100%);
      }
    }
    .vp-rh-lead-link {
      display: contents;
    }
    .vp-rh-lead-content {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .vp-rh-lead-title {
      margin: 8px 0 12px;
      font-size: 32px;
      line-height: 1.0;
      letter-spacing: -0.035em;
      font-weight: 400;
      color: var(--rh-ink);
    }
    .vp-rh-lead-summary {
      margin: 0 0 14px;
      font-size: 15px;
      line-height: 1.5;
      color: var(--rh-ink-2);
      max-width: 60ch;
    }

    @media (min-width: 720px) {
      .vp-rh-lead {
        grid-column: 1 / -1;
        border-right: 1px solid var(--rh-border);
        padding: 32px 36px;
        border-radius: 28px;
        box-shadow: 0 18px 48px rgba(20, 16, 12, 0.06);
      }
      .vp-rh-lead-content { max-width: 880px; }
      .vp-rh-lead-title { font-size: clamp(38px, 4vw, 56px); max-width: 22ch; margin: 10px 0 12px; }
      .vp-rh-lead-summary { font-size: 17px; line-height: 1.55; max-width: 60ch; }

      /* When the parent story has timeline data, the lead splits into
         a 1.618:1 content/timeline grid. */
      .vp-rh-lead-with-timeline {
        display: grid;
        grid-template-columns: 1.618fr 1fr;
        gap: 40px;
        align-items: start;
      }
      .vp-rh-lead-with-timeline .vp-rh-lead-content { max-width: none; }
      .vp-rh-lead-with-timeline .vp-rh-lead-title { font-size: clamp(36px, 3.6vw, 44px); max-width: 18ch; }
    }
    @media (min-width: 1100px) {
      .vp-rh-lead { padding: 44px 48px; }
      .vp-rh-lead-with-timeline .vp-rh-lead-title { font-size: clamp(40px, 3.8vw, 48px); }
    }

    /* Timeline preview inside lead — round-dotted, vertical-connector,
       gray-label variant matching the v2 mock's .lead-timeline. */
    .vp-rh-timeline {
      border-left: 0;
      padding-left: 0;
      margin-top: 24px;
      border-top: 1px solid var(--rh-border-soft);
      padding-top: 18px;
    }
    @media (min-width: 720px) {
      .vp-rh-timeline {
        border-left: 1px solid var(--rh-border-soft);
        padding-left: 20px;
        margin-top: 0;
        border-top: 0;
        padding-top: 0;
      }
    }
    .vp-rh-tl-label {
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
      margin-bottom: 14px;
      display: block;
      font-weight: 500;
    }
    .vp-rh-timeline ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .vp-rh-tl-event {
      position: relative;
      padding: 0 0 14px 18px;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: var(--rh-ink);
    }
    .vp-rh-tl-event::before {
      content: "";
      position: absolute;
      left: 0;
      top: 5px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--rh-ink-3);
    }
    .vp-rh-tl-event::after {
      content: "";
      position: absolute;
      left: 3.5px;
      top: 13px;
      bottom: -2px;
      width: 1px;
      background: var(--rh-border);
    }
    .vp-rh-tl-event:last-child::after { display: none; }
    .vp-rh-tl-event--now::before {
      background: var(--rh-accent);
      box-shadow: 0 0 0 3px var(--rh-accent-soft);
    }
    .vp-rh-tl-event--now {
      font-weight: 600;
      color: var(--rh-accent-dark);
    }
    .vp-rh-tl-date {
      display: block;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
      margin-bottom: 2px;
    }
    .vp-rh-tl-event--now .vp-rh-tl-date {
      color: var(--rh-accent);
    }

    /* ============ AD: TICKER ============
       v2 cream-soft chrome (was always-dark black bg + green/yellow text). */
    .vp-rh-ticker {
      grid-column: 1 / -1;
      background: var(--rh-surface-soft);
      color: var(--rh-ink);
      border: 1px solid var(--rh-border);
      border-radius: 14px;
      font-size: 10px;
      padding: 8px 24px;
      display: flex;
      gap: 40px;
      overflow: hidden;
      white-space: nowrap;
      letter-spacing: 0.06em;
    }
    .vp-rh-ticker .item span { color: var(--rh-ink); font-size: 13px; margin-left: 6px; }
    .vp-rh-ticker .sponsor {
      color: var(--rh-accent);
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 700;
      border-left: 1px solid var(--rh-border-soft);
      padding-left: 40px;
      margin-left: auto;
    }

    /* ============ AD: INSIGHT ROW ============ */
    .vp-rh-insight {
      grid-column: 1 / -1;
      background: var(--rh-surface-soft);
      border-top: 2px solid var(--rh-accent);
      border-bottom: 2px solid var(--rh-accent);
      padding: 48px 32px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 32px;
      align-items: center;
    }
    @media (min-width: 900px) {
      .vp-rh-insight { grid-template-columns: 1fr 1.618fr; padding: 64px 48px; gap: 48px; }
    }
    .vp-rh-insight .label {
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #ffffff;
      background: var(--rh-accent);
      padding: 4px 10px;
      align-self: flex-start;
      font-weight: 700;
    }
    .vp-rh-insight h3 {
      margin: 16px 0 8px;
      font-size: 24px;
      line-height: 1.15;
      letter-spacing: -0.018em;
      color: var(--rh-ink);
    }
    .vp-rh-insight p {
      margin: 0;
      font-size: 14px;
      color: var(--rh-ink-2);
      line-height: 1.5;
    }
    .vp-rh-insight .chart {
      height: 200px;
      background: repeating-linear-gradient(45deg, var(--rh-border-soft), var(--rh-border-soft) 10px, var(--rh-surface-soft) 10px, var(--rh-surface-soft) 20px);
      border: 1px solid var(--rh-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: var(--rh-ink-3);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    /* ============ AD: DISCOVERY (chumbox) ============ */
    .vp-rh-discovery {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr;
      background: var(--rh-border);
      gap: 1px;
      border-top: 2px solid var(--rh-accent);
    }
    @media (min-width: 720px) {
      .vp-rh-discovery { grid-template-columns: 1fr 1fr; }
    }
    @media (min-width: 1100px) {
      .vp-rh-discovery { grid-template-columns: repeat(4, 1fr); }
    }
    .vp-rh-discovery a {
      background: var(--rh-bg);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: background .15s, color .15s;
    }
    @media (hover: hover) and (pointer: fine) {
      .vp-rh-discovery a:hover { background: var(--rh-accent-soft); }
    }
    .vp-rh-discovery .source {
      font-size: 9px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
    }
    .vp-rh-discovery .title {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.22;
      letter-spacing: -0.01em;
      color: var(--rh-ink);
    }

    /* ============ ENGAGEMENT (quiz card) ============
       v2 cream-soft chrome with burgundy stroke (was always-dark #0a0a0a).
       Same chrome family as the article page quiz. */
    .vp-quiz-card {
      background: var(--rh-surface-soft);
      color: var(--rh-ink);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 0;
      border: 1px solid var(--rh-accent);
      border-radius: 22px;
      min-height: 220px;
      position: relative;
    }
    @media (min-width: 720px) {
      .vp-quiz-card { padding: 28px; }
    }
    @media (min-width: 1100px) {
      .vp-quiz-card { padding: 32px; }
    }

    /* ============ LIST RAIL ============
       v2 cream-soft chrome (was always-dark island). Cream rather than
       white so the rail reads as its own surface against the white cards. */
    /* List-rail (trending/most-read) — same rounded chrome family
       as .vp-rh-rail-card so all right-rail modules read as one
       set. */
    /* Trending list_rail — same white surface chrome as rail cards. */
    .vp-rail-block {
      background: var(--vp-surface);
      color: var(--rh-ink);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      max-width: 320px;
      height: 211px;
      min-height: 211px;
      max-height: 211px;
      box-sizing: border-box;
      margin: 0;
      border: 1px solid var(--rh-border-soft);
      border-radius: 18px;
      box-shadow: 0 6px 18px rgba(20, 16, 12, 0.04);
      overflow: hidden;
      flex-shrink: 0;
    }
    @media (max-width: 899px) {
      .vp-rail-block {
        max-width: 100%;
        height: auto;
        min-height: 0;
        max-height: none;
        background: transparent;
      }
    }
    .vp-rail__title {
      margin: 0;
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--rh-accent);
      font-weight: 700;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--rh-border-soft);
    }
    @media (min-width: 720px) {
      .vp-rail-block { padding: 28px; }
    }
    @media (min-width: 1100px) {
      .vp-rail-block { padding: 32px; }
    }

    /* ============ SECOND LEAD (feature take) ============ */
    .vp-feature-take {
      background: var(--rh-bg);
      color: var(--rh-ink);
      padding: 24px;
      border-right: 1px solid var(--rh-border);
      border-bottom: 1px solid var(--rh-border);
      position: relative;
      cursor: pointer;
      transition: background .15s, color .15s;
      grid-column: 1 / -1;
    }
    .vp-feature-take__link {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    .vp-feature-take__art {
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: var(--rh-surface-soft);
    }
    .vp-feature-take__body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .vp-feature-take__cat {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--rh-accent);
    }
    .vp-feature-take__hed {
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.018em;
      color: var(--rh-ink);
    }
    .vp-feature-take__dek {
      margin: 0;
      font-size: 15px;
      line-height: 1.5;
      color: var(--rh-ink-2);
      max-width: 60ch;
    }
    @media (min-width: 720px) {
      .vp-feature-take { padding: 32px; }
      .vp-feature-take__link {
        grid-template-columns: 1.2fr 1fr;
        gap: 28px;
        align-items: start;
      }
      .vp-feature-take__art { aspect-ratio: 4 / 3; }
      .vp-feature-take__hed { font-size: 32px; max-width: 18ch; }
    }
    @media (min-width: 1100px) {
      .vp-feature-take { padding: 40px; }
      .vp-feature-take__hed { font-size: 38px; }
      .vp-feature-take__dek { font-size: 16px; }
    }
    @media (hover: hover) and (pointer: fine) {
      .vp-feature-take:hover {
        background: var(--rh-accent-soft);
      }
      .vp-feature-take:hover .vp-feature-take__hed { color: var(--rh-accent-dark); }
    }

    /* ============ SECTION HEAD (shared by river / frontline / editors-band) ============ */
    .vp-section-head {
      grid-column: 1 / -1;
      padding: 32px 24px 12px;
      border-bottom: 1px solid var(--rh-border);
    }
    .vp-section-head__label {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--rh-accent);
    }
    @media (min-width: 720px) {
      .vp-section-head { padding: 40px 32px 14px; }
    }
    @media (min-width: 1100px) {
      .vp-section-head { padding: 48px 40px 16px; }
    }

    /* ============ WIDE STRIP (river) ============ */
    .vp-river-section {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr;
      border-bottom: 1px solid var(--rh-border);
    }
    .vp-river-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      border-top: 1px solid var(--rh-border);
    }
    @media (min-width: 720px) {
      .vp-river-grid { grid-template-columns: 1fr 1fr; }
      .vp-river-grid > .vp-river-card:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-river-grid { grid-template-columns: repeat(4, 1fr); }
      .vp-river-grid > .vp-river-card:nth-child(2n) { border-right: 1px solid var(--rh-border); }
      .vp-river-grid > .vp-river-card:nth-child(4n) { border-right: none; }
    }
    .vp-river-card {
      background: var(--rh-bg);
      color: var(--rh-ink);
      padding: 20px;
      border-right: 1px solid var(--rh-border);
      border-bottom: 1px solid var(--rh-border);
      display: flex;
      flex-direction: column;
      gap: 10px;
      cursor: pointer;
      transition: background .15s, color .15s;
    }
    .vp-river-card__link {
      display: grid;
      gap: 10px;
    }
    .vp-river-card__art {
      width: 100%;
      aspect-ratio: 4 / 3;
      overflow: hidden;
      background: var(--rh-surface-soft);
    }
    .vp-river-card__cat {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--rh-accent);
    }
    .vp-river-card__hed {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.01em;
      color: var(--rh-ink);
    }
    .vp-river-card__dek {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: var(--rh-ink-2);
    }
    .vp-river-card__meta {
      margin-top: auto;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
      padding-top: 8px;
    }
    @media (hover: hover) and (pointer: fine) {
      .vp-river-card:hover {
        background: var(--rh-accent-soft);
      }
      .vp-river-card:hover .vp-river-card__hed { color: var(--rh-accent-dark); }
    }

    /* ============ SECONDARY PAIR (front line) ============ */
    .vp-frontline {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr;
      border-bottom: 1px solid var(--rh-border);
    }
    .vp-frontline__grid {
      display: grid;
      grid-template-columns: 1fr;
      border-top: 1px solid var(--rh-border);
    }
    @media (min-width: 720px) {
      .vp-frontline__grid { grid-template-columns: 1fr 1fr; }
      .vp-frontline__grid > .vp-frontline__card:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-frontline__grid { grid-template-columns: repeat(4, 1fr); }
      .vp-frontline__grid > .vp-frontline__card:nth-child(2n) { border-right: 1px solid var(--rh-border); }
      .vp-frontline__grid > .vp-frontline__card:nth-child(4n) { border-right: none; }
    }
    .vp-frontline__card {
      background: var(--rh-bg);
      color: var(--rh-ink);
      padding: 20px 24px 24px;
      border-right: 1px solid var(--rh-border);
      border-bottom: 1px solid var(--rh-border);
      display: flex;
      cursor: pointer;
      transition: background .15s, color .15s;
    }
    .vp-frontline__link {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    .vp-frontline__cat {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--rh-accent);
    }
    .vp-frontline__cat::before {
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--cat-dot, var(--rh-accent));
      border-radius: 50%;
      flex-shrink: 0;
    }
    .vp-frontline__hed {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.012em;
      color: var(--rh-ink);
    }
    .vp-frontline__dek {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: var(--rh-ink-2);
    }
    .vp-frontline__meta {
      margin-top: auto;
      padding-top: 8px;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
    }
    @media (hover: hover) and (pointer: fine) {
      .vp-frontline__card:hover {
        background: var(--rh-accent-soft);
      }
      .vp-frontline__card:hover .vp-frontline__hed { color: var(--rh-accent-dark); }
    }

    /* ============ EDITORS PICKS (worth your time) ============ */
    .vp-editors-band {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr;
      background: var(--rh-surface-soft);
      border-bottom: 1px solid var(--rh-border);
    }
    .vp-editors-band__grid {
      display: grid;
      grid-template-columns: 1fr;
      border-top: 1px solid var(--rh-border);
    }
    @media (min-width: 720px) {
      .vp-editors-band__grid { grid-template-columns: 1fr 1fr; }
      .vp-editors-band__grid > .vp-editors-band__card:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-editors-band__grid { grid-template-columns: repeat(3, 1fr); }
      .vp-editors-band__grid > .vp-editors-band__card:nth-child(2n) { border-right: 1px solid var(--rh-border); }
      .vp-editors-band__grid > .vp-editors-band__card:nth-child(3n) { border-right: none; }
    }
    .vp-editors-band__card {
      background: var(--rh-surface-soft);
      color: var(--rh-ink);
      padding: 20px 24px;
      border-right: 1px solid var(--rh-border);
      border-bottom: 1px solid var(--rh-border);
      cursor: pointer;
      transition: background .15s, color .15s;
    }
    .vp-editors-band__link {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .vp-editors-band__cat {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--rh-accent);
    }
    .vp-editors-band__hed {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      line-height: 1.22;
      letter-spacing: -0.01em;
      color: var(--rh-ink);
    }
    .vp-editors-band__dek {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: var(--rh-ink-2);
      max-width: 50ch;
    }
    @media (hover: hover) and (pointer: fine) {
      .vp-editors-band__card:hover {
        background: var(--rh-accent-soft);
      }
      .vp-editors-band__card:hover .vp-editors-band__hed { color: var(--rh-accent-dark); }
    }

    /* ============ BY THE NUMBERS — compact rail ============
       v2 cream-soft chrome (was always-dark island). Same treatment as
       .vp-rail-block / .vp-quiz-card. */
    .vp-btn-rail {
      background: var(--rh-surface-soft);
      color: var(--rh-ink);
      padding: 24px;
      border: 1px solid var(--rh-border);
      border-radius: 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 220px;
    }
    @media (min-width: 720px) {
      .vp-btn-rail { padding: 28px; }
    }
    @media (min-width: 1100px) {
      .vp-btn-rail { padding: 32px; }
    }
    .vp-btn-rail__label {
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--rh-accent);
    }
    .vp-btn-rail__fig {
      margin-top: auto;
      font-size: 56px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--rh-accent);
    }
    .vp-btn-rail__cap {
      font-size: 13px;
      line-height: 1.4;
      color: var(--rh-ink-2);
      max-width: 28ch;
    }
    .vp-btn-rail__sub {
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
      padding-top: 4px;
    }

    /* ============ BY THE NUMBERS — wide band ============ */
    .vp-btn-band-wide {
      grid-column: 1 / -1;
      background: var(--rh-surface-soft);
      border-top: 2px solid var(--rh-accent);
      border-bottom: 2px solid var(--rh-accent);
      padding: 40px 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .vp-btn-band-wide__label {
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--rh-accent);
    }
    .vp-btn-band-wide__grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 32px;
    }
    .vp-btn-band-wide__fig {
      font-size: 64px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--rh-accent);
    }
    .vp-btn-band-wide__cap {
      margin-top: 8px;
      font-size: 14px;
      line-height: 1.45;
      color: var(--rh-ink-2);
      max-width: 32ch;
    }
    @media (min-width: 720px) {
      .vp-btn-band-wide { padding: 56px 40px; gap: 32px; }
      .vp-btn-band-wide__grid { grid-template-columns: repeat(3, 1fr); gap: 40px; }
      .vp-btn-band-wide__fig { font-size: 80px; }
    }
    @media (min-width: 1100px) {
      .vp-btn-band-wide { padding: 72px 56px; }
      .vp-btn-band-wide__fig { font-size: 96px; }
      .vp-btn-band-wide__cap { font-size: 15px; }
    }

    /* ============ MOCK-GRID KINDS ============
       Wave 8 -- banner + 3fr/1fr body + bottom-squares structure. Outer
       grid-column claim happens on the wrapper div emitted by
       HomeLayout (style={{ gridColumn: span N }}); these classes style
       the slot's own contents. */

    /* ── top_banner (span 12) ── */
    /* Top banner — rounded chrome on the cream canvas (matches the
       hero + rail family). 1px warm border, 28px corner radius,
       soft drop shadow. Stretches full width of its container so
       it aligns with the body grid edges. */
    .vp-rh-banner {
      background: transparent;
      border: 1px solid var(--rh-border);
      border-radius: 28px;
      box-shadow: 0 18px 48px rgba(20, 16, 12, 0.06);
      margin: 0;
      overflow: hidden;
      box-sizing: border-box;
    }
    .vp-rh-banner__link {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      color: inherit;
      text-decoration: none;
    }
    @media (min-width: 720px) {
      .vp-rh-banner__link { grid-template-columns: 1.4fr 1fr; }
    }
    .vp-rh-banner__art {
      aspect-ratio: 16 / 9;
      background-size: cover;
      background-position: center;
      background-color: var(--rh-surface-soft);
      order: 2;
    }
    @media (min-width: 720px) {
      .vp-rh-banner__art { order: 1; aspect-ratio: auto; min-height: 280px; }
    }
    .vp-rh-banner__body {
      padding: 28px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      justify-content: center;
      order: 1;
    }
    @media (min-width: 720px) {
      .vp-rh-banner__body { order: 2; padding: 40px 32px; }
    }
    .vp-rh-banner__cat {
      margin: 0;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--rh-accent);
      font-weight: 600;
    }
    .vp-rh-banner__title {
      margin: 0;
      font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
      font-size: clamp(28px, 3.6vw, 44px);
      line-height: 1.05;
      letter-spacing: -0.025em;
      font-weight: 400;
      color: var(--rh-ink);
    }
    .vp-rh-banner__dek {
      margin: 0;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      line-height: 1.5;
      color: var(--rh-ink-2);
      max-width: 56ch;
    }
    .vp-rh-banner--ad { padding: 12px; }

    /* Thin variant — top-of-page ad strip (configurable as story or
       ad). Sized like a standard leaderboard / billboard ad so it
       reads as inventory above the hero rather than as editorial
       content. Capped height + overflow hidden keeps everything
       inside the strip even if an article gets routed in here. */
    .vp-rh-banner--thin {
      max-height: 120px;
      overflow: hidden;
    }
    .vp-rh-banner--thin .vp-rh-banner__link {
      grid-template-columns: 1fr;
      align-items: center;
    }
    .vp-rh-banner--thin .vp-rh-banner__body {
      padding: 12px 20px;
      gap: 4px;
    }
    @media (min-width: 720px) {
      .vp-rh-banner--thin .vp-rh-banner__body { padding: 14px 28px; }
    }
    .vp-rh-banner--thin .vp-rh-banner__title {
      font-size: clamp(15px, 1.4vw, 18px);
      line-height: 1.2;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .vp-rh-banner--thin .vp-rh-banner__dek {
      font-size: 12px;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .vp-rh-banner--thin .vp-rh-banner__cat { font-size: 10px; }

    /* ── story_card (span 8 — main column) ──
       Content-driven height with a hairline divider on desktop;
       rounded chrome on mobile so the merged feed reads as a
       uniform stack. */
    .vp-rh-story-card {
      background: transparent;
      border-bottom: 1px solid var(--rh-border-soft);
    }
    .vp-rh-story-card--hero { border-bottom: 0; }
    @media (max-width: 899px) {
      .vp-rh-story-card:not(.vp-rh-story-card--hero) {
        border: 1px solid var(--rh-border);
        border-radius: 18px;
        box-shadow: 0 6px 18px rgba(20, 16, 12, 0.04);
        overflow: hidden;
      }
    }
    .vp-rh-story-card__link {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      padding: 20px 24px;
      color: inherit;
      text-decoration: none;
    }
    @media (min-width: 720px) {
      .vp-rh-story-card__link {
        grid-template-columns: 1fr;
        align-items: center;
        gap: 24px;
        padding: 24px 28px;
      }
    }
    .vp-rh-story-card__body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .vp-rh-story-card__cat {
      margin: 0;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--rh-accent);
      font-weight: 600;
    }
    .vp-rh-story-card__title {
      margin: 0;
      font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
      font-size: clamp(20px, 1.8vw, 26px);
      line-height: 1.1;
      letter-spacing: -0.02em;
      font-weight: 400;
      color: var(--rh-ink);
    }
    .vp-rh-story-card__dek {
      margin: 0;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--rh-ink-2);
    }
    .vp-rh-story-card__art {
      aspect-ratio: 4 / 3;
      background-size: cover;
      background-position: center;
      background-color: var(--rh-surface-soft);
      border-radius: 6px;
    }
    @media (min-width: 720px) {
      .vp-rh-story-card__art { aspect-ratio: 1 / 1; }
    }
    .vp-rh-story-card--ad { padding: 12px 24px; }

    /* Hero variant — driven by slot.config.variant='hero'. Used by pos 20
       to give the first story card a taller, larger-type treatment so it
       reads as the lead of the page. At >=900px the link becomes a
       2-column grid: headline + dek on the left, timeline strip on
       the right. Below that breakpoint the timeline stacks under the
       dek so the headline still wins the viewport.
       The cluster chrome (cream gradient + accent-tinted border +
       soft elevation + 28px radius) mirrors the lead-cluster module
       in redesign-preview.html so the hero reads as a distinct
       cluster rather than just a larger row. */
    .vp-rh-story-card--hero {
      border: 1px solid var(--rh-border);
      border-radius: 28px;
      /* White → ivory gradient matching the .lead-cluster treatment
         in redesign-preview.html. Lifts the hero off the cream
         canvas so the lead reads as the page's spotlight. Mobile
         drops the gradient so the hero sits cream-on-cream like the
         rest of the merged feed. */
      background: linear-gradient(180deg, var(--vp-surface) 0%, var(--vp-surface-soft) 100%);
      box-shadow: 0 18px 48px rgba(20, 16, 12, 0.06);
      overflow: hidden;
      margin: 0;
    }
    @media (max-width: 899px) {
      .vp-rh-story-card--hero { background: transparent; }
    }
    .vp-rh-story-card--hero .vp-rh-story-card__link {
      padding: 28px;
      gap: 16px;
      display: grid;
      grid-template-columns: 1fr;
    }
    .vp-rh-story-card--hero .vp-rh-story-card__title {
      font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
      font-size: clamp(28px, 3.4vw, 44px);
      line-height: 1.05;
      letter-spacing: -0.02em;
      font-weight: 400;
    }
    .vp-rh-story-card--hero .vp-rh-story-card__dek {
      font-size: 16px;
      max-width: 60ch;
    }
    @media (min-width: 720px) {
      .vp-rh-story-card--hero .vp-rh-story-card__link { padding: 36px; }
    }
    @media (min-width: 900px) {
      .vp-rh-story-card--hero .vp-rh-story-card__link {
        grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
        gap: 32px;
        align-items: center;
      }
    }

    /* Meta strip directly under the dek — "DEVELOPING · N timeline
       entries · M sources · Last changed Xm ago". Lifecycle label is
       accent-red mono caps so it reads as a status badge; the rest is
       muted mono. Separators are middle dots. */
    .vp-rh-hero-meta {
      margin: 0;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
      color: var(--rh-ink-3);
      display: flex;
      flex-wrap: wrap;
      gap: 6px 8px;
      align-items: baseline;
    }
    .vp-rh-hero-meta__seg { display: inline-flex; gap: 8px; align-items: baseline; }
    .vp-rh-hero-meta__sep { opacity: 0.5; }
    .vp-rh-hero-meta__lifecycle {
      color: var(--rh-accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    /* "Changed today: ..." note — only renders when there's a same-day
       timeline event. Border-left accent + muted prose, matching the
       lead__change treatment in redesign-preview.html. */
    .vp-rh-hero-change {
      margin: 8px 0 0;
      padding: 2px 0 2px 10px;
      border-left: 2px solid var(--rh-accent);
      font-size: 14px;
      line-height: 1.45;
      color: var(--rh-ink-2);
      max-width: 60ch;
    }
    .vp-rh-hero-change__lede {
      font-weight: 600;
      color: var(--rh-ink);
    }

    /* "How we got here" rail — compact chronology to the right of the
       hero headline + dek. Each event has a dot + connector line on
       the left, a mono date label above the heading, and an optional
       body line below. Today's entry uses the accent color with a
       larger ring around its dot. Modeled after .tl-event in
       redesign-preview.html. */
    .vp-rh-hero-timeline {
      border-left: 1px solid var(--rh-border-soft);
      padding-left: 20px;
    }
    /* Mobile: hide the hero timeline — it stacks under the dek and
       eats most of the viewport. Readers see the full timeline once
       they tap into the article. */
    @media (max-width: 899px) {
      .vp-rh-hero-timeline { display: none; }
    }
    .vp-rh-hero-timeline__label {
      margin: 0 0 4px;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--rh-accent);
    }
    .vp-rh-hero-timeline__count {
      margin: 0 0 16px;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      color: var(--rh-ink-3);
    }
    .vp-rh-hero-timeline__list {
      display: block;
    }
    .vp-rh-tl-event {
      position: relative;
      padding: 0 0 14px 18px;
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: var(--rh-ink);
      display: block;
    }
    .vp-rh-tl-event::before {
      content: "";
      position: absolute;
      left: 0;
      top: 5px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--rh-ink-3);
    }
    .vp-rh-tl-event::after {
      content: "";
      position: absolute;
      left: 3.5px;
      top: 13px;
      bottom: -2px;
      width: 1px;
      background: var(--rh-border);
    }
    .vp-rh-tl-event:last-child::after { display: none; }
    /* "Today" event treatment — boxed card with accent border and
       soft accent fill, mirroring the article-page TimelineSection
       NOW_EVENT_STYLE. The card pulls back into the spine with a
       negative margin so the halo dot sits where the regular row
       dots would. Connector line under the box is suppressed because
       it shouldn't visually continue through the boxed pill. */
    .vp-rh-tl-event--now {
      margin-left: -12px;
      padding: 12px 14px;
      border: 1px solid var(--rh-accent);
      border-radius: 14px;
      background: var(--rh-accent-soft);
      color: var(--rh-accent-dark);
      font-weight: 500;
    }
    .vp-rh-tl-event--now::before {
      left: 7px;
      top: 17px;
      background: var(--rh-accent);
      box-shadow: 0 0 0 3px var(--rh-accent-soft);
    }
    .vp-rh-tl-event--now::after { display: none; }
    .vp-rh-tl-event__date {
      display: block;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
      margin-bottom: 2px;
    }
    .vp-rh-tl-event--now .vp-rh-tl-event__date {
      color: var(--rh-accent);
      padding-left: 14px;
    }
    .vp-rh-tl-event__head { display: block; font-weight: 600; color: var(--rh-ink); }
    .vp-rh-tl-event--now .vp-rh-tl-event__head {
      color: var(--rh-accent-dark);
      padding-left: 14px;
    }
    .vp-rh-tl-event__sub {
      display: block;
      margin-top: 2px;
      font-weight: 400;
      color: var(--rh-ink-2);
    }
    .vp-rh-tl-event--now .vp-rh-tl-event__sub {
      color: var(--rh-accent-dark);
      padding-left: 14px;
    }

    /* Non-hero story cards flow naturally in the main column —
       content-driven height, separated by 24px column gap and a
       hairline bottom border. */

    /* ── rail_card (span 4 — right rail, 1:1) ── */
    /* Owner call 2026-05-16: drop the aspect-ratio 1/1 square so the
       row height is driven by the story_card content next to it.
       The square was making every story+rail row ~400px tall — a
       lot of whitespace inside the story_card. Pair height now
       matches slot 13's compact rhythm.
       Second call 2026-05-16: rail_card should NOT stretch to match
       the adjacent story_card — it sits at its natural content
       height (align-self: start) and the empty space below it in
       the grid row stays blank. Same applies to .vp-rail-block. */
    /* Rail card — rounded chrome on the cream canvas: 1px warm
       border, 18px corner radius, soft shadow, padded body. Outer
       margin gives consistent vertical rhythm between consecutive
       rail cards. */
    /* Rail card — fixed 320 × 211 footprint with rounded chrome on
       every breakpoint. White surface matching .rail-card in
       redesign-preview.html so the rail cards lift off the cream
       canvas. Stretches to fill the body width on mobile. */
    .vp-rh-rail-card {
      background: var(--vp-surface);
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 320px;
      height: 211px;
      min-height: 211px;
      max-height: 211px;
      box-sizing: border-box;
      margin: 0;
      border: 1px solid var(--rh-border-soft);
      border-radius: 18px;
      box-shadow: 0 6px 18px rgba(20, 16, 12, 0.04);
      overflow: hidden;
      flex-shrink: 0;
    }
    @media (max-width: 899px) {
      .vp-rh-rail-card {
        max-width: 100%;
        height: auto;
        min-height: 0;
        max-height: none;
        background: transparent;
      }
    }
    /* align-self goes on the grid item itself — the slot wrapper
       emitted by HomeLayout — not the inner card. */
    .vp-rh-grid > [data-slot-kind="rail_card"],
    .vp-rh-grid > [data-slot-kind="list_rail"] {
      align-self: start;
    }
    .vp-rh-rail-card__link {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 8px;
      padding: 14px 16px;
      color: inherit;
      text-decoration: none;
      box-sizing: border-box;
    }
    @media (max-width: 899px) {
      .vp-rh-rail-card__link {
        padding: 24px 28px;
        gap: 8px;
      }
    }
    .vp-rh-rail-card__cat {
      margin: 0;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--rh-accent);
      font-weight: 600;
    }
    .vp-rh-rail-card__title {
      margin: 0;
      font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
      font-size: 14px;
      line-height: 1.2;
      letter-spacing: -0.01em;
      font-weight: 400;
      color: var(--rh-ink);
      /* Clamp to at most 4 lines so the headline always fits inside
         the 211px card height; longer titles wrap and trail with an
         ellipsis instead of extending past the rail. */
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    /* Dek is hidden by default — the desktop rail card is a compact
       320 × 211 cell with no room for a summary. Mobile re-enables
       it so the rail reads like a horizontal story card. */
    .vp-rh-rail-card__dek { display: none; }
    @media (max-width: 899px) {
      .vp-rh-rail-card__dek {
        display: block;
        margin: 0;
        font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: var(--rh-ink-2);
      }
      .vp-rh-rail-card__title {
        font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
        font-size: clamp(20px, 1.8vw, 26px);
        line-height: 1.1;
        letter-spacing: -0.02em;
        -webkit-line-clamp: 3;
      }
    }
    .vp-rh-rail-card--ad {
      padding: 8px;
      align-items: stretch;
      justify-content: stretch;
    }

    /* List variant — same chrome as the single-article rail.
       Content-driven height so it sits in the same rhythm as the
       horizontal story cards. */
    .vp-rh-rail-card--list {
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      padding: 18px 20px;
      gap: 10px;
    }
    .vp-rh-rail-card__list-label {
      margin: 0;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--rh-accent);
      font-weight: 600;
    }
    .vp-rh-rail-card__list-rows {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .vp-rh-rail-card__list-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: baseline;
      padding: 7px 0;
      border-top: 1px solid var(--rh-border-soft);
    }
    .vp-rh-rail-card__list-row:first-child { border-top: 0; padding-top: 2px; }
    .vp-rh-rail-card__list-title {
      font-family: var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      line-height: 1.25;
      color: var(--rh-ink);
      text-decoration: none;
      font-weight: 500;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .vp-rh-rail-card__list-badge {
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      color: var(--rh-ink-3);
      white-space: nowrap;
    }

    /* ── square_row (span 12 — bottom 5-up squares) ── */
    /* Square row reads as the same cream canvas as the rest of
       the home — each cell is a card with the same rounded chrome
       as the rails. Drops the seam-style borders that made the
       footer look like a separate slab. */
    .vp-rh-square-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      background: transparent;
    }
    @media (min-width: 720px) {
      .vp-rh-square-row { grid-template-columns: repeat(5, 1fr); }
    }
    .vp-rh-square {
      aspect-ratio: 1 / 1;
      background: transparent;
      border: 1px solid var(--rh-border);
      border-radius: 18px;
      box-shadow: 0 6px 18px rgba(20, 16, 12, 0.04);
      display: flex;
      overflow: hidden;
    }
    @media (max-width: 899px) {
      .vp-rh-square { aspect-ratio: auto; min-height: 0; }
    }
    .vp-rh-square__link {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 6px;
      padding: 14px;
      color: inherit;
      text-decoration: none;
    }
    .vp-rh-square__cat {
      margin: 0;
      font-family: var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--rh-accent);
      font-weight: 600;
    }
    .vp-rh-square__title {
      margin: 0;
      font-family: var(--font-source-serif), Georgia, 'Times New Roman', serif;
      font-size: 14px;
      line-height: 1.15;
      letter-spacing: -0.01em;
      font-weight: 400;
      color: var(--rh-ink);
    }
    .vp-rh-square--ad { padding: 6px; }
    .vp-rh-square--empty { background: var(--rh-surface-soft); }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
