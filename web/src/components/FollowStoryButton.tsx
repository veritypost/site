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
        <Icon following={false} />
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
      setFollowing(!!data?.following);
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
        <Icon following={following} />
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

function Icon({ following }: { following: boolean }) {
  return following ? (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="currentColor" aria-hidden="true">
      <path d="M6 11.5l-.7-.6C2.4 8.4 0 6.4 0 3.9 0 2 1.5.5 3.4.5c1 0 2 .5 2.6 1.3C6.6 1 7.6.5 8.6.5 10.5.5 12 2 12 3.9c0 2.5-2.4 4.5-5.3 7l-.7.6z" />
    </svg>
  ) : (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden="true">
      <path
        d="M6 11.5l-.7-.6C2.4 8.4 0 6.4 0 3.9 0 2 1.5.5 3.4.5c1 0 2 .5 2.6 1.3C6.6 1 7.6.5 8.6.5 10.5.5 12 2 12 3.9c0 2.5-2.4 4.5-5.3 7l-.7.6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
