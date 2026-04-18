'use client';
import { useState } from 'react';

// D28: follows are paid-only. Rules of the road: tier gates are
// INVISIBLE to non-qualifying users — free viewers never see the
// Follow button. The upsell lives on the profile page.
const PAID = new Set(['verity', 'verity_pro', 'verity_family', 'verity_family_xl']);

export default function FollowButton({
  targetUserId,
  initialFollowing = false,
  viewerTier = 'free',
  viewerUserId = null,
  onChange,
}) {
  const [following, setFollowing] = useState(!!initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!viewerUserId || viewerUserId === targetUserId) return null;

  const viewerIsPaid = PAID.has(viewerTier);
  if (!viewerIsPaid) return null;

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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Follow failed');
      setFollowing(!!data.following);
      onChange?.(!!data.following);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <button
        onClick={toggle}
        disabled={busy}
        style={{
          padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12,
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
