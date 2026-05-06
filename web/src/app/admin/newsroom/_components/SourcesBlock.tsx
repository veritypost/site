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
  id: string;
  outlet_name: string;
  title: string | null;
  url: string;
  fetched_at?: string | null;
};

type Props = {
  sources: SourceItem[];
  selectedUrls?: Set<string>;
  onToggle?: (url: string, checked: boolean) => void;
  onRemove?: (id: string) => Promise<void>;
};

export default function SourcesBlock({ sources, selectedUrls, onToggle, onRemove }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  const showFull = !!onToggle || expanded;
  const headOutlets = outlets.slice(0, 3);
  const remaining = Math.max(0, outlets.length - headOutlets.length);

  return (
    <div style={{ padding: `${S[3]}px ${S[4]}px`, fontSize: F.sm, color: C.dim }}>
      {!onToggle && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: S[2] }}>
          <span style={{ color: C.soft, fontWeight: 600 }}>
            Sources ({sources.length}):
          </span>
          <span style={{ color: C.ink }}>
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
      )}
      {onToggle && (
        <div style={{ color: C.soft, fontWeight: 600, marginBottom: S[1] }}>
          Sources ({sources.length}):
        </div>
      )}
      {showFull && (
        <ul style={{ margin: `${onToggle ? 0 : S[2]}px 0 0`, padding: 0, listStyle: 'none' }}>
          {sources.map((s, i) => (
            <li
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S[2],
                padding: `${S[1]}px 0`,
                borderTop: i === 0 ? 'none' : `1px dashed ${C.divider}`,
                fontSize: F.sm,
              }}
            >
              {onToggle && (
                <input
                  type="checkbox"
                  checked={selectedUrls?.has(s.url) ?? true}
                  onChange={(e) => onToggle(s.url, e.target.checked)}
                  style={{ flexShrink: 0 }}
                />
              )}
              <span style={{ color: C.muted, minWidth: 90, flexShrink: 0 }}>{s.outlet_name}</span>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: C.ink, textDecoration: 'none', flex: 1, lineHeight: 1.4, minWidth: 0 }}
              >
                {s.title || s.url}
              </a>
              {onRemove && (
                <button
                  type="button"
                  disabled={removingId === s.id}
                  onClick={async () => {
                    setRemovingId(s.id);
                    try {
                      await onRemove(s.id);
                    } finally {
                      setRemovingId(null);
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: `2px ${S[2]}px`,
                    fontSize: F.xs,
                    color: C.dim,
                    cursor: removingId === s.id ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                    fontFamily: 'inherit',
                    opacity: removingId === s.id ? 0.5 : 1,
                  }}
                >
                  {removingId === s.id ? 'Removing…' : 'Remove'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
