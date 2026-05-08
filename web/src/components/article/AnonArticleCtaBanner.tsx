'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function AnonArticleCtaBanner() {
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();
  if (dismissed) return null;
  return (
    <div style={{
      marginTop: 40,
      padding: '20px 24px',
      borderRadius: 12,
      background: 'var(--card, #f9f9f9)',
      border: '1px solid var(--p-border)',
      // Explicit no-shadow — editorial cards rely on border + neutral
      // surface, not lifted-card shadow weight.
      boxShadow: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      justifyContent: 'space-between',
      flexWrap: 'wrap' as const,
    }}>
      <div>
        <p style={{
          // 14/600 -> editorial meta family (11/600/0.1em uppercase) so the
          // banner reads as native article chrome, not a marketing tag.
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--p-ink-muted)',
        }}>
          Join the discussion
        </p>
        <p style={{
          // 13 -> 14/1.5. The sub-copy carries the actual value prop now
          // that the heading is a label; lifting size + leading makes it
          // legibly so.
          margin: '6px 0 0',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--p-ink)',
        }}>
          Sign up free to bookmark, follow topics, and comment after the quiz.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <a
          href={`/login?next=${encodeURIComponent(pathname)}`}
          style={{
            // Aligned to the Quiz CTA family (14/600, padding 10/20,
            // borderRadius 10, -0.005em tracking).
            display: 'inline-block',
            background: 'var(--p-ink)',
            color: 'var(--p-bg)',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '-0.005em',
            padding: '10px 20px',
            borderRadius: 10,
            textDecoration: 'none',
            whiteSpace: 'nowrap' as const,
          }}
        >
          Sign up — free
        </a>
        <button
          onClick={() => setDismissed(true)}
          style={{
            // 12 -> 13 for touch readability; stay quiet (no underline,
            // muted ink) so it recedes against the primary CTA.
            background: 'transparent',
            border: 0,
            fontSize: 13,
            color: 'var(--p-ink-muted)',
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
