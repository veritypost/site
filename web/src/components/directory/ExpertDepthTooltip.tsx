'use client';

// Stream B — "X experts" hover/tap tooltip on article cards.
// Lazily fetches /api/directory/expert-coverage?story_id=… on first hover.
// 403 → paywall card (this endpoint is the premium reveal, NOT silent
// degrade like sort_trending). 200 → expert list.
//
// Behaviour is hover-on-desktop, tap-on-mobile. We bind click + focus
// alongside mouseenter so keyboard users can open the tooltip too.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpertCoverageResponse } from '@/lib/directory/types';

interface ExpertDepthTooltipProps {
  storyId: string;
  count: number;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'error' }
  | { kind: 'ready'; data: ExpertCoverageResponse };

export default function ExpertDepthTooltip({ storyId, count }: ExpertDepthTooltipProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchExperts = useCallback(() => {
    if (state.kind === 'loading' || state.kind === 'ready' || state.kind === 'locked') return;
    setState({ kind: 'loading' });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void fetch(`/api/directory/expert-coverage?story_id=${encodeURIComponent(storyId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 403) {
          setState({ kind: 'locked' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error' });
          return;
        }
        const body = (await res.json()) as ExpertCoverageResponse;
        setState({ kind: 'ready', data: body });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ kind: 'error' });
      });
  }, [state.kind, storyId]);

  useEffect(() => {
    if (!open) return;
    fetchExperts();
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, fetchExperts]);

  if (count <= 0) return null;

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => {
          // Pre-warm on hover so the tooltip is ready by the time the
          // user clicks / focuses. Falls back gracefully if no click.
          fetchExperts();
        }}
        onFocus={() => fetchExperts()}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          textDecoration: 'underline dotted',
          textUnderlineOffset: 2,
        }}
      >
        ✓ {count} expert{count === 1 ? '' : 's'}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Expert coverage"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            zIndex: 5,
            minWidth: 220,
            maxWidth: 280,
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontSize: 12,
            color: 'var(--text)',
          }}
        >
          {state.kind === 'loading' && (
            <div style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Loading…</div>
          )}
          {state.kind === 'error' && (
            <div style={{ color: 'var(--muted-foreground)' }}>Couldn’t load experts.</div>
          )}
          {state.kind === 'locked' && (
            <div>
              <div
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#e33010',
                  marginBottom: 6,
                }}
              >
                Verity perk
              </div>
              <p style={{ margin: '0 0 8px', lineHeight: 1.4 }}>
                See which experts are tracking this story and follow them all in one tap.
              </p>
              <Link
                href="/pricing"
                style={{
                  display: 'inline-block',
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: 'var(--text)',
                  color: 'var(--bg)',
                  textDecoration: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Upgrade →
              </Link>
            </div>
          )}
          {state.kind === 'ready' && (
            <div>
              <div
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--muted-foreground)',
                  marginBottom: 6,
                }}
              >
                {state.data.total} expert{state.data.total === 1 ? '' : 's'}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {state.data.experts.slice(0, 8).map((e) => (
                  <li key={e.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {e.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.avatar_url}
                        alt=""
                        width={20}
                        height={20}
                        style={{ borderRadius: '50%', flexShrink: 0 }}
                      />
                    ) : (
                      <span
                        aria-hidden
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: 'var(--accent-bg)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600 }}>{e.display_name || 'Expert'}</span>
                      {e.expert_title && (
                        <span style={{ color: 'var(--muted-foreground)' }}> · {e.expert_title}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
