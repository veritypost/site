'use client';

import { useState } from 'react';

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('[ShareButton] clipboard.writeText failed', err);
    }
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: copied ? 'var(--dim, #5a5a5a)' : 'var(--text-primary, #111)',
        background: 'none',
        border: '1px solid var(--border, #e5e5e5)',
        borderRadius: 4,
        padding: '5px 12px',
        cursor: 'pointer',
        letterSpacing: '0.01em',
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
