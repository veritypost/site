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
  hasQuiz?: boolean;
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
  expert_title?: string | null;
};

// EXPERT_THREADS Wave 4b — picker payload from /api/expert/picker.
type ExpertPickerData = {
  category_id: string;
  category_name: string;
  experts: SuggestUser[];
};

// MentionSuggest is now a discriminated union — bare-mention picker keeps
// the legacy shape; the @expert picker carries the broadcast button +
// directed list. The activeIndex walks across [broadcast, ...experts]
// in expert mode.
type MentionSuggest =
  | { kind: 'bare'; results: SuggestUser[]; activeIndex: number }
  | { kind: 'expert'; data: ExpertPickerData; activeIndex: number }
  | null;

// 60-sec client cache for picker results — per composer instance. Spec
// §2 "Picker rate-limit composer UX": the server caps at 10/min via
// check_rate_limit; legitimate open-close-reopen browsing of the picker
// shouldn't false-positive that rate-limit, so we serve the cached
// payload until it expires.
const PICKER_CACHE_TTL_MS = 60_000;

export default function CommentComposer({
  articleId,
  parentId = null,
  onPosted,
  onCancel,
  autoFocus = false,
  quizPassed = true,
  hasQuiz = true,
}: CommentComposerProps) {
  const [body, setBody] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [muteState, setMuteState] = useState<MuteState>(null);
  const [canPost, setCanPost] = useState<boolean>(false);
  const [canMention, setCanMention] = useState<boolean>(false);
  const [permsLoaded, setPermsLoaded] = useState<boolean>(false);
  const [mentionSuggest, setMentionSuggest] = useState<MentionSuggest>(null);
  // Transient toast — set on picker rate-limit hit (429 from /api/expert/picker)
  // OR on cap-hit / duplicate / generic mention rejection from POST. Cleared
  // on next keystroke. Kept separate from `error` so the post-submit error
  // surface stays specific to the submit path.
  const [pickerNotice, setPickerNotice] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Picker cache: keyed implicitly by the composer instance + the
  // article it's mounted on. We don't cache by article_id because each
  // composer instance is mounted on a single article — TTL alone is
  // sufficient.
  const pickerCacheRef = useRef<{ at: number; data: ExpertPickerData } | null>(null);

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

  // Returns either a bare-mention partial ({kind:'bare', q}) or an
  // expert-picker partial ({kind:'expert', q}) at the cursor, or null
  // when no mention token is being typed.
  // Expert trigger: `@expert` exactly, OR `@expert_<partial>`. Anything
  // else (`@expertise`, `@maria`, `@_`) routes to the bare picker.
  function getMentionQueryAtCursor(
    text: string,
    cursor: number
  ): { kind: 'bare'; q: string } | { kind: 'expert'; q: string } | null {
    const before = text.slice(0, cursor);
    const match = before.match(/@(\w{0,30})$/);
    if (!match) return null;
    const partial = match[1] || '';
    // Expert picker: bare `@expert` (no underscore/letters yet) OR
    // `@expert_<partial>`. Both open the picker; partial after the
    // underscore is a directed-list filter applied client-side.
    if (partial === 'expert' || partial.startsWith('expert_')) {
      const q = partial === 'expert' ? '' : partial.slice('expert_'.length);
      return { kind: 'expert', q };
    }
    if (partial.length === 0) return null;
    return { kind: 'bare', q: partial };
  }

  async function fetchExpertPicker(): Promise<
    | { ok: true; data: ExpertPickerData }
    | { ok: false; reason: 'rate_limited' | 'kill_switch_off' | 'unknown' }
  > {
    const cached = pickerCacheRef.current;
    if (cached && Date.now() - cached.at < PICKER_CACHE_TTL_MS) {
      return { ok: true, data: cached.data };
    }
    let res: Response | null;
    try {
      res = await fetch(`/api/expert/picker?article_id=${encodeURIComponent(articleId)}`);
    } catch {
      return { ok: false, reason: 'unknown' };
    }
    if (!res) return { ok: false, reason: 'unknown' };
    // 404 = kill switch off; silently fall back to bare picker.
    if (res.status === 404) return { ok: false, reason: 'kill_switch_off' };
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    if (!res.ok) return { ok: false, reason: 'unknown' };
    const data = await res.json().catch(() => null) as ExpertPickerData | null;
    if (!data || !Array.isArray(data.experts)) {
      return { ok: false, reason: 'unknown' };
    }
    pickerCacheRef.current = { at: Date.now(), data };
    return { ok: true, data };
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    // Any keystroke clears the transient picker notice — ratelimit /
    // 4xx toasts are tied to the previous attempt, not the next one.
    if (pickerNotice) setPickerNotice('');

    if (!canMention) return;

    const cursor = e.target.selectionStart ?? val.length;
    const q = getMentionQueryAtCursor(val, cursor);

    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);

    if (!q) {
      setMentionSuggest(null);
      return;
    }

    if (q.kind === 'expert') {
      mentionTimerRef.current = setTimeout(async () => {
        const result = await fetchExpertPicker();
        if (!result.ok) {
          setMentionSuggest(null);
          if (result.reason === 'rate_limited') {
            setPickerNotice('easy on the search — try again in a sec');
          }
          // kill_switch_off → silent fall-through (bare-only world)
          return;
        }
        setMentionSuggest({ kind: 'expert', data: result.data, activeIndex: 0 });
      }, 180);
      return;
    }

    mentionTimerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/comments/mention-search?q=${encodeURIComponent(q.q)}`).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => ({}));
      const users: SuggestUser[] = Array.isArray(data.users) ? data.users : [];
      if (users.length > 0) {
        setMentionSuggest({ kind: 'bare', results: users, activeIndex: 0 });
      } else {
        setMentionSuggest(null);
      }
    }, 180);
  }

  // For the expert picker, walks across [broadcast, ...directedExperts].
  // For the bare picker, walks across results[].
  function suggestRowCount(s: NonNullable<MentionSuggest>): number {
    if (s.kind === 'bare') return s.results.length;
    return 1 + s.data.experts.length; // broadcast + directed
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionSuggest) return;
    const total = suggestRowCount(mentionSuggest);
    if (total === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionSuggest((s) =>
        s ? { ...s, activeIndex: Math.min(s.activeIndex + 1, total - 1) } : s
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionSuggest((s) =>
        s ? { ...s, activeIndex: Math.max(s.activeIndex - 1, 0) } : s
      );
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pickActive();
    } else if (e.key === 'Escape') {
      setMentionSuggest(null);
    }
  }

  function pickActive() {
    if (!mentionSuggest) return;
    if (mentionSuggest.kind === 'bare') {
      const item = mentionSuggest.results[mentionSuggest.activeIndex];
      if (item) insertBareMention(item.username);
      return;
    }
    // expert picker — index 0 is broadcast, 1+ is directed list
    if (mentionSuggest.activeIndex === 0) {
      insertExpertBroadcast();
    } else {
      const expert = mentionSuggest.data.experts[mentionSuggest.activeIndex - 1];
      if (expert) insertExpertDirected(expert.username);
    }
  }

  function replacePartialAtCursor(token: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? body.length;
    const before = body.slice(0, cursor);
    const after = body.slice(cursor);
    // Match the same pattern getMentionQueryAtCursor uses so we replace
    // exactly the partial token the user is typing.
    const match = before.match(/@\w{0,30}$/);
    if (!match || match.index === undefined) return;
    const newBefore = before.slice(0, match.index) + token + ' ';
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

  function insertBareMention(username: string) {
    replacePartialAtCursor('@' + username);
  }

  function insertExpertBroadcast() {
    replacePartialAtCursor('@expert');
  }

  function insertExpertDirected(username: string) {
    // Spec §2: "no duplicate @ of the same expert in one comment."
    // Composer prevents — guard before inserting and surface the same
    // lowercase copy the server uses.
    const token = `@expert_${username}`;
    const re = new RegExp(`(?<![a-zA-Z0-9_])${escapeRe(token)}(?![a-zA-Z0-9_])`, 'i');
    if (re.test(body)) {
      setPickerNotice("you've already @'d this expert in this comment.");
      setMentionSuggest(null);
      return;
    }
    replacePartialAtCursor(token);
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
  // Wave 4b — switched payload from `{usernames}` to `{body, article_id}`
  // so the server route extracts both bare and expert tokens itself and
  // runs the asker mention-cap RPC when the kill switch is on. The route
  // still supports the legacy `{usernames}` shape for any other caller.
  // New error reasons:
  //   - 429 mention_cap_hit       → cap-hit composer copy (lowercase)
  //   - 400 duplicate_expert_mention (only fires from POST /api/comments,
  //     not /can-mention; documented here for reference)
  async function checkCanMention(): Promise<
    | { ok: true; unresolved?: string[] }
    | {
        ok: false;
        reason:
          | 'free_tier_mention_disabled'
          | 'mentioned_user_blocks_you'
          | 'mention_cap_hit'
          | 'unknown';
        usernames?: string[];
        composer_message?: string;
      }
  > {
    try {
      const res = await fetch('/api/comments/can-mention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, article_id: articleId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        allowed?: boolean;
        reason?: string;
        usernames?: string[];
        unresolved?: string[];
        error?: string;
        composer_message?: string;
      };
      if (res.status === 429 && data?.error === 'mention_cap_hit') {
        return {
          ok: false,
          reason: 'mention_cap_hit',
          composer_message: data.composer_message,
        };
      }
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
    // Note: under kill-switch ON the server parses both bare + expert
    // tokens itself; we only use this list to gate the legacy free-tier
    // mention check (no expert tokens → still fires). Expert presence
    // is detected by a separate regex below.
    const mentionNames = Array.from(
      new Set([...trimmed.matchAll(MENTION_RE)].map((m) => m[1]))
    );
    const hasExpertToken =
      /(?<![a-zA-Z0-9_])@expert(?:_[a-zA-Z0-9_]{2,30})?(?![a-zA-Z0-9_])/.test(trimmed);

    // Pre-submit lock — fires when the draft has any @-token (bare or
    // expert). The server route's own snapshot decides which gates apply
    // based on kill-switch state. No tokens → skip the round-trip.
    if (mentionNames.length > 0 || hasExpertToken) {
      const verdict = await checkCanMention();
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
        } else if (verdict.reason === 'mention_cap_hit') {
          // Spec §2 mandates the literal lowercase copy from the server.
          setError(
            verdict.composer_message ||
              'you reached your mentions for today.'
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
      // Wave 4b — server-side rejections that need lowercase composer copy
      // surfaced verbatim per spec §2.
      if (res.status === 400 && data?.error === 'duplicate_expert_mention') {
        setBusy(false);
        setError(
          data.composer_message ||
            "you've already @'d this expert in this comment."
        );
        return;
      }
      if (res.status === 429 && data?.error === 'mention_cap_hit') {
        setBusy(false);
        setError(
          data.composer_message || 'you reached your mentions for today.'
        );
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
          {hasQuiz ? 'Pass the quiz above to join the discussion.' : 'Comments are locked on this article.'}
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
      {pickerNotice && (
        <div role="status" style={pickerNoticeStyle}>
          {pickerNotice}
        </div>
      )}
      {mentionSuggest?.kind === 'bare' && mentionSuggest.results.length > 0 && (
        <div style={mentionDropdownStyle}>
          {mentionSuggest.results.map((u, i) => (
            <button
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); insertBareMention(u.username); }}
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
      {mentionSuggest?.kind === 'expert' && (() => {
        const sugg = mentionSuggest;
        const data = sugg.data;
        // Apply the post-`expert_` partial as a starts-with filter so
        // typing `@expert_m` narrows the directed list to usernames
        // beginning with "m". Empty partial → full list.
        const cursor = textareaRef.current?.selectionStart ?? body.length;
        const before = body.slice(0, cursor);
        const partialMatch = before.match(/@expert_([a-zA-Z0-9_]{0,30})$/);
        const partial = (partialMatch?.[1] ?? '').toLowerCase();
        const filtered = partial
          ? data.experts.filter((e) => e.username.toLowerCase().startsWith(partial))
          : data.experts;
        const broadcastLabel = data.category_name
          ? `Ask all experts in ${data.category_name}`
          : 'Ask all experts in this category';
        // Active index walks across [broadcast, ...filtered]. The
        // up-front `data.experts` list drives keyboard nav; filtering
        // resets the visible window — clamp the displayed active index
        // to the filtered length so we don't visually overshoot.
        const visibleActive = Math.min(sugg.activeIndex, filtered.length);
        return (
          <div style={mentionDropdownStyle}>
            <button
              onMouseDown={(e) => { e.preventDefault(); insertExpertBroadcast(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '7px 10px',
                border: 'none',
                background: visibleActive === 0 ? 'rgba(22,163,74,0.10)' : 'rgba(22,163,74,0.04)',
                cursor: 'pointer',
                borderRadius: 6,
                textAlign: 'left',
                borderBottom: filtered.length > 0 ? '1px solid var(--border, #e5e5e5)' : 'none',
                marginBottom: filtered.length > 0 ? 4 : 0,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'var(--success-text)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                ★
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success-text)' }}>
                {broadcastLabel}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--dim, #888)',
                  marginLeft: 'auto',
                }}
              >
                Broadcast
              </span>
            </button>
            {filtered.length === 0 && partial.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--dim, #666)', padding: '6px 10px' }}>
                No experts in this category are available right now.
              </div>
            )}
            {filtered.map((u, i) => {
              const idx = i + 1; // 0 is broadcast
              return (
                <button
                  key={u.id}
                  onMouseDown={(e) => { e.preventDefault(); insertExpertDirected(u.username); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 10px',
                    border: 'none',
                    background: idx === sugg.activeIndex ? 'rgba(17,17,17,0.06)' : 'transparent',
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
                    @expert_{u.username}
                  </span>
                  {u.expert_title && (
                    <span style={{ fontSize: 12, color: 'var(--dim, #666)', marginLeft: 2 }}>
                      {u.expert_title}
                    </span>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success-text)', marginLeft: 'auto' }}>
                    Expert
                  </span>
                </button>
              );
            })}
          </div>
        );
      })()}
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
const pickerNoticeStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--dim, #666)',
  background: 'var(--card, #f7f7f7)',
  border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 8,
  padding: '6px 10px',
  marginBottom: 8,
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const muteBannerStyle: CSSProperties = {
  border: '1px solid var(--danger-border)',
  borderRadius: 12,
  padding: '12px 16px',
  background: 'var(--danger-bg)',
  marginBottom: 16,
  fontSize: 14,
  color: '#991b1b',
};
