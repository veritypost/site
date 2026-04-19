// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import { createClient } from '../lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { MENTION_RE } from '@/lib/mentions';
import type { Database } from '@/types/database';

type Mention = { user_id: string; username: string };
type CommentRow = Database['public']['Tables']['comments']['Row'];

interface CommentComposerProps {
  articleId: string;
  parentId?: string | null;
  currentUserTier?: string;
  onPosted?: (comment: CommentRow | null) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

type MuteState = {
  banned: boolean;
  muted_until: string | null;
  mute_level: number | null;
} | null;

export default function CommentComposer({
  articleId,
  parentId = null,
  onPosted,
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const [body, setBody] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [muteState, setMuteState] = useState<MuteState>(null);
  const [canPost, setCanPost] = useState<boolean>(false);
  const [canMention, setCanMention] = useState<boolean>(false);
  const [permsLoaded, setPermsLoaded] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      setCanPost(hasPermission(parentId ? 'comments.reply' : 'comments.post'));
      setCanMention(hasPermission('comments.mention.insert'));
      setPermsLoaded(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('is_banned, is_muted, mute_level, muted_until')
        .eq('id', user.id)
        .maybeSingle();
      if (!data) return;
      const muteActive = !!data.is_muted && (data.mute_level ?? 0) >= 1 && (!data.muted_until || new Date(data.muted_until) > new Date());
      if (data.is_banned || muteActive) {
        setMuteState({ banned: !!data.is_banned, muted_until: data.muted_until, mute_level: data.mute_level });
      }
    })();
  }, [parentId]);

  async function resolveMentions(text: string): Promise<Mention[]> {
    if (!canMention) return [];
    const supabase = createClient();
    const names = Array.from(new Set([...text.matchAll(MENTION_RE)].map((m) => m[1])));
    if (names.length === 0) return [];
    const { data } = await supabase
      .from('users')
      .select('id, username')
      .in('username', names);
    return (data || [])
      .filter((u): u is { id: string; username: string } => !!u.username)
      .map((u) => ({ user_id: u.id, username: u.username }));
  }

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    // L-08: MENTION_RE is `/g`-flagged, so `.test()` carries `lastIndex`
    // state across calls. Use `.match()` (or reset lastIndex) so the
    // boolean check is order-independent. If the user typed @names
    // without the comments.mention.insert permission, surface a
    // non-silent toast so they know their handle will post as plain
    // text (resolveMentions drops mentions silently otherwise).
    const hasMentions = !!trimmed.match(MENTION_RE);
    if (hasMentions && !canMention) {
      setError('Mentions are available on paid plans — your @handle will post as plain text.');
      // Do not block submit; let the user decide to edit or accept.
    } else {
      setError('');
    }
    setBusy(true);
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
      onPosted?.(data.comment || null);
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  }

  if (!permsLoaded) return null;
  if (!canPost) return null;

  if (muteState) {
    return (
      <div style={muteBannerStyle}>
        Posting is disabled while the account notice at the top of the page applies.
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <textarea
        autoFocus={autoFocus}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? 'Write a reply\u2026' : 'Join the discussion\u2026'}
        aria-label={parentId ? 'Reply text' : 'Comment text'}
        rows={parentId ? 2 : 3}
        style={textareaStyle}
      />
      <div style={footerStyle}>
        <span>
          {canMention ? 'Tip: type @username to mention.' : '@mentions are available on paid plans.'}
        </span>
        <span style={{ flex: 1 }} />
        {onCancel && (
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
        )}
        <button
          onClick={submit}
          disabled={!body.trim() || busy}
          style={{
            ...postBtnStyle,
            background: body.trim() && !busy ? 'var(--accent, #111)' : '#ccc',
            cursor: body.trim() && !busy ? 'pointer' : 'default',
          }}
        >{busy ? 'Posting\u2026' : 'Post'}</button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const containerStyle: CSSProperties = {
  border: '1px solid var(--border, #e5e5e5)', borderRadius: 12,
  padding: '10px 12px', background: 'var(--card, #f7f7f7)',
  marginBottom: 16,
};
const textareaStyle: CSSProperties = {
  width: '100%', background: 'transparent', border: 'none',
  color: 'var(--white, #111)', fontSize: 14, outline: 'none',
  resize: 'vertical', fontFamily: 'inherit',
};
const footerStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
  fontSize: 11, color: 'var(--dim, #666)',
};
const cancelBtnStyle: CSSProperties = {
  background: 'none', border: 'none', fontSize: 12,
  color: 'var(--dim, #666)', cursor: 'pointer',
};
const postBtnStyle: CSSProperties = {
  padding: '6px 14px', borderRadius: 8, border: 'none',
  color: '#fff', fontSize: 12, fontWeight: 700,
};
const muteBannerStyle: CSSProperties = {
  border: '1px solid #fecaca', borderRadius: 12,
  padding: '10px 14px', background: '#fef2f2',
  marginBottom: 16, fontSize: 13, color: '#991b1b',
};
