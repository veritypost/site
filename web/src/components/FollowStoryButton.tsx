'use client';

// Owner cleanup item 12 (2026-05-08) — story-level Follow button.
// Replaces the article-level Save heart. The unit being followed is the
// story (slug), not the article — the button just lives on article
// pages because that's where users discover stories. Tapping while
// signed-out opens the registration wall.

import { useEffect, useState } from 'react';
import { friendlyError } from '@/lib/friendlyError';
import { useRegistrationWall } from '@/components/RegistrationWall';

// v2 editorial palette — references the central --vp-* tokens defined
// in globals.css (single source of truth for the burgundy redesign).
const ACCENT = 'var(--vp-accent)';
const BORDER = 'var(--vp-border)';
const SURFACE_SOFT = 'var(--vp-surface-soft)';
const TEXT_MUTED = 'var(--vp-text-muted)';
const SANS = 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

interface FollowStoryButtonProps {
  storyId: string;
  currentUserId: string | null;
}

export default function FollowStoryButton({ storyId, currentUserId }: FollowStoryButtonProps) {
  const { openWall } = useRegistrationWall();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!currentUserId) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    // Light read: pull the user's follows list and check membership. The
    // GET endpoint already returns the joined story data we'd need if we
    // wanted to render anything richer; the button only needs membership.
    fetch('/api/story-follows', { method: 'GET' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const isFollowing = rows.some((r: { story?: { id?: string } }) => r?.story?.id === storyId);
        setFollowing(isFollowing);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId, currentUserId]);

  if (!currentUserId) {
    return (
      <button
        onClick={openWall}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={baseStyle(false, hover)}
      >
        Follow
      </button>
    );
  }

  if (!hydrated) return null;

  async function handleToggle() {
    if (busy) return;
    setError('');
    setBusy(true);
    const prev = following;
    // Optimistic flip — server is the truth on error.
    setFollowing(!prev);
    try {
      const res = await fetch('/api/story-follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: storyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(friendlyError(data?.error, 'Could not update. Try again.'));
      // Validate the shape before flipping. Without this, a 200 OK whose
      // body is missing `following` (RPC drift, bad caching layer)
      // silently flipped UI to false even though the server toggled on.
      if (typeof data?.following !== 'boolean') {
        throw new Error('Could not update. Try again.');
      }
      setFollowing(data.following);
    } catch (err) {
      // Revert on failure.
      setFollowing(prev);
      setError(err instanceof Error ? err.message : 'Could not update. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <button
        onClick={handleToggle}
        disabled={busy}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={baseStyle(following, hover)}
      >
        {busy ? '…' : following ? 'Following' : 'Follow'}
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--danger, #b94040)' }}>{error}</span>}
    </span>
  );
}

function baseStyle(active: boolean, hover: boolean = false) {
  // v2 pill chrome — active fills with burgundy; inactive sits on SURFACE_SOFT
  // with a warm border that borrows ACCENT on hover. No hover state on active
  // (already filled) so the eye doesn't double-treat it.
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: 500 as const,
    color: active ? '#ffffff' : hover ? ACCENT : TEXT_MUTED,
    background: active ? ACCENT : SURFACE_SOFT,
    border: `1px solid ${active ? ACCENT : hover ? ACCENT : BORDER}`,
    borderRadius: 999,
    padding: '8px 16px',
    minHeight: 44,
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
    WebkitTapHighlightColor: 'transparent',
  };
}

