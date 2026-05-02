'use client';

import { useState } from 'react';

export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

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

  return (
    <button
      onClick={handleCopy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        color: copyFailed ? 'var(--danger, #dc2626)' : copied ? '#fff' : 'var(--text, #1a1a1a)',
        background: copyFailed ? 'transparent' : copied ? 'var(--accent)' : 'transparent',
        border: `1px solid ${copyFailed ? 'var(--danger, #dc2626)' : copied ? 'var(--accent)' : 'var(--border, #e5e5e5)'}`,
        borderRadius: 8,
        padding: '0 14px',
        minHeight: 36,
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
