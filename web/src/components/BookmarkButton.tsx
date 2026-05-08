'use client';

import { useEffect, useState } from 'react';
import { hasPermission, refreshIfStale } from '@/lib/permissions';
import { friendlyError } from '@/lib/friendlyError';
import { useRegistrationWall } from '@/components/RegistrationWall';

interface BookmarkButtonProps {
  articleId: string;
  currentUserId: string | null;
}

export default function BookmarkButton({ articleId, currentUserId }: BookmarkButtonProps) {
  const { openWall } = useRegistrationWall();
  const [bookmarked, setBookmarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [canBookmark, setCanBookmark] = useState(false);
  const [permsReady, setPermsReady] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      await refreshIfStale();
      setCanBookmark(hasPermission('article.bookmark.add'));
      setPermsReady(true);
    })();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !permsReady || !canBookmark) return;
    let cancelled = false;
    fetch(`/api/bookmarks?article_id=${encodeURIComponent(articleId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.bookmarked === true) setBookmarked(true);
      })
      .catch(() => {
        // Silently fail — default unbookmarked; server will handle duplicate gracefully
      });
    return () => { cancelled = true; };
  }, [articleId, currentUserId, permsReady, canBookmark]);

  if (!currentUserId) {
    // Anon: show a button that opens the registration wall
    return (
      <button
        onClick={openWall}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text, #1a1a1a)',
          background: 'transparent',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: 8,
          padding: '0 14px',
          minHeight: 44,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden="true">
          <path d="M2 1h8a1 1 0 011 1v10l-5-3-5 3V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        Save
      </button>
    );
  }
  if (!permsReady || !canBookmark) return null;

  async function handleBookmark() {
    if (busy || bookmarked) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.preview) {
        setBusy(false);
        setError('Preview mode — not saved.');
        return;
      }
      if (!res.ok) throw new Error(friendlyError(data?.error, 'Could not save. Try again.'));
      setBookmarked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <button
        onClick={handleBookmark}
        disabled={busy || bookmarked}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          color: bookmarked ? 'var(--bg, #fff)' : 'var(--text, #1a1a1a)',
          background: bookmarked ? 'var(--accent, #111)' : 'transparent',
          border: `1px solid ${bookmarked ? 'var(--accent, #111)' : 'var(--border, #e5e5e5)'}`,
          borderRadius: 8,
          padding: '0 14px',
          minHeight: 44,
          cursor: busy || bookmarked ? 'default' : 'pointer',
          transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
          WebkitTapHighlightColor: 'transparent',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {bookmarked ? (
          <svg width="12" height="13" viewBox="0 0 12 13" fill="currentColor" aria-hidden="true">
            <path d="M2 1h8a1 1 0 011 1v10l-5-3-5 3V2a1 1 0 011-1z" />
          </svg>
        ) : (
          <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden="true">
            <path d="M2 1h8a1 1 0 011 1v10l-5-3-5 3V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
        {busy ? '…' : bookmarked ? 'Saved' : 'Save'}
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--danger, #b94040)' }}>{error}</span>}
    </span>
  );
}
