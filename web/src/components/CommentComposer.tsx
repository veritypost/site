// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import { createClient } from '../lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { MENTION_RE } from '@/lib/mentions';
import { COPY } from '@/lib/copy';
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('is_banned, is_muted, mute_level, muted_until')
        .eq('id', user.id)
        .maybeSingle();
      if (!data) return;
      const muteActive =
        !!data.is_muted &&
        (data.mute_level ?? 0) >= 1 &&
        (!data.muted_until || new Date(data.muted_until) > new Date());
      if (data.is_banned || muteActive) {
        setMuteState({
          banned: !!data.is_banned,
          muted_until: data.muted_until,
          mute_level: data.mute_level,
        });
      }
    })();
  }, [parentId]);

  async function resolveMentions(text: string): Promise<Mention[]> {
    if (!canMention) return [];
    const supabase = createClient();
    const names = Array.from(new Set([...text.matchAll(MENTION_RE)].map((m) => m[1])));
    if (names.length === 0) return [];
    const { data } = await supabase.from('users').select('id, username').in('username', names);
    return (data || [])
      .filter((u): u is { id: string; username: string } => !!u.username)
      .map((u) => ({ user_id: u.id, username: u.username }));
  }

  // S5-§H2 — pre-submit mention lock.
  //
  // Pre-§H2 the composer let the post fly even when the @-tokens couldn't
  // fan out (free-tier author OR mentioned user has blocked the author).
  // The post_comment RPC silently dropped mention fan-out, the user saw
  // their @-link tappable in their own comment, and the mentioned user
  // never got a notification. That breaks user expectation and silently
  // discriminates against free tier.
  //
  // The fix is to ask the server "can I mention these?" before submit and
  // block on a no-go reason. The post_comment RPC re-validates plan +
  // blocks server-side as defense-in-depth (S1 ships that change).
  async function checkCanMention(
    usernames: string[]
  ): Promise<
    | { ok: true; unresolved?: string[] }
    | { ok: false; reason: 'free_tier_mention_disabled' | 'mentioned_user_blocks_you' | 'unknown'; usernames?: string[] }
  > {
    if (usernames.length === 0) return { ok: true };
    try {
      const res = await fetch('/api/comments/can-mention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        allowed?: boolean;
        reason?: string;
        usernames?: string[];
        unresolved?: string[];
      };
      if (!res.ok) return { ok: false, reason: 'unknown' };
      if (data.allowed === false) {
        const reason =
          data.reason === 'free_tier_mention_disabled' ||
          data.reason === 'mentioned_user_blocks_you'
            ? data.reason
            : 'unknown';
        return { ok: false, reason, usernames: data.usernames };
      }
      return { ok: true, unresolved: data.unresolved };
    } catch {
      // Network failure — let the submit proceed; the server-side defense
      // catches an unauthorized mention if the network blip cleared by
      // the time the POST lands. Surfacing a hard block on a transient
      // network error would punish a legitimate user.
      return { ok: true };
    }
  }

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    setError('');

    // Extract @-tokens once. MENTION_RE is `/g`-flagged so we deliberately
    // re-iterate rather than call .test() (which carries lastIndex).
    const mentionNames = Array.from(
      new Set([...trimmed.matchAll(MENTION_RE)].map((m) => m[1]))
    );

    // Pre-submit lock — only fires when the draft has @-tokens. No
    // tokens → straight to the post path with zero extra latency.
    if (mentionNames.length > 0) {
      const verdict = await checkCanMention(mentionNames);
      if (!verdict.ok) {
        if (verdict.reason === 'free_tier_mention_disabled') {
          setError(
            'Mentions are a Pro feature. Upgrade or remove the @username to post.'
          );
        } else if (verdict.reason === 'mentioned_user_blocks_you') {
          const blocked = (verdict.usernames || []).join(', @');
          setError(
            blocked
              ? `You can't mention @${blocked} — they've blocked you.`
              : "You can't mention that user — they've blocked you."
          );
        } else {
          setError(COPY.comments.postFailed);
        }
        return;
      }
    }

    setBusy(true);
    try {
      const mentions = await resolveMentions(trimmed);
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: articleId,
          body: trimmed,
          parent_id: parentId,
          mentions,
        }),
      });
      const data = await res.json().catch(() => ({}));
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

  // T108 \u2014 Live, pre-submit mention-permission hint.
  // Watches the current draft for an `@<word>` pattern and surfaces the
  // paid-feature explainer inline so the reader sees it BEFORE they hit
  // Post (the previous-only signal lived in the post-submit error
  // branch). MENTION_RE is `/g`-flagged \u2192 use .match() so re-renders
  // don't carry .test()'s lastIndex across calls.
  const draftHasMention = !!body.match(MENTION_RE);
  const showMentionHint = permsLoaded && !canMention && draftHasMention;

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
      {showMentionHint && (
        // Live tooltip above the textarea \u2014 informational, not blocking.
        // Disappears the moment the user upgrades (canMention flips true)
        // or removes the @-handle. The post-submit toast at submit() is
        // kept as a redundant safety net; the user dismisses it themselves.
        <div role="note" style={mentionHintStyle}>
          {COPY.comments.mentionPaid}
        </div>
      )}
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
          {canMention
            ? 'Tip: type @username to mention.'
            : '@mentions are available on paid plans.'}
        </span>
        <span style={{ flex: 1 }} />
        {onCancel && (
          <button onClick={onCancel} style={cancelBtnStyle}>
            Cancel
          </button>
        )}
        <button
          onClick={submit}
          disabled={!body.trim() || busy}
          style={{
            ...postBtnStyle,
            background: body.trim() && !busy ? 'var(--accent, #111)' : '#ccc',
            cursor: body.trim() && !busy ? 'pointer' : 'default',
          }}
        >
          {busy ? 'Posting\u2026' : 'Post'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const containerStyle: CSSProperties = {
  border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'var(--card, #f7f7f7)',
  marginBottom: 16,
};
const textareaStyle: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--white, #111)',
  fontSize: 14,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
};
const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 6,
  fontSize: 11,
  color: 'var(--dim, #666)',
};
const cancelBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 12,
  color: 'var(--dim, #666)',
  cursor: 'pointer',
};
const postBtnStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  border: 'none',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
};
const mentionHintStyle: CSSProperties = {
  fontSize: 11,
  color: '#b45309',
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: 6,
  padding: '6px 8px',
  marginBottom: 8,
  lineHeight: 1.4,
};
const muteBannerStyle: CSSProperties = {
  border: '1px solid #fecaca',
  borderRadius: 12,
  padding: '10px 14px',
  background: '#fef2f2',
  marginBottom: 16,
  fontSize: 13,
  color: '#991b1b',
};
