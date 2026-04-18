'use client';
import { useState, useEffect } from 'react';
import { createClient } from '../lib/supabase/client';
import { isPaidTier } from '@/lib/tiers';
import { MENTION_RE } from '@/lib/mentions';

// Composer for a new top-level comment or a reply.
// Props:
//   articleId              string
//   parentId               string | null
//   currentUserTier        string — 'free' | 'verity' | ...
//   onPosted(comment)      called with the fresh comment row
//   onCancel               optional — for reply composers
//   autoFocus              bool

export default function CommentComposer({
  articleId,
  parentId = null,
  currentUserTier = 'free',
  onPosted,
  onCancel,
  autoFocus = false,
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [muteState, setMuteState] = useState(null); // { banned, muted_until, mute_level }

  const isPaid = isPaidTier(currentUserTier);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('is_banned, is_muted, mute_level, muted_until')
        .eq('id', user.id)
        .maybeSingle();
      if (!data) return;
      const muteActive = data.is_muted && data.mute_level >= 1 && (!data.muted_until || new Date(data.muted_until) > new Date());
      if (data.is_banned || muteActive) {
        setMuteState({ banned: !!data.is_banned, muted_until: data.muted_until, mute_level: data.mute_level });
      }
    })();
  }, []);

  async function resolveMentions(text) {
    // D21: only paid tiers can @mention; strip for free (backend also strips).
    if (!isPaid) return [];
    const supabase = createClient();
    const names = Array.from(new Set([...text.matchAll(MENTION_RE)].map(m => m[1])));
    if (names.length === 0) return [];
    const { data } = await supabase
      .from('users')
      .select('id, username')
      .in('username', names);
    return (data || []).map(u => ({ user_id: u.id, username: u.username }));
  }

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    setBusy(true); setError('');
    try {
      const mentions = await resolveMentions(trimmed);
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId, body: trimmed, parent_id: parentId, mentions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not post');
      setBody('');
      onPosted?.(data.comment);
      onCancel?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (muteState) {
    // Pass 17 / Task 140d: the AccountStateBanner mounted in NavWrapper
    // already explains the ban/mute state and includes the appeal link.
    // This inline notice only confirms the composer is disabled so the
    // reader doesn't try to figure out why the post button is missing.
    return (
      <div style={{
        border: '1px solid #fecaca', borderRadius: 12,
        padding: '10px 14px', background: '#fef2f2',
        marginBottom: 16, fontSize: 13, color: '#991b1b',
      }}>
        Posting is disabled while the account notice at the top of the page applies.
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid var(--border, #e5e5e5)', borderRadius: 12,
      padding: '10px 12px', background: 'var(--card, #f7f7f7)',
      marginBottom: 16,
    }}>
      <textarea
        autoFocus={autoFocus}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={parentId ? 'Write a reply…' : 'Join the discussion…'}
        aria-label={parentId ? 'Reply text' : 'Comment text'}
        rows={parentId ? 2 : 3}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          color: 'var(--white, #111)', fontSize: 14, outline: 'none',
          resize: 'vertical', fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11, color: 'var(--dim, #666)' }}>
        <span>
          {isPaid ? 'Tip: type @username to mention.' : '@mentions are available on paid plans.'}
        </span>
        <span style={{ flex: 1 }} />
        {onCancel && (
          <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--dim, #666)', cursor: 'pointer' }}>Cancel</button>
        )}
        <button
          onClick={submit}
          disabled={!body.trim() || busy}
          style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: body.trim() && !busy ? 'var(--accent, #111)' : '#ccc',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: body.trim() && !busy ? 'pointer' : 'default',
          }}
        >{busy ? 'Posting…' : 'Post'}</button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</div>}
    </div>
  );
}
