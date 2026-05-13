// Home stylesheet. Imported by HomeLayout.tsx so all home surfaces
// share one source of truth for `vp-rh-*` classes.
import React from 'react';

export default function RhStyles() {
  const css = `
    .vp-rh {
      --rh-bg: var(--p-bg, #ffffff);
      --rh-ink: var(--p-ink, #000000);
      --rh-ink-2: var(--p-ink-soft, #2a2a2a);
      --rh-ink-3: var(--p-ink-muted, #6a6a6a);
      --rh-accent: #ff2d00;
      background: var(--rh-bg);
      color: var(--rh-ink);
      min-height: 100vh;
    }
    /* Brand-red accent stays scoped to .vp-rh. The light value is the
       editorial red; the dark variant brightens for AA contrast against
       the dark page background. Not tokenized in globals.css because
       --p-accent is product-blue, not brand-red — keeping these
       distinct avoids collapsing two different design intents. */
    @media (prefers-color-scheme: dark) {
      .vp-rh { --rh-accent: #ff5a3a; }
    }
    :root.dark .vp-rh,
    [data-theme="dark"] .vp-rh { --rh-accent: #ff5a3a; }

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
    .vp-rh-tag-accent,
    .vp-rh-tl-label,
    .vp-rh-readmore,
    .vp-rh-timeline li strong {
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
        border-left: 1px solid var(--rh-ink);
      }
    }
    @media (min-width: 1100px) {
      .vp-rh-grid { grid-template-columns: 1fr 1fr 1fr; }
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
      border-right: 1px solid var(--rh-ink);
      border-bottom: 1px solid var(--rh-ink);
      position: relative;
      cursor: pointer;
    }
    @media (min-width: 720px) {
      .vp-rh-grid > .vp-rh-card:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-rh-grid > .vp-rh-card:nth-child(2n) { border-right: 1px solid var(--rh-ink); }
      .vp-rh-grid > .vp-rh-card:nth-child(3n) { border-right: none; }
    }

    /* persistent click cue on regular cards */
    .vp-rh-arrow {
      position: absolute;
      bottom: 20px;
      right: 22px;
      font-size: 22px;
      font-weight: 600;
      color: var(--rh-ink-3);
      transition: color .15s, transform .15s;
      line-height: 1;
    }

    /* hover-invert — gated on hover-capable devices so touch taps don't
       trigger a brief inverted flash (mobile tap would otherwise
       :hover-stick until the next tap elsewhere). */
    @media (hover: hover) {
      .vp-rh-card:hover {
        background: var(--rh-ink);
        color: var(--rh-bg);
      }
      .vp-rh-card:hover .vp-rh-title,
      .vp-rh-card:hover .vp-rh-summary { color: var(--rh-bg); }
      /* Tag chip on hover. Use --rh-bg (dark in dark theme, light in
         light theme) on top of brand-red --rh-accent so contrast stays
         AA in both themes — light-on-red was sub-AA in dark mode. */
      .vp-rh-card:hover .vp-rh-tag { background: var(--rh-accent); color: var(--rh-bg); }
      .vp-rh-card:hover .vp-rh-arrow {
        color: var(--rh-accent);
        transform: translateX(4px);
      }
      .vp-rh-card-ad:hover {
        background: var(--rh-bg);
        color: var(--rh-ink);
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
       the hover-invert and the persistent arrow cue (those are article
       affordances; the ad has its own click target and visual). */
    .vp-rh-card-ad {
      cursor: default;
      padding: 16px 24px;
      min-height: 120px;
    }
    .vp-rh-card-ad .vp-rh-arrow { display: none; }

    /* tag chip */
    .vp-rh-tag {
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--rh-bg);
      background: var(--rh-ink);
      font-weight: 600;
      align-self: flex-start;
      padding: 4px 10px;
    }
    .vp-rh-tag-accent {
      background: var(--rh-accent);
      color: var(--rh-bg);
    }

    .vp-rh-title {
      margin: 0;
      font-weight: 700;
      font-size: 22px;
      line-height: 1.12;
      letter-spacing: -0.018em;
      color: var(--rh-ink);
    }
    .vp-rh-summary {
      margin: 0;
      font-size: 14.5px;
      line-height: 1.5;
      color: var(--rh-ink-2);
      font-weight: 400;
      max-width: 60ch;
    }

    /* ============ LEAD ============ */
    .vp-rh-lead {
      cursor: default;
      padding: 26px 24px;
    }
    .vp-rh-lead-link {
      display: contents;
    }
    .vp-rh-lead-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .vp-rh-lead-title {
      margin: 0;
      font-size: 30px;
      line-height: 1.05;
      letter-spacing: -0.022em;
      font-weight: 700;
      color: var(--rh-ink);
    }
    .vp-rh-lead-summary {
      margin: 0;
      font-size: 15px;
      line-height: 1.5;
      color: var(--rh-ink-2);
      max-width: 60ch;
    }

    @media (min-width: 720px) {
      .vp-rh-lead {
        grid-column: 1 / -1;
        border-right: none;
        padding: 48px 40px;
      }
      /* Lead's hover-invert is intentionally suppressed at tablet+. The
         reset only matters when hover is capable; nested guard keeps
         touch taps clean. */
      @media (hover: hover) {
        .vp-rh-lead:hover {
          background: var(--rh-bg);
          color: var(--rh-ink);
        }
      }
      .vp-rh-lead-content { max-width: 880px; }
      .vp-rh-lead-title { font-size: 44px; max-width: 22ch; }
      .vp-rh-lead-summary { font-size: 17px; line-height: 1.5; max-width: 60ch; }

      /* When the parent story has timeline data, the lead splits into
         a 1.618:1 content/timeline grid. */
      .vp-rh-lead-with-timeline {
        display: grid;
        grid-template-columns: 1.618fr 1fr;
        gap: 48px;
        align-items: start;
      }
      .vp-rh-lead-with-timeline .vp-rh-lead-content { max-width: none; }
      .vp-rh-lead-with-timeline .vp-rh-lead-title { font-size: 40px; max-width: 18ch; }
    }
    @media (min-width: 1100px) {
      .vp-rh-lead { padding: 64px 56px; }
      .vp-rh-lead-title { font-size: 60px; max-width: 24ch; }
      .vp-rh-lead-with-timeline .vp-rh-lead-title { font-size: 48px; }
    }

    /* Timeline preview inside lead. */
    .vp-rh-timeline {
      border-left: 2px solid var(--rh-ink);
      padding-left: 24px;
      display: none;
    }
    @media (min-width: 720px) {
      .vp-rh-timeline { display: block; }
    }
    .vp-rh-tl-label {
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
      margin-bottom: 14px;
      display: block;
    }
    .vp-rh-timeline ul {
      list-style: none;
      margin: 0 0 20px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .vp-rh-timeline li {
      font-size: 14px;
      line-height: 1.4;
      color: var(--rh-ink-2);
      padding-left: 14px;
      position: relative;
    }
    .vp-rh-timeline li::before {
      content: "";
      position: absolute;
      left: 0;
      top: 7px;
      width: 6px;
      height: 6px;
      background: var(--rh-ink);
    }
    .vp-rh-timeline li.now::before { background: var(--rh-accent); }
    .vp-rh-timeline li strong {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--rh-ink);
      font-weight: 600;
      margin-right: 6px;
    }
    .vp-rh-readmore {
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--rh-ink);
      font-weight: 600;
      border-bottom: 2px solid var(--rh-accent);
      padding-bottom: 2px;
      display: inline-block;
    }
    .vp-rh-readmore:hover { color: var(--rh-accent); }

    /* ============ AD: TICKER ============ */
    .vp-rh-ticker {
      grid-column: 1 / -1;
      background: #000;
      color: #fff;
      font-size: 10px;
      padding: 8px 24px;
      display: flex;
      gap: 40px;
      overflow: hidden;
      white-space: nowrap;
      letter-spacing: 0.06em;
    }
    .vp-rh-ticker .item span { color: #00ff95; margin-left: 6px; }
    .vp-rh-ticker .sponsor {
      color: #ffd166;
      font-weight: 700;
      border-left: 1px solid #333;
      padding-left: 40px;
      margin-left: auto;
    }

    /* ============ AD: INSIGHT ROW ============ */
    .vp-rh-insight {
      grid-column: 1 / -1;
      background: var(--p-surface, #f6f4ef);
      border-top: 4px solid var(--rh-ink);
      border-bottom: 4px solid var(--rh-ink);
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
      color: var(--rh-bg);
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
      background: repeating-linear-gradient(45deg, #eee, #eee 10px, #f5f5f5 10px, #f5f5f5 20px);
      border: 1px solid var(--rh-ink-3);
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
      background: var(--rh-ink);
      gap: 1px;
      border-top: 4px solid var(--rh-accent);
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
    .vp-rh-discovery a:hover { background: var(--rh-ink); color: var(--rh-bg); }
    .vp-rh-discovery .source {
      font-size: 9px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--rh-ink-3);
    }
    .vp-rh-discovery a:hover .source { color: #999; }
    .vp-rh-discovery .title {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.22;
      letter-spacing: -0.01em;
    }

    /* ============ ENGAGEMENT (quiz card) ============
       Surface is always-dark — matches .vp-rh-ticker / .vp-rh-discovery
       precedent. Does NOT flip with theme (the slot's inline white text
       would otherwise become invisible in dark mode). */
    .vp-quiz-card {
      background: #0a0a0a;
      color: #fafafa;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 0;
      border-right: 1px solid var(--rh-ink);
      border-bottom: 1px solid var(--rh-ink);
      min-height: 220px;
      position: relative;
    }
    @media (min-width: 720px) {
      .vp-rh-grid > .vp-quiz-card:nth-child(2n) { border-right: none; }
      .vp-quiz-card { padding: 28px; }
    }
    @media (min-width: 1100px) {
      .vp-rh-grid > .vp-quiz-card:nth-child(2n) { border-right: 1px solid var(--rh-ink); }
      .vp-rh-grid > .vp-quiz-card:nth-child(3n) { border-right: none; }
    }

    /* ============ LIST RAIL ============
       Always-dark island (same precedent as .vp-quiz-card). */
    .vp-rail-block {
      background: #0a0a0a;
      color: #fafafa;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      border-right: 1px solid var(--rh-ink);
      border-bottom: 1px solid var(--rh-ink);
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
      border-bottom: 1px solid rgba(242, 231, 214, 0.18);
    }
    @media (min-width: 720px) {
      .vp-rh-grid > .vp-rail-block:nth-child(2n) { border-right: none; }
      .vp-rail-block { padding: 28px; }
    }
    @media (min-width: 1100px) {
      .vp-rh-grid > .vp-rail-block:nth-child(2n) { border-right: 1px solid var(--rh-ink); }
      .vp-rh-grid > .vp-rail-block:nth-child(3n) { border-right: none; }
    }

    /* ============ SECOND LEAD (feature take) ============ */
    .vp-feature-take {
      background: var(--rh-bg);
      color: var(--rh-ink);
      padding: 24px;
      border-right: 1px solid var(--rh-ink);
      border-bottom: 1px solid var(--rh-ink);
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
      background: var(--p-surface);
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
    @media (hover: hover) {
      .vp-feature-take:hover {
        background: var(--rh-ink);
        color: var(--rh-bg);
      }
      .vp-feature-take:hover .vp-feature-take__hed,
      .vp-feature-take:hover .vp-feature-take__dek { color: var(--rh-bg); }
    }

    /* ============ SECTION HEAD (shared by river / frontline / editors-band) ============ */
    .vp-section-head {
      grid-column: 1 / -1;
      padding: 32px 24px 12px;
      border-bottom: 1px solid var(--rh-ink);
    }
    .vp-section-head__label {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--rh-ink);
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
      border-bottom: 1px solid var(--rh-ink);
    }
    .vp-river-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      border-top: 1px solid var(--rh-ink);
    }
    @media (min-width: 720px) {
      .vp-river-grid { grid-template-columns: 1fr 1fr; }
      .vp-river-grid > .vp-river-card:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-river-grid { grid-template-columns: repeat(4, 1fr); }
      .vp-river-grid > .vp-river-card:nth-child(2n) { border-right: 1px solid var(--rh-ink); }
      .vp-river-grid > .vp-river-card:nth-child(4n) { border-right: none; }
    }
    .vp-river-card {
      background: var(--rh-bg);
      color: var(--rh-ink);
      padding: 20px;
      border-right: 1px solid var(--rh-ink);
      border-bottom: 1px solid var(--rh-ink);
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
      background: var(--p-surface);
    }
    .vp-river-card__cat {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
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
    @media (hover: hover) {
      .vp-river-card:hover {
        background: var(--rh-ink);
        color: var(--rh-bg);
      }
      .vp-river-card:hover .vp-river-card__hed,
      .vp-river-card:hover .vp-river-card__dek { color: var(--rh-bg); }
      .vp-river-card:hover .vp-river-card__meta { color: var(--rh-bg); opacity: 0.6; }
    }

    /* ============ SECONDARY PAIR (front line) ============ */
    .vp-frontline {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr;
      border-bottom: 1px solid var(--rh-ink);
    }
    .vp-frontline__grid {
      display: grid;
      grid-template-columns: 1fr;
      border-top: 1px solid var(--rh-ink);
    }
    @media (min-width: 720px) {
      .vp-frontline__grid { grid-template-columns: 1fr 1fr; }
      .vp-frontline__grid > .vp-frontline__card:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-frontline__grid { grid-template-columns: repeat(4, 1fr); }
      .vp-frontline__grid > .vp-frontline__card:nth-child(2n) { border-right: 1px solid var(--rh-ink); }
      .vp-frontline__grid > .vp-frontline__card:nth-child(4n) { border-right: none; }
    }
    .vp-frontline__card {
      background: var(--rh-bg);
      color: var(--rh-ink);
      padding: 20px 24px 24px;
      border-right: 1px solid var(--rh-ink);
      border-bottom: 1px solid var(--rh-ink);
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
      color: var(--rh-ink);
    }
    .vp-frontline__cat::before {
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--cat-dot, var(--rh-ink));
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
    @media (hover: hover) {
      .vp-frontline__card:hover {
        background: var(--rh-ink);
        color: var(--rh-bg);
      }
      .vp-frontline__card:hover .vp-frontline__hed,
      .vp-frontline__card:hover .vp-frontline__dek { color: var(--rh-bg); }
      .vp-frontline__card:hover .vp-frontline__cat,
      .vp-frontline__card:hover .vp-frontline__meta { color: var(--rh-bg); opacity: 0.7; }
    }

    /* ============ EDITORS PICKS (worth your time) ============ */
    .vp-editors-band {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr;
      background: var(--p-surface);
      border-bottom: 1px solid var(--rh-ink);
    }
    .vp-editors-band__grid {
      display: grid;
      grid-template-columns: 1fr;
      border-top: 1px solid var(--rh-ink);
    }
    @media (min-width: 720px) {
      .vp-editors-band__grid { grid-template-columns: 1fr 1fr; }
      .vp-editors-band__grid > .vp-editors-band__card:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-editors-band__grid { grid-template-columns: repeat(3, 1fr); }
      .vp-editors-band__grid > .vp-editors-band__card:nth-child(2n) { border-right: 1px solid var(--rh-ink); }
      .vp-editors-band__grid > .vp-editors-band__card:nth-child(3n) { border-right: none; }
    }
    .vp-editors-band__card {
      background: var(--p-surface);
      color: var(--rh-ink);
      padding: 20px 24px;
      border-right: 1px solid var(--rh-ink);
      border-bottom: 1px solid var(--rh-ink);
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
    @media (hover: hover) {
      .vp-editors-band__card:hover {
        background: var(--rh-ink);
        color: var(--rh-bg);
      }
      .vp-editors-band__card:hover .vp-editors-band__hed,
      .vp-editors-band__card:hover .vp-editors-band__dek { color: var(--rh-bg); }
    }

    /* ============ BY THE NUMBERS — compact rail ============
       Always-dark island (matches .vp-quiz-card / .vp-rail-block). */
    .vp-btn-rail {
      background: #0a0a0a;
      color: #fafafa;
      padding: 28px 24px;
      border-right: 1px solid var(--rh-ink);
      border-bottom: 1px solid var(--rh-ink);
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 220px;
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
      color: #fafafa;
    }
    .vp-btn-rail__cap {
      font-size: 13px;
      line-height: 1.4;
      color: #fafafa;
      opacity: 0.8;
      max-width: 28ch;
    }
    .vp-btn-rail__sub {
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #fafafa;
      opacity: 0.55;
      padding-top: 4px;
    }
    @media (min-width: 720px) {
      .vp-rh-grid > .vp-btn-rail:nth-child(2n) { border-right: none; }
    }
    @media (min-width: 1100px) {
      .vp-rh-grid > .vp-btn-rail:nth-child(2n) { border-right: 1px solid var(--rh-ink); }
      .vp-rh-grid > .vp-btn-rail:nth-child(3n) { border-right: none; }
    }

    /* ============ BY THE NUMBERS — wide band ============ */
    .vp-btn-band-wide {
      grid-column: 1 / -1;
      background: var(--p-surface, #f6f4ef);
      border-top: 4px solid var(--rh-ink);
      border-bottom: 4px solid var(--rh-ink);
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
      color: var(--rh-ink);
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
