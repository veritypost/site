'use client';

/**
 * Sources block — sits below the 3 audience cards on a Story.
 *
 * Default: outlet count + first 3 outlet names + "+N more" toggle.
 * Click "+N more" to expand into a full list of titled URLs.
 *
 * No outlet logos in v1 (Decision 21).
 */

import { useState, useMemo } from 'react';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

export type SourceItem = {
  outlet_name: string;
  title: string | null;
  url: string;
  fetched_at?: string | null;
};

type Props = { sources: SourceItem[] };

export default function SourcesBlock({ sources }: Props) {
  const [expanded, setExpanded] = useState(false);
  const outlets = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const s of sources) {
      const name = s.outlet_name || 'Unknown';
      if (seen.has(name)) continue;
      seen.add(name);
      order.push(name);
    }
    return order;
  }, [sources]);

  if (sources.length === 0) {
    return (
      <div style={{ padding: `${S[3]}px ${S[4]}px`, fontSize: F.sm, color: C.muted }}>
        No sources linked yet.
      </div>
    );
  }

  const headOutlets = outlets.slice(0, 3);
  const remaining = Math.max(0, outlets.length - headOutlets.length);

  return (
    <div style={{ padding: `${S[3]}px ${S[4]}px`, fontSize: F.sm, color: C.dim }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: S[2] }}>
        <span style={{ color: C.soft, fontWeight: 600 }}>
          Sources ({sources.length}):
        </span>
        <span style={{ color: C.white }}>
          {headOutlets.join(' · ')}
          {remaining > 0 && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: C.accent,
                  cursor: 'pointer',
                  fontSize: F.sm,
                  fontFamily: 'inherit',
                  textDecoration: 'underline',
                }}
              >
                {expanded ? 'show less' : `+${remaining} more`}
              </button>
            </>
          )}
        </span>
      </div>
      {expanded && (
        <ul style={{ margin: `${S[2]}px 0 0`, padding: 0, listStyle: 'none' }}>
          {sources.map((s, i) => (
            <li
              key={`${s.url}-${i}`}
              style={{
                display: 'flex',
                gap: S[2],
                padding: `${S[1]}px 0`,
                borderTop: i === 0 ? 'none' : `1px dashed ${C.divider}`,
                fontSize: F.sm,
              }}
            >
              <span style={{ color: C.muted, minWidth: 90 }}>{s.outlet_name}</span>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: C.white, textDecoration: 'none', flex: 1, lineHeight: 1.4 }}
              >
                {s.title || s.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
