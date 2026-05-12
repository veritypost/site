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

export type Intent = 'question' | 'add_context' | 'different_take';

interface CommentComposerProps {
  articleId: string;
  parentId?: string | null;
  onPosted?: (comment: CommentRow | null) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  quizPassed?: boolean;
  hasQuiz?: boolean;
  prefillQuote?: string;
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

type ExpertPickerData = {
  category_id: string;
  category_name: string;
  experts: SuggestUser[];
};

type MentionSuggest =
  | { kind: 'bare'; results: SuggestUser[]; activeIndex: number }
  | { kind: 'expert'; data: ExpertPickerData; activeIndex: number }
  | null;

const PICKER_CACHE_TTL_MS = 60_000;

export default function CommentComposer({
  articleId,
  parentId = null,
  onPosted,
  onCancel,
  autoFocus = false,
  quizPassed = true,
  hasQuiz = true,
  prefillQuote,
}: CommentComposerProps) {
  const [intent, setIntent] = useState<Intent | null>(null);
  const [bodyText, setBodyText] = useState<string>('');
  const [isEmpty, setIsEmpty] = useState(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  // Firsthand self-tag — author asserts at compose time, sent in the POST
  // payload as `real_world_experience` (≤80 chars CHECK). Persisted on
  // `comments.real_world_experience`. Single-column model: presence of
  // trimmed text IS the firsthand claim. Empty + checked → not persisted.
  const [firsthand, setFirsthand] = useState<boolean>(false);
  const [firsthandContext, setFirsthandContext] = useState<string>('');
  // Suggested context pulled from the user's saved profile background line.
  // Pre-fills only when the user checks firsthand AND hasn't typed anything;
  // they can edit or clear freely once it appears.
  const [profileBackgroundOneline, setProfileBackgroundOneline] = useState<string>('');
  const FIRSTHAND_CONTEXT_LIMIT = 80;
  const [muteState, setMuteState] = useState<MuteState>(null);
  const [canPost, setCanPost] = useState<boolean>(false);
  const [canMention, setCanMention] = useState<boolean>(false);
  const [permsLoaded, setPermsLoaded] = useState<boolean>(false);
  const [mentionSuggest, setMentionSuggest] = useState<MentionSuggest>(null);
  const [pickerNotice, setPickerNotice] = useState<string>('');

  const editorRef = useRef<HTMLDivElement | null>(null);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('is_banned, is_muted, mute_level, muted_until, background_oneline')
        .eq('id', user.id)
        .maybeSingle();
      if (!data) return;
      // Cache the user's profile background line so the firsthand context
      // input can pre-fill from it on first toggle.
      if (typeof data.background_oneline === 'string') {
        setProfileBackgroundOneline(data.background_oneline);
      }
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

  useEffect(() => {
    if (autoFocus && editorRef.current && permsLoaded && !prefillQuote) {
      editorRef.current.focus();
    }
  }, [autoFocus, permsLoaded, prefillQuote]);

  useEffect(() => {
    if (!prefillQuote || !editorRef.current || !permsLoaded) return;
    const bq = document.createElement('blockquote');
    bq.textContent = prefillQuote;
    const p = document.createElement('p');
    p.appendChild(document.createTextNode(' '));
    editorRef.current.innerHTML = '';
    editorRef.current.appendChild(bq);
    editorRef.current.appendChild(p);
    const range = document.createRange();
    range.setStart(p.firstChild!, 1);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const text = editorRef.current.innerText ?? '';
    setBodyText(text);
    setIsEmpty(false);
    editorRef.current.focus();
  }, [prefillQuote, permsLoaded]);

  function getMentionQueryAtCursor(
    text: string,
    cursor: number
  ): { kind: 'bare'; q: string } | { kind: 'expert'; q: string } | null {
    const before = text.slice(0, cursor);
    const match = before.match(/@(\w{0,30})$/);
    if (!match) return null;
    const partial = match[1] || '';
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
    if (res.status === 404) return { ok: false, reason: 'kill_switch_off' };
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    if (!res.ok) return { ok: false, reason: 'unknown' };
    const data = await res.json().catch(() => null) as ExpertPickerData | null;
    if (!data || !Array.isArray(data.experts)) return { ok: false, reason: 'unknown' };
    pickerCacheRef.current = { at: Date.now(), data };
    return { ok: true, data };
  }

  function getTextBeforeCursor(): string {
    const el = editorRef.current;
    if (!el) return '';
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return '';
    const range = document.createRange();
    range.selectNodeContents(el);
    const cur = sel.getRangeAt(0);
    range.setEnd(cur.startContainer, cur.startOffset);
    return range.toString();
  }

  function handleEditorInput() {
    const text = editorRef.current?.innerText ?? '';
    setBodyText(text);
    setIsEmpty(text.trim().length === 0);
    if (pickerNotice) setPickerNotice('');
    if (!canMention) return;
    const textBefore = getTextBeforeCursor();
    const q = getMentionQueryAtCursor(textBefore, textBefore.length);
    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    if (!q) { setMentionSuggest(null); return; }
    if (q.kind === 'expert') {
      mentionTimerRef.current = setTimeout(async () => {
        const result = await fetchExpertPicker();
        if (!result.ok) {
          setMentionSuggest(null);
          if (result.reason === 'rate_limited') setPickerNotice('easy on the search — try again in a sec');
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
      if (users.length > 0) setMentionSuggest({ kind: 'bare', results: users, activeIndex: 0 });
      else setMentionSuggest(null);
    }, 180);
  }

  function suggestRowCount(s: NonNullable<MentionSuggest>): number {
    if (s.kind === 'bare') return s.results.length;
    return 1 + s.data.experts.length;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (!mentionSuggest) return;
    const total = suggestRowCount(mentionSuggest);
    if (total === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionSuggest((s) => s ? { ...s, activeIndex: Math.min(s.activeIndex + 1, total - 1) } : s);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionSuggest((s) => s ? { ...s, activeIndex: Math.max(s.activeIndex - 1, 0) } : s);
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
    if (mentionSuggest.activeIndex === 0) insertExpertBroadcast();
    else {
      const expert = mentionSuggest.data.experts[mentionSuggest.activeIndex - 1];
      if (expert) insertExpertDirected(expert.username);
    }
  }

  function replacePartialAtCursor(token: string) {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    const textBefore = getTextBeforeCursor();
    const match = textBefore.match(/@\w{0,30}$/);
    if (!match || match.index === undefined) return;
    const range = sel.getRangeAt(0).cloneRange();
    const startNode = range.startContainer;
    if (startNode.nodeType === Node.TEXT_NODE) {
      const newStart = range.startOffset - match[0].length;
      if (newStart >= 0) range.setStart(startNode, newStart);
    }
    range.deleteContents();
    const textNode = document.createTextNode(token + ' ');
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    setMentionSuggest(null);
    el.focus();
    const newText = el.innerText ?? '';
    setBodyText(newText);
    setIsEmpty(newText.trim().length === 0);
  }

  function insertBareMention(username: string) { replacePartialAtCursor('@' + username); }
  function insertExpertBroadcast() { replacePartialAtCursor('@expert'); }

  function insertExpertDirected(username: string) {
    const token = `@expert_${username}`;
    const re = new RegExp(`(?<![a-zA-Z0-9_])${escapeRe(token)}(?![a-zA-Z0-9_])`, 'i');
    if (re.test(editorRef.current?.innerText ?? '')) {
      setPickerNotice("you've already @'d this expert in this comment.");
      setMentionSuggest(null);
      return;
    }
    replacePartialAtCursor(token);
  }

  function applyFormat(command: string) {
    editorRef.current?.focus();
    document.execCommand(command, false);
    const text = editorRef.current?.innerText ?? '';
    setBodyText(text);
    setIsEmpty(text.trim().length === 0);
  }

  function applyCodeFormat() {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const code = document.createElement('code');
    code.style.cssText = 'font-family:ui-monospace,monospace;font-size:0.88em;background:rgba(0,0,0,0.06);border-radius:3px;padding:1px 5px';
    try {
      range.surroundContents(code);
    } catch {
      const fragment = range.extractContents();
      code.appendChild(fragment);
      range.insertNode(code);
    }
    const text = editorRef.current?.innerText ?? '';
    setBodyText(text);
    setIsEmpty(text.trim().length === 0);
  }

  function sanitizeCommentHtml(html: string): string {
    return html.replace(/<[^>]*>/g, (tag) => {
      const t = tag.toLowerCase().replace(/\s+/g, '').trim();
      if (/^<(strong|em|del|code|blockquote)>$/.test(t)) return tag;
      if (/^<\/(strong|em|del|code|blockquote)>$/.test(t)) return tag;
      if (t === '<br>' || t === '<br/>') return '\n';
      return '';
    }).trim();
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

  async function checkCanMention(): Promise<
    | { ok: true; unresolved?: string[] }
    | { ok: false; reason: 'free_tier_mention_disabled' | 'mentioned_user_blocks_you' | 'mention_cap_hit' | 'unknown'; usernames?: string[]; composer_message?: string }
  > {
    try {
      const res = await fetch('/api/comments/can-mention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: bodyText, article_id: articleId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        allowed?: boolean; reason?: string; usernames?: string[]; unresolved?: string[]; error?: string; composer_message?: string;
      };
      if (res.status === 429 && data?.error === 'mention_cap_hit') {
        return { ok: false, reason: 'mention_cap_hit', composer_message: data.composer_message };
      }
      if (!res.ok) return { ok: false, reason: 'unknown' };
      if (data.allowed === false) {
        const reason = data.reason === 'free_tier_mention_disabled' || data.reason === 'mentioned_user_blocks_you'
          ? data.reason : 'unknown';
        return { ok: false, reason, usernames: data.usernames };
      }
      return { ok: true, unresolved: data.unresolved };
    } catch {
      return { ok: true };
    }
  }

  async function submit() {
    const plainText = (editorRef.current?.innerText ?? '').trim();
    if (!plainText || busy) return;
    setBusy(true);
    setError('');

    const mentionNames = Array.from(new Set([...plainText.matchAll(MENTION_RE)].map((m) => m[1])));
    const hasExpertToken = /(?<![a-zA-Z0-9_])@expert(?:_[a-zA-Z0-9_]{2,30})?(?![a-zA-Z0-9_])/.test(plainText);

    if (mentionNames.length > 0 || hasExpertToken) {
      const verdict = await checkCanMention();
      if (!verdict.ok) {
        setBusy(false);
        if (verdict.reason === 'free_tier_mention_disabled') {
          setError('Mentions are a Pro feature. Upgrade or remove the @username to post.');
        } else if (verdict.reason === 'mentioned_user_blocks_you') {
          const blocked = (verdict.usernames || []).join(', @');
          setError(blocked ? `You can't mention @${blocked} — they've blocked you.` : "You can't mention that user — they've blocked you.");
        } else if (verdict.reason === 'mention_cap_hit') {
          setError(verdict.composer_message || 'you reached your mentions for today.');
        } else {
          setError(COPY.comments.postFailed);
        }
        return;
      }
    }

    try {
      const html = editorRef.current?.innerHTML ?? '';
      const sanitized = sanitizeCommentHtml(html);
      const mentions = await resolveMentions(plainText);
      const rweCandidate = firsthand ? firsthandContext.trim() : '';
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: articleId,
          body: sanitized || plainText,
          parent_id: parentId,
          mentions,
          real_world_experience: rweCandidate || null,
          intent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.preview) { setBusy(false); setError('Preview mode — comment not saved.'); return; }
      if (res.status === 400 && data?.error === 'duplicate_expert_mention') {
        setBusy(false); setError(data.composer_message || "you've already @'d this expert in this comment."); return;
      }
      if (res.status === 429 && data?.error === 'mention_cap_hit') {
        setBusy(false); setError(data.composer_message || 'you reached your mentions for today.'); return;
      }
      if (!res.ok) throw new Error(friendlyError(data?.error, 'Could not post'));
      if (editorRef.current) editorRef.current.innerHTML = '';
      setBodyText('');
      setIsEmpty(true);
      window.dispatchEvent(new Event('vp:comment-sent'));
      const posted = data.comment || null;
      setFirsthand(false);
      setFirsthandContext('');
      setIntent(null);
      onPosted?.(posted);
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  }

  const draftHasMention = !!bodyText.match(MENTION_RE);
  const showMentionHint = permsLoaded && !canMention && draftHasMention;

  if (!permsLoaded) return null;
  if (!canPost) return <div style={muteBannerStyle}>Posting comments requires a Verity subscription.</div>;
  if (muteState) return <div style={muteBannerStyle}>Posting is disabled while the account notice at the top of the page applies.</div>;
  if (quizPassed === false && !muteState && permsLoaded) {
    return (
      <div style={{ padding: '16px 18px', border: '1px solid var(--border, #e5e5e5)', borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: 'var(--dim, #888)', lineHeight: 1.5 }}>
          {hasQuiz ? 'Take the quiz.' : 'Comments are locked on this article.'}
        </div>
      </div>
    );
  }

  const isReply = !!parentId;

  // Unified intent picker — same options + visual treatment on both
  // top-level comments and replies. Intent is optional; null = no intent
  // (the "Just replying" / no-tag pill on reply panels).
  // Colors are the editorial intent palette:
  //   add_context    → deep green   (#3d6b4f) bg rgba(61,107,79,0.05)
  //   different_take → rust amber   (#a14b1a) bg rgba(161,75,26,0.05)
  //   question       → slate blue   (#4a6e8a) bg rgba(74,110,138,0.05)
  // The glyph prefix is shown in the pill on the panel (and the meta-line
  // chip / tag header in CommentRow re-uses the same glyph + label).
  const INTENT_OPTIONS: Array<{
    value: Intent | null;
    label: string;
    replyLabel: string;
    glyph: string;
    color: string;
    bg: string;
  }> = [
    { value: null,             label: 'No intent',      replyLabel: 'Just replying',   glyph: '↩', color: '#111111', bg: 'transparent' },
    { value: 'add_context',    label: 'Add Context',    replyLabel: 'Adding to this',  glyph: '+', color: '#3d6b4f', bg: 'rgba(61,107,79,0.05)' },
    { value: 'different_take', label: 'Different Take', replyLabel: 'A different take', glyph: '↻', color: '#a14b1a', bg: 'rgba(161,75,26,0.05)' },
    { value: 'question',       label: 'Question',       replyLabel: 'Question',        glyph: '?', color: '#4a6e8a', bg: 'rgba(74,110,138,0.05)' },
  ];

  const COMMENT_BODY_MAX = 4000;

  return (
    <div style={isReply ? replyContainerStyle : containerStyle}>

      <div style={{ position: 'relative', ...(isReply ? { borderTop: '1px solid #dcdcdc', paddingTop: 12, marginTop: 12 } : {}) }}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          data-comment-editor
          onInput={handleEditorInput}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setMentionSuggest(null), 150)}
          role="textbox"
          aria-multiline="true"
          aria-label={isReply ? 'Reply text' : 'Comment text'}
          style={{
            ...editorStyle,
            ...(isReply ? { minHeight: 60, fontSize: 14.5, lineHeight: 1.55 } : {}),
          }}
        />
        {isEmpty && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: isReply ? 16 : 4,
              left: 0,
              pointerEvents: 'none',
              fontSize: isReply ? 14.5 : 14,
              lineHeight: 1.6,
              color: 'var(--p-ink-faint, #bbb)',
              userSelect: 'none',
            }}
          >
            {isReply ? 'Write a reply…' : "What's your take?"}
          </div>
        )}
      </div>
      {showMentionHint && (
        <div style={mentionHintStyle}>
          Mentions are a Pro feature —{' '}
          <a href="/profile/settings#billing" style={{ color: '#b45309', fontWeight: 600 }}>upgrade to tag readers</a>.
        </div>
      )}
      {pickerNotice && <div role="status" style={pickerNoticeStyle}>{pickerNotice}</div>}
      {mentionSuggest?.kind === 'bare' && mentionSuggest.results.length > 0 && (
        <div style={mentionDropdownStyle}>
          {mentionSuggest.results.map((u, i) => (
            <button
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); insertBareMention(u.username); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: i === mentionSuggest.activeIndex ? 'rgba(17,17,17,0.06)' : 'transparent', cursor: 'pointer', borderRadius: 6, textAlign: 'left' }}
            >
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: u.avatar_color || '#ccc', backgroundImage: u.avatar_url ? `url(${u.avatar_url})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                {!u.avatar_url && u.username ? u.username[0].toUpperCase() : ''}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #1a1a1a)' }}>@{u.username}</span>
              {u.display_name && u.display_name !== u.username && (
                <span style={{ fontSize: 12, color: 'var(--dim, #666)', marginLeft: 2 }}>{u.display_name}</span>
              )}
              {u.is_expert && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success-text)', marginLeft: 'auto' }}>Expert</span>}
            </button>
          ))}
        </div>
      )}
      {mentionSuggest?.kind === 'expert' && (() => {
        const sugg = mentionSuggest;
        const data = sugg.data;
        const textBefore = getTextBeforeCursor();
        const partialMatch = textBefore.match(/@expert_([a-zA-Z0-9_]{0,30})$/);
        const partial = (partialMatch?.[1] ?? '').toLowerCase();
        const filtered = partial ? data.experts.filter((e) => e.username.toLowerCase().startsWith(partial)) : data.experts;
        const broadcastLabel = data.category_name ? `Ask all experts in ${data.category_name}` : 'Ask all experts in this category';
        const visibleActive = Math.min(sugg.activeIndex, filtered.length);
        return (
          <div style={mentionDropdownStyle}>
            <button
              onMouseDown={(e) => { e.preventDefault(); insertExpertBroadcast(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: visibleActive === 0 ? 'rgba(22,163,74,0.10)' : 'rgba(22,163,74,0.04)', cursor: 'pointer', borderRadius: 6, textAlign: 'left', borderBottom: filtered.length > 0 ? '1px solid var(--border, #e5e5e5)' : 'none', marginBottom: filtered.length > 0 ? 4 : 0 }}
            >
              <span aria-hidden style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--success-text)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>★</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success-text)' }}>{broadcastLabel}</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--dim, #888)', marginLeft: 'auto' }}>Broadcast</span>
            </button>
            {filtered.length === 0 && partial.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--dim, #666)', padding: '6px 10px' }}>No experts in this category are available right now.</div>
            )}
            {filtered.map((u, i) => {
              const idx = i + 1;
              return (
                <button
                  key={u.id}
                  onMouseDown={(e) => { e.preventDefault(); insertExpertDirected(u.username); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: idx === sugg.activeIndex ? 'rgba(17,17,17,0.06)' : 'transparent', cursor: 'pointer', borderRadius: 6, textAlign: 'left' }}
                >
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: u.avatar_color || '#ccc', backgroundImage: u.avatar_url ? `url(${u.avatar_url})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                    {!u.avatar_url && u.username ? u.username[0].toUpperCase() : ''}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #1a1a1a)' }}>@expert_{u.username}</span>
                  {u.expert_title && <span style={{ fontSize: 12, color: 'var(--dim, #666)', marginLeft: 2 }}>{u.expert_title}</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success-text)', marginLeft: 'auto' }}>Expert</span>
                </button>
              );
            })}
          </div>
        );
      })()}
      <div style={{ marginTop: isReply ? 12 : 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
          role="radiogroup"
          aria-label="Comment intent"
        >
          {INTENT_OPTIONS.map((opt) => {
            const active = intent === opt.value;
            const isNeutral = opt.value === null;
            // Neutral idle: muted ink on neutral border. Intent idle: intent
            // color text + border, transparent fill. On state inverts to a
            // solid fill (ink for neutral, intent color for intents).
            const idleColor = isNeutral ? '#333333' : opt.color;
            const idleBorder = isNeutral ? '#dcdcdc' : opt.color;
            const activeFill = isNeutral ? '#111111' : opt.color;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={isReply ? opt.replyLabel : opt.label}
                onClick={() => setIntent(opt.value)}
                onMouseEnter={(e) => {
                  if (!active && !isNeutral) e.currentTarget.style.background = opt.bg;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12.5,
                  fontWeight: 500,
                  padding: '8px 14px',
                  border: `1px solid ${active ? activeFill : idleBorder}`,
                  borderRadius: 0,
                  background: active ? activeFill : 'transparent',
                  color: active ? '#fcfcfc' : idleColor,
                  cursor: 'pointer',
                  letterSpacing: '0',
                  lineHeight: 1.2,
                  transition: 'background 120ms, color 120ms, border-color 120ms',
                }}
              >
                <span aria-hidden="true">{opt.glyph}</span>
                <span>{isReply ? opt.replyLabel : opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={footerStyle}>
        {(
          [
            { command: 'bold',          label: 'B',  title: 'Bold',          extraStyle: { fontWeight: 700 as const } },
            { command: 'italic',        label: 'I',  title: 'Italic',        extraStyle: { fontStyle: 'italic' as const } },
            { command: 'strikeThrough', label: 'S',  title: 'Strikethrough', extraStyle: { textDecoration: 'line-through' as const } },
            { command: 'code',          label: '`',  title: 'Code',          extraStyle: { fontFamily: 'monospace' } },
          ] as const
        ).map(({ command, label, title, extraStyle }) => (
          <button
            key={command}
            type="button"
            title={title}
            onMouseDown={(e) => {
              e.preventDefault();
              if (command === 'code') applyCodeFormat();
              else applyFormat(command);
            }}
            style={{
              ...extraStyle,
              fontSize: 12,
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #dcdcdc',
              borderRadius: 0,
              background: 'transparent',
              color: '#777777',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {firsthand ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flex: '1 1 240px',
              minWidth: 0,
              padding: '4px 6px',
            }}
          >
            <button
              type="button"
              onClick={() => setFirsthand(false)}
              aria-pressed={true}
              aria-label="Turn off firsthand"
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                border: '1.5px solid var(--p-ink, #0a0a0a)',
                background: 'var(--p-ink, #0a0a0a)',
                padding: 0,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                <path d="M1.5 4l1.7 1.7L6.5 2.5" stroke="var(--p-bg, #fff)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              type="text"
              value={firsthandContext}
              onChange={(e) => setFirsthandContext(e.target.value.slice(0, FIRSTHAND_CONTEXT_LIMIT))}
              placeholder="dad of three in Detroit  ·  civil engineer, 30 yrs"
              maxLength={FIRSTHAND_CONTEXT_LIMIT}
              autoFocus
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--font-serif), Georgia, serif',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'var(--p-ink, #0a0a0a)',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                padding: '2px 0',
                letterSpacing: '0.01em',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                fontSize: 10,
                color:
                  firsthandContext.length > FIRSTHAND_CONTEXT_LIMIT - 12
                    ? '#a14b1a'
                    : '#777777',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {FIRSTHAND_CONTEXT_LIMIT - firsthandContext.length}
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setFirsthand(true);
              if (!firsthandContext.trim() && profileBackgroundOneline.trim()) {
                setFirsthandContext(profileBackgroundOneline.trim().slice(0, FIRSTHAND_CONTEXT_LIMIT));
              }
            }}
            aria-pressed={false}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: 'transparent',
              border: 'none',
              padding: '4px 6px',
              cursor: 'pointer',
              fontFamily: 'var(--font-serif), Georgia, serif',
              fontStyle: 'italic',
              fontSize: 12.5,
              letterSpacing: '0.01em',
              color: 'var(--p-ink-muted, #52525b)',
              opacity: 0.78,
              transition: 'color 140ms ease, opacity 140ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.78'; }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                border: '1.5px solid currentColor',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: 'transparent',
              }}
            />
            I know this firsthand
          </button>
        )}
        <span
          aria-live="polite"
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: 10.5,
            letterSpacing: '0.08em',
            color: bodyText.length > COMMENT_BODY_MAX - 200 ? '#a14b1a' : '#777777',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {bodyText.length} / {COMMENT_BODY_MAX}
        </span>
        {onCancel && <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>}
        <button
          onClick={submit}
          disabled={isEmpty || busy}
          onMouseEnter={(e) => {
            if (!isEmpty && !busy) e.currentTarget.style.background = '#e33010';
          }}
          onMouseLeave={(e) => {
            if (!isEmpty && !busy) e.currentTarget.style.background = '#111111';
          }}
          style={{
            ...postBtnStyle,
            background: !isEmpty && !busy ? '#111111' : 'transparent',
            color: !isEmpty && !busy ? '#fcfcfc' : '#a1a1aa',
            border: !isEmpty && !busy ? '1px solid #111111' : '1px solid #dcdcdc',
            cursor: !isEmpty && !busy ? 'pointer' : 'default',
          }}
        >
          {busy ? 'Sending…' : isReply ? 'Send reply' : 'Post'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const containerStyle: CSSProperties = {
  // Top-level composer keeps a soft hairline border but inherits the
  // sharp-corner institutional treatment of the reply panel — no
  // box-shadow, no rounded corners.
  border: '1px solid #dcdcdc',
  borderRadius: 0,
  padding: '16px 18px',
  background: '#fcfcfc',
  marginBottom: 16,
};
const replyContainerStyle: CSSProperties = {
  // Reply panel — heavier 1.5px ink border, white fill, sharp corners.
  // Reads as a deliberate institutional surface inside the tinted reply
  // block, not a floating dialog. Matches the mockup's "what kind of
  // reply?" picker container.
  border: '1.5px solid #111111',
  borderRadius: 0,
  padding: '16px 18px',
  background: '#ffffff',
  marginBottom: 12,
  marginTop: 18,
};
const editorStyle: CSSProperties = {
  // 14/1.6 -> 15/1.7. Closer to the comment body's 16/1.7 — what you
  // type matches what you'll see published. Antialiased + kern/liga
  // for crisp serif rendering of inline emphasis.
  width: '100%',
  minHeight: 72,
  background: 'transparent',
  color: 'var(--text-primary, #111)',
  fontSize: 15,
  lineHeight: 1.7,
  padding: '4px 0',
  outline: 'none',
  fontFamily: 'inherit',
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'optimizeLegibility',
  fontFeatureSettings: '"kern" 1, "liga" 1',
};
const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  rowGap: 8,
  flexWrap: 'wrap',
  marginTop: 10,
  paddingTop: 10,
  borderTop: '1px solid #dcdcdc',
};
const cancelBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '4px 6px',
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#777777',
  cursor: 'pointer',
};
const postBtnStyle: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  padding: '9px 16px',
  borderRadius: 0,
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  transition: 'background 120ms',
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
const muteBannerStyle: CSSProperties = {
  border: '1px solid var(--danger-border)',
  borderRadius: 12,
  padding: '12px 16px',
  background: 'var(--danger-bg)',
  marginBottom: 16,
  fontSize: 14,
  color: '#991b1b',
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
