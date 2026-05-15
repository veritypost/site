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
      --rh-bg: var(--vp-surface);
      --rh-ink: var(--vp-ink);
      --rh-ink-2: var(--vp-text-muted);
      --rh-ink-3: var(--vp-text-soft);
      --rh-accent: var(--vp-accent);
      --rh-accent-soft: var(--vp-accent-soft);
      --rh-accent-dark: var(--vp-accent-dark);
      --rh-border: var(--vp-border);
      --rh-border-soft: var(--vp-border-soft);
      --rh-surface-soft: var(--vp-surface-soft);
      background: var(--rh-bg);
      color: var(--rh-ink);
      min-height: 100vh;
    }
    /* Keep the light burgundy palette on dark mode rather than flipping
       the entire home to a dark theme. The article page made the same
       choice after the v2 migration; home should match. */
    @media (prefers-color-scheme: dark) {
      .vp-rh {
        --rh-bg: var(--vp-surface);
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

    /* ============ GRID ============ */
    .vp-rh-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      max-width: 1440px;
      margin-left: auto;
      margin-right: auto;
    }
    @media (min-width: 720px) {
      .vp-rh-grid {
        grid-template-columns: 1fr 1fr;
        border-left: 1px solid var(--rh-border);
      }
    }
    @media (min-width: 1100px) {
      .vp-rh-grid { grid-template-columns: 1fr 1fr 1fr; }
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
    .vp-rail-block {
      background: var(--rh-surface-soft);
      color: var(--rh-ink);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      border: 1px solid var(--rh-border);
      border-radius: 18px;
      min-height: 220px;
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
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
