'use client';

// Owner cleanup item 12 (2026-05-08) — story-level Follow button.
// Replaces the article-level Save heart. The unit being followed is the
// story (slug), not the article — the button just lives on article
// pages because that's where users discover stories. Tapping while
// signed-out opens the registration wall.

import { useEffect, useState } from 'react';
import { friendlyError } from '@/lib/friendlyError';
import { useRegistrationWall } from '@/components/RegistrationWall';

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
        style={baseStyle(false)}
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
      <button onClick={handleToggle} disabled={busy} style={baseStyle(following)}>
        {busy ? '…' : following ? 'Following' : 'Follow'}
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--danger, #b94040)' }}>{error}</span>}
    </span>
  );
}

function baseStyle(active: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    fontWeight: 600 as const,
    letterSpacing: '-0.005em',
    color: active ? 'var(--bg, #fff)' : 'var(--text, #1a1a1a)',
    background: active ? 'var(--accent, #111)' : 'transparent',
    border: `1px solid ${active ? 'var(--accent, #111)' : 'var(--border, #e5e5e5)'}`,
    borderRadius: 10,
    padding: '0 16px',
    minHeight: 44,
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
    WebkitTapHighlightColor: 'transparent',
  };
}

