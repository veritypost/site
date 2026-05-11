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
    }
    @media (min-width: 720px) {
      .vp-rh-grid { grid-template-columns: 1fr 1fr; }
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
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 22px;
      font-weight: 600;
      color: var(--rh-ink-3);
      transition: color .15s, transform .15s;
      line-height: 1;
    }

    /* hover-invert */
    .vp-rh-card:hover {
      background: var(--rh-ink);
      color: var(--rh-bg);
    }
    .vp-rh-card:hover .vp-rh-title,
    .vp-rh-card:hover .vp-rh-summary { color: var(--rh-bg); }
    .vp-rh-card:hover .vp-rh-tag { background: var(--rh-accent); color: var(--rh-ink); }
    .vp-rh-card:hover .vp-rh-arrow {
      color: var(--rh-accent);
      transform: translateX(4px);
    }

    /* ad cell — same border treatment as article cards, but suppresses
       the hover-invert and the persistent arrow cue (those are article
       affordances; the ad has its own click target and visual). */
    .vp-rh-card-ad {
      cursor: default;
      padding: 16px 24px;
      min-height: 120px;
    }
    .vp-rh-card-ad:hover {
      background: var(--rh-bg);
      color: var(--rh-ink);
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
      color: var(--rh-ink);
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
      .vp-rh-lead:hover {
        background: var(--rh-bg);
        color: var(--rh-ink);
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
      color: var(--rh-ink);
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
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
