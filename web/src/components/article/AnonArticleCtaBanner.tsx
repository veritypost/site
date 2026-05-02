'use client';
import { useState } from 'react';

export default function AnonArticleCtaBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{
      marginTop: 40,
      padding: '20px 24px',
      borderRadius: 12,
      background: 'var(--card, #f9f9f9)',
      border: '1px solid var(--border, #e5e5e5)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      justifyContent: 'space-between',
      flexWrap: 'wrap' as const,
    }}>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #111)' }}>
          Join the discussion
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--dim, #666)' }}>
          Sign up free to bookmark, follow topics, and comment after the quiz.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <a
          href="/login"
          style={{
            display: 'inline-block',
            background: 'var(--accent, #111)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            padding: '9px 18px',
            borderRadius: 8,
            textDecoration: 'none',
            whiteSpace: 'nowrap' as const,
          }}
        >
          Sign up — free
        </a>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 0,
            fontSize: 12,
            color: 'var(--dim, #888)',
            cursor: 'pointer',
            padding: '4px 8px',
            whiteSpace: 'nowrap' as const,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
