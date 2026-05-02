'use client';
import { useState, useEffect, useRef, CSSProperties } from 'react';
import { createClient } from '../lib/supabase/client';
import { hasPermission, refreshIfStale } from '@/lib/permissions';
import { MENTION_RE } from '@/lib/mentions';
import { COPY } from '@/lib/copy';
import { friendlyError } from '@/lib/friendlyError';
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
  // Locked-composer gate: when false and the user is not muted/banned,
  // renders a locked state instead of the form. Defaults to true so
  // existing call sites that don't pass this prop are unaffected.
  quizPassed?: boolean;
}

type MuteState = {
  banned: boolean;
  muted_until: string | null;
  mute_level: number | null;
} | null;

type SuggestUser = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_color?: string | null;
  is_verified_public_figure?: boolean;
  is_expert?: boolean;
};

type MentionSuggest = {
  results: SuggestUser[];
  activeIndex: number;
} | null;

export default function CommentComposer({
  articleId,
  parentId = null,
  onPosted,
  onCancel,
  autoFocus = false,
  quizPassed = true,
}: CommentComposerProps) {
  const [body, setBody] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [muteState, setMuteState] = useState<MuteState>(null);
  const [canPost, setCanPost] = useState<boolean>(false);
  const [canMention, setCanMention] = useState<boolean>(false);
  const [permsLoaded, setPermsLoaded] = useState<boolean>(false);
  const [mentionSuggest, setMentionSuggest] = useState<MentionSuggest>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
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

  function getMentionQueryAtCursor(text: string, cursor: number): string | null {
    const before = text.slice(0, cursor);
    const match = before.match(/@(\w{1,30})$/);
    return match ? match[1] : null;
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);

    if (!canMention) return;

    const cursor = e.target.selectionStart ?? val.length;
    const q = getMentionQueryAtCursor(val, cursor);

    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);

    if (!q) {
      setMentionSuggest(null);
      return;
    }

    mentionTimerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/comments/mention-search?q=${encodeURIComponent(q)}`).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => ({}));
      const users: SuggestUser[] = Array.isArray(data.users) ? data.users : [];
      if (users.length > 0) {
        setMentionSuggest({ results: users, activeIndex: 0 });
      } else {
        setMentionSuggest(null);
      }
    }, 180);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionSuggest) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionSuggest((s) => s ? { ...s, activeIndex: Math.min(s.activeIndex + 1, s.results.length - 1) } : s);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionSuggest((s) => s ? { ...s, activeIndex: Math.max(s.activeIndex - 1, 0) } : s);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (mentionSuggest.results.length > 0) {
        e.preventDefault();
        insertMention(mentionSuggest.results[mentionSuggest.activeIndex].username);
      }
    } else if (e.key === 'Escape') {
      setMentionSuggest(null);
    }
  }

  function insertMention(username: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? body.length;
    const before = body.slice(0, cursor);
    const after = body.slice(cursor);
    const match = before.match(/@\w{0,30}$/);
    if (!match || match.index === undefined) return;
    const newBefore = before.slice(0, match.index) + '@' + username + ' ';
    const newBody = newBefore + after;
    setBody(newBody);
    setMentionSuggest(null);
    setTimeout(() => {
      if (ta) {
        ta.selectionStart = ta.selectionEnd = newBefore.length;
        ta.focus();
      }
    }, 0);
  }

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
    setBusy(true);
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
        setBusy(false);
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
      if (data.preview) {
        setBusy(false);
        setError('Preview mode — comment not saved.');
        return;
      }
      if (!res.ok) throw new Error(friendlyError(data?.error, 'Could not post'));
      setBody('');
      window.dispatchEvent(new Event('vp:comment-sent'));
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

  if (!canPost) {
    return (
      <div style={muteBannerStyle}>
        Posting comments requires a Verity subscription.
      </div>
    );
  }

  if (muteState) {
    return (
      <div style={muteBannerStyle}>
        Posting is disabled while the account notice at the top of the page applies.
      </div>
    );
  }

  if (quizPassed === false && !muteState && permsLoaded) {
    return (
      <div
        style={{
          padding: '16px 18px',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, color: 'var(--dim, #888)', lineHeight: 1.5 }}>
          Pass the quiz above to join the discussion.
        </div>
      </div>
    );
  }

  const isReply = !!parentId;

  return (
    <div style={isReply ? replyContainerStyle : containerStyle}>
      {showMentionHint && (
        <div role="note" style={mentionHintStyle}>
          {COPY.comments.mentionPaid}
        </div>
      )}
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={body}
        onChange={handleBodyChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setMentionSuggest(null), 150)}
        placeholder={isReply ? 'Write a reply\u2026' : 'Add to the discussion.'}
        aria-label={isReply ? 'Reply text' : 'Comment text'}
        rows={isReply ? 2 : 3}
        style={textareaStyle}
      />
      {mentionSuggest && mentionSuggest.results.length > 0 && (
        <div style={mentionDropdownStyle}>
          {mentionSuggest.results.map((u, i) => (
            <button
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(u.username); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 10px',
                border: 'none',
                background: i === mentionSuggest.activeIndex ? 'rgba(17,17,17,0.06)' : 'transparent',
                cursor: 'pointer',
                borderRadius: 6,
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: u.avatar_color || '#ccc',
                  backgroundImage: u.avatar_url ? `url(${u.avatar_url})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                {!u.avatar_url && u.username ? u.username[0].toUpperCase() : ''}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #1a1a1a)' }}>
                @{u.username}
              </span>
              {u.display_name && u.display_name !== u.username && (
                <span style={{ fontSize: 12, color: 'var(--dim, #666)', marginLeft: 2 }}>
                  {u.display_name}
                </span>
              )}
              {u.is_expert && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success-text)', marginLeft: 'auto' }}>
                  Expert
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {!isReply && (
        <div style={{ fontSize: 12, color: 'var(--dim, #666)', marginBottom: 10, lineHeight: 1.5 }}>
          Others passed a quiz to read this. Make it worth their time.
        </div>
      )}
      <div style={footerStyle}>
        <span>
          {canMention
            ? isReply ? '' : 'Tip: type @username to mention.'
            : isReply ? '' : '@mentions are available on paid plans.'}
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
  borderLeft: '3px solid var(--accent, #111)',
  borderRadius: '0 10px 10px 0',
  padding: '12px 14px',
  background: 'var(--card, #f7f7f7)',
  marginBottom: 16,
};

const replyContainerStyle: CSSProperties = {
  border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'transparent',
  marginBottom: 12,
  marginTop: 6,
};
const textareaStyle: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary, #111)',
  fontSize: 14,
  lineHeight: 1.6,
  padding: '4px 0',
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
};
const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 8,
  paddingTop: 10,
  borderTop: '1px solid var(--border, #e5e5e5)',
  fontSize: 12,
  color: 'var(--dim, #666)',
};
const cancelBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 13,
  color: 'var(--dim, #666)',
  cursor: 'pointer',
};
const postBtnStyle: CSSProperties = {
  padding: '7px 16px',
  borderRadius: 9,
  border: 'none',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
};
const mentionDropdownStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 10,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '4px',
  marginBottom: 8,
  maxHeight: 240,
  overflowY: 'auto',
};

const mentionHintStyle: CSSProperties = {
  fontSize: 12,
  color: '#b45309',
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: 8,
  padding: '8px 10px',
  marginBottom: 8,
  lineHeight: 1.4,
};
const muteBannerStyle: CSSProperties = {
  border: '1px solid var(--danger-border)',
  borderRadius: 12,
  padding: '12px 16px',
  background: 'var(--danger-bg)',
  marginBottom: 16,
  fontSize: 14,
  color: '#991b1b',
};
