'use client';

import { useState } from 'react';

// v2 editorial palette — references the central --vp-* tokens defined
// in globals.css (single source of truth for the burgundy redesign).
const ACCENT = 'var(--vp-accent)';
const BORDER = 'var(--vp-border)';
const SURFACE_SOFT = 'var(--vp-surface-soft)';
const TEXT_MUTED = 'var(--vp-text-muted)';
const SANS = 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [hover, setHover] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ShareButton] clipboard.writeText failed', err);
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 3000);
    }
  }

  // Three visual states layered over the v2 pill chrome:
  //   1. copyFailed → warm danger outline + text
  //   2. copied     → ACCENT fill (parity w/ Follow active state)
  //   3. default    → SURFACE_SOFT pill, hover borrows ACCENT
  const isActive = copied;
  const isFailed = copyFailed;

  const background = isFailed ? SURFACE_SOFT : isActive ? ACCENT : SURFACE_SOFT;
  const color = isFailed ? 'var(--danger, #dc2626)' : isActive ? '#ffffff' : hover ? ACCENT : TEXT_MUTED;
  const borderColor = isFailed
    ? 'var(--danger, #dc2626)'
    : isActive
      ? ACCENT
      : hover
        ? ACCENT
        : BORDER;

  return (
    <button
      onClick={handleCopy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: SANS,
        fontSize: 13,
        fontWeight: 500,
        color,
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 999,
        padding: '8px 16px',
        minHeight: 44,
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <polyline points="1,7 5,11 12,2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M5 3H3a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8 1h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="1" x2="6" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      {copyFailed ? 'Copy failed — try the URL bar' : copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
