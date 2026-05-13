'use client';

// Stream B — Latest/Trending sort pill for pane 2 + pane 3 header.
// Trending is permission-gated (directory.sort_trending). When the user
// lacks the perm we render the Trending option as disabled with a
// LockedFeatureChip next to it; the API also silently degrades, so the
// safe failure mode is "user sees latest articles, knows trending exists,
// has a path to upgrade."

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { DirectorySort } from '@/lib/directory/types';
import LockedFeatureChip from './LockedFeatureChip';

interface SortPillProps {
  active: DirectorySort;
  /** True when the viewer holds directory.sort_trending. */
  canTrending: boolean;
}

export default function SortPill({ active, canTrending }: SortPillProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setSort = useCallback(
    (next: DirectorySort) => {
      const params = new URLSearchParams(searchParams?.toString() || '');
      if (next === 'latest') params.delete('sort');
      else params.set('sort', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const pillBase = {
    padding: '4px 12px',
    borderRadius: 999,
    border: '1px solid var(--border, #dcdcdc)',
    background: 'transparent',
    color: 'var(--ink-2, #333)',
    fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease',
    minHeight: 28,
  };

  const activeStyle = {
    background: 'var(--ink, #111)',
    color: 'var(--bg, #fff)',
    borderColor: 'var(--ink, #111)',
  };

  return (
    <div
      role="group"
      aria-label="Sort articles"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <button
        type="button"
        aria-pressed={active === 'latest'}
        onClick={() => setSort('latest')}
        style={{
          ...pillBase,
          ...(active === 'latest' ? activeStyle : {}),
        }}
      >
        Latest
      </button>
      {canTrending ? (
        <button
          type="button"
          aria-pressed={active === 'trending'}
          onClick={() => setSort('trending')}
          style={{
            ...pillBase,
            ...(active === 'trending' ? activeStyle : {}),
          }}
        >
          Trending
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled
            aria-disabled
            title="Trending sort is a Verity perk"
            style={{
              ...pillBase,
              opacity: 0.5,
              cursor: 'not-allowed',
            }}
          >
            Trending
          </button>
          <LockedFeatureChip
            ariaLabel="Trending sort — upgrade to Verity"
          />
        </>
      )}
    </div>
  );
}
