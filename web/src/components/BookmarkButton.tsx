'use client';

import { useEffect, useState } from 'react';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';

interface BookmarkButtonProps {
  articleId: string;
  currentUserId: string | null;
}

export default function BookmarkButton({ articleId, currentUserId }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [canBookmark, setCanBookmark] = useState(false);
  const [permsReady, setPermsReady] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      setCanBookmark(hasPermission('article.bookmark.add'));
      setPermsReady(true);
    })();
  }, [currentUserId]);

  if (!currentUserId || !permsReady || !canBookmark) return null;

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
      if (!res.ok) throw new Error(data?.error || 'Could not save');
      setBookmarked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <button
        onClick={handleBookmark}
        disabled={busy || bookmarked}
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: bookmarked ? 'var(--dim, #5a5a5a)' : 'var(--text-primary, #111)',
          background: 'none',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: 4,
          padding: '5px 12px',
          cursor: busy || bookmarked ? 'default' : 'pointer',
          letterSpacing: '0.01em',
        }}
      >
        {busy ? '…' : bookmarked ? 'Bookmarked' : 'Bookmark'}
      </button>
      {error && <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span>}
    </span>
  );
}
