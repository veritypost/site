// @migrated-to-permissions 2026-04-18
// @feature-verified follow 2026-04-18
'use client';
import { useEffect, useState } from 'react';
import { hasPermission, refreshIfStale } from '@/lib/permissions';
import { friendlyError } from '@/lib/friendlyError';

interface FollowButtonProps {
  targetUserId: string;
  initialFollowing?: boolean;
  viewerUserId?: string | null;
  onChange?: (following: boolean) => void;
}

interface FollowApiResponse {
  following?: boolean;
  error?: string;
}

export default function FollowButton({
  targetUserId,
  initialFollowing = false,
  viewerUserId = null,
  onChange,
}: FollowButtonProps) {
  const [following, setFollowing] = useState<boolean>(!!initialFollowing);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [canFollow, setCanFollow] = useState<boolean>(false);
  const [permsReady, setPermsReady] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      await refreshIfStale();
      setCanFollow(hasPermission('profile.follow'));
      setPermsReady(true);
    })();
  }, []);

  if (!viewerUserId || viewerUserId === targetUserId) return null;
  if (!permsReady) {
    return (
      <button
        disabled
        style={{
          opacity: 0.4,
          pointerEvents: 'none',
          padding: '8px 20px',
          borderRadius: 20,
          background: 'var(--vp-surface)',
          border: '1px solid var(--vp-border)',
          fontSize: 14,
          cursor: 'default',
        }}
      >
        Follow
      </button>
    );
  }
  if (!canFollow) return null;

  async function toggle() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId }),
      });
      const data = (await res.json().catch(() => ({}))) as FollowApiResponse;
      if (!res.ok) throw new Error(friendlyError(data?.error, 'Could not follow. Try again.'));
      setFollowing(!!data.following);
      onChange?.(!!data.following);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not follow. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
    >
      <button
        onClick={toggle}
        disabled={busy}
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 12,
          border: following ? '1px solid #e5e5e5' : 'none',
          background: following ? 'transparent' : '#111',
          color: following ? '#111' : '#fff',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        {busy ? '…' : following ? 'Following' : 'Follow'}
      </button>
      {error && <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span>}
    </div>
  );
}
