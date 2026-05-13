'use client';
import React, { useState, useEffect, useRef, ReactNode } from 'react';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import CommentComposer from './CommentComposer';
import { hasPermission } from '@/lib/permissions';
import { timeAgo } from '@/lib/dates';
import type { Database } from '@/types/database';

type CommentRowDb = Database['public']['Tables']['comments']['Row'];

// EXPERT_THREADS Wave 4b — chain row drives asker affordances + grant.
type ExpertThreadChain = {
  thread_root_id: string;
  asker_user_id: string;
  expert_user_id: string;
  asker_reply_count: number;
  free_pass_granted_at: string | null;
};

// Spec-mandated cap default (D14 / plan_features); tunable per-plan but
// for the asker affordance the constant fits all current plans (2/chain).
const ASKER_REPLIES_PER_CHAIN_CAP = 2;

type CloseResult =
  | { ok: true }
  | { ok: false; reason: 'wait_for_cooldown'; seconds_remaining: number }
  | { ok: false; reason: 'unknown' };

type CommentUser = {
  id?: string;
  username?: string;
  avatar_url?: string | null;
  avatar_color?: string | null;
  is_verified_public_figure?: boolean;
  is_expert?: boolean;
  expert_title?: string | null;
};

type Mention = { user_id?: string; username: string };

export type TagKind = 'i_agree' | 'helpful';

export type Intent = 'question' | 'add_context' | 'different_take';

// DB column comments.intent is plain text; narrow it to the 3-value Intent
// union at the boundary. Any unknown string collapses to null so the
// EnrichedComment shape stays honest about what UIs can handle.
export const isIntent = (v: string | null | undefined): v is Intent =>
  v === 'question' || v === 'add_context' || v === 'different_take';

const TAG_META: Record<TagKind, { label: string }> = {
  i_agree: { label: 'I agree' },
  helpful: { label: 'Helpful' },
};

// Unified intent metadata — same labels + colors on top-level and replies.
// Colors are pulled from the new editorial intent palette:
//   add_context    → deep green   (#3d6b4f)  bg rgba(61,107,79,0.05)
//   different_take → rust amber   (#a14b1a)  bg rgba(161,75,26,0.05)
//   question       → slate blue   (#4a6e8a)  bg rgba(74,110,138,0.05)
// `tagLabel` is the threaded-reply tag header; `label` is the meta-line
// intent chip. Text labels only (owner rule: no glyphs in chrome). `bg` is
// the tinted container background applied to threaded (depth > 0) reply
// blocks.
const INTENT_META: Record<
  Intent,
  { label: string; tagLabel: string; color: string; bg: string }
> = {
  question:       { label: 'Question',       tagLabel: 'Question',         color: '#4a6e8a', bg: 'rgba(74,110,138,0.05)' },
  add_context:    { label: 'Adding to this', tagLabel: 'Adding to this',   color: '#3d6b4f', bg: 'rgba(61,107,79,0.05)' },
  different_take: { label: 'Different take', tagLabel: 'A different take', color: '#a14b1a', bg: 'rgba(161,75,26,0.05)' },
};

export type EnrichedComment = CommentRowDb & {
  users?: CommentUser;
  _your_tags?: Set<TagKind>;
  helpful_count?: number | null;
  i_agree_count?: number | null;
  intent?: Intent | null;
  is_expert_thread_root?: boolean | null;
  expert_thread_root_id?: string | null;
  expert_thread_closed_at?: string | null;
  last_reopen_at?: string | null;
};

interface CommentRowProps {
  comment: EnrichedComment;
  replies?: ReactNode[];
  currentUserId?: string | null;
  currentUserVerified?: boolean;
  authorCategoryScore?: number | null;
  authorOverallScore?: number | null;
  canViewScore?: boolean;
  articleId: string;
  viewerIsSupervisor?: boolean;
  helpfulThreshold?: number;
  tagKinds?: TagKind[];
  // EXPERT_THREADS Wave 4b — drives author-attribute-driven expert chrome
  // + chain-cap affordances + close/reopen/grant buttons.
  articleCategoryId?: string | null;
  verifiedCategoriesByUser?: Record<string, Set<string>>;
  chainsByRoot?: Record<string, Record<string, ExpertThreadChain>>;
  rootAuthorByRoot?: Record<string, string>;
  inertVisualGiveaway?: boolean;
  onCloseThread?: (rootId: string) => Promise<CloseResult>;
  onReopenThread?: (rootId: string) => Promise<boolean>;
  onGrantFollowup?: (rootId: string, askerUserId: string) => Promise<boolean>;
  onToggleTag: (commentId: string, tagKind: TagKind) => void | Promise<void>;
  onDelete: (commentId: string) => void;
  onEdit: (commentId: string, body: string) => void | Promise<void>;
  onReport: (commentId: string) => void;
  onBlock: (userId: string) => void;
  onFlag?: (commentId: string) => void;
  onHide?: (commentId: string) => void;
  onReplied?: (comment: CommentRowDb | null) => void;
  depth?: number;
  quizPassed?: boolean;
}

const DEFAULT_TAG_KINDS: TagKind[] = ['i_agree', 'helpful'];

// EXPERT_THREADS Wave 4b — render expert tokens (`@expert` / `@expert_<u>`)
// distinctly from bare mentions. Mentions array carries *resolved bare*
// usernames only (the post path doesn't add expert authors there); inert
// expert tokens (paused / quiet hours / at-quota) render normally by
// default, and grayed/struck only when the visual_giveaway flag is on.
//
// We can't reliably tell from the client whether a given `@expert_<u>`
// landed inert vs. live for THIS comment — the at-quota / paused status
// at post time isn't persisted on the row. So when visual_giveaway is
// false, we render every expert token in the same style as a resolved
// bare mention (accent color, 600 weight). When true, we render expert
// tokens dimmed regardless — the spec accepts that as a coarse signal,
// not a per-token live/inert distinction.
const EXPERT_TOKEN_RENDER_RE =
  /(?<![a-zA-Z0-9_])@expert(?:_([a-zA-Z0-9_]{2,30}))?(?![a-zA-Z0-9_])/g;
const ANY_MENTION_RENDER_RE =
  /(?<![a-zA-Z0-9_])(@expert(?:_[a-zA-Z0-9_]{2,30})?(?![a-zA-Z0-9_])|@[a-zA-Z0-9_]{2,30})/g;

// Detect HTML-formatted bodies (from the WYSIWYG composer).
function isHtmlBody(body: string): boolean {
  return /<(strong|em|del|code)\b/i.test(body);
}

// Strip any tag that isn't one of our safe elements (no attributes allowed).
function sanitizeDisplayHtml(html: string): string {
  return html.replace(/<[^>]*>/g, (tag) => {
    const t = tag.toLowerCase().replace(/\s+/g, '').trim();
    if (/^<(strong|em|del|code|blockquote)>$/.test(t)) return tag;
    if (/^<\/(strong|em|del|code|blockquote)>$/.test(t)) return tag;
    if (t === '<br>' || t === '<br/>') return '<br>';
    return '';
  });
}

// Inline markdown — *bold*, _italic_, ~strike~, `code`.
// Intentionally conservative: no nesting, max 500 chars per span, no newlines inside.
const FORMAT_RE = /(\*([^*\n]{1,500})\*|_([^_\n]{1,500})_|~([^~\n]{1,500})~|`([^`\n]{1,500})`)/g;
function applyFormatting(text: string, baseKey: string | number): ReactNode[] {
  FORMAT_RE.lastIndex = 0;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = FORMAT_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${baseKey}-f${m.index}`;
    if (m[2] !== undefined)      out.push(<strong key={k} style={{ fontWeight: 700 }}>{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<em key={k} style={{ fontStyle: 'italic', fontWeight: 'inherit' }}>{m[3]}</em>);
    else if (m[4] !== undefined) out.push(<span key={k} style={{ textDecoration: 'line-through' }}>{m[4]}</span>);
    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 1px 5px tunes the inline-code chip; off-grid by design
    else if (m[5] !== undefined) out.push(<code key={k} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.88em', background: 'rgba(0,0,0,0.06)', borderRadius: 3, padding: '1px 5px' }}>{m[5]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderBody(
  body: string,
  mentions: Mention[] = [],
  inertVisualGiveaway = false
): ReactNode[] {
  const resolved = new Set((mentions || []).map((m) => m.username));
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(ANY_MENTION_RENDER_RE)) {
    const [full] = match;
    const idx = match.index ?? 0;
    if (idx > lastIndex) parts.push(...applyFormatting(body.slice(lastIndex, idx), lastIndex));

    // Expert token branch.
    EXPERT_TOKEN_RENDER_RE.lastIndex = 0;
    const expertMatch = EXPERT_TOKEN_RENDER_RE.exec(full);
    if (expertMatch) {
      const directedName = expertMatch[1];
      // Visual_giveaway off (default): render in the same accent style
      // as a resolved bare mention. Visual_giveaway on: dim + strike,
      // signaling that the token is potentially inert.
      const expertStyle: React.CSSProperties = inertVisualGiveaway
        ? {
            color: 'var(--p-ink-faint)',
            fontWeight: 600,
            textDecoration: 'line-through',
          }
        : { color: 'var(--success-text)', fontWeight: 700 };
      const label = directedName ? `@expert_${directedName}` : '@expert';
      parts.push(
        <span key={idx} style={expertStyle} title={
          inertVisualGiveaway
            ? 'Expert mention may be inert (paused / quiet hours / at-quota).'
            : undefined
        }>
          {label}
        </span>
      );
      lastIndex = idx + full.length;
      continue;
    }

    // Bare mention branch (existing behavior).
    const bareMatch = full.match(/^@([a-zA-Z0-9_]{2,30})$/);
    const name = bareMatch?.[1] ?? '';
    if (name && resolved.has(name)) {
      parts.push(
        <a
          key={idx}
          href={`/card/${name}`}
          style={{ color: 'var(--p-ink)', fontWeight: 600, textDecoration: 'none' }}
        >
          @{name}
        </a>
      );
    } else {
      parts.push(full);
    }
    lastIndex = idx + full.length;
  }
  if (lastIndex < body.length) parts.push(...applyFormatting(body.slice(lastIndex), lastIndex));
  return parts;
}

export default function CommentRow({
  comment,
  replies = [],
  currentUserId,
  currentUserVerified = true,
  authorCategoryScore,
  authorOverallScore,
  canViewScore = false,
  articleId,
  viewerIsSupervisor = false,
  helpfulThreshold = 10,
  tagKinds = DEFAULT_TAG_KINDS,
  articleCategoryId,
  verifiedCategoriesByUser,
  chainsByRoot,
  rootAuthorByRoot,
  inertVisualGiveaway = false,
  onCloseThread,
  onReopenThread,
  onGrantFollowup,
  onToggleTag,
  onDelete,
  onEdit,
  onReport,
  onBlock,
  onFlag,
  onHide,
  onReplied,
  depth = 0,
  quizPassed = true,
}: CommentRowProps) {
  const [replyOpen, setReplyOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [editBody, setEditBody] = useState<string>(comment.body || '');
  // Owner cleanup item 7 (2026-05-08) — TODO-48 follow-ups retired in
  // favour of real comment edit (PATCH /api/comments/[id]) with lock-on-
  // reply + 60s typo grace + append-only after the grace. The
  // comment_followups table stays dormant; UI + API route deleted.
  // Firsthand self-tag — author self-attests at compose time, persisted as
  // `comments.real_world_experience` (≤80 chars). Presence of the string
  // IS the firsthand claim; an empty/NULL value means no claim.
  const firsthandContext = (comment.real_world_experience || '').trim();
  const firsthand = firsthandContext.length > 0;
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
  const [quoteReplyText, setQuoteReplyText] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [repliesOpen, setRepliesOpen] = useState<boolean>(false);
  const bodyRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [commentMaxDepth, setCommentMaxDepth] = useState<number>(2);
  // EXPERT_THREADS Wave 4b — close-thread cooldown countdown. Set when
  // the close RPC returns 429 wait_for_cooldown; ticks down to 0 then
  // re-enables the button. Cleared on successful close.
  const [closeCooldown, setCloseCooldown] = useState<number>(0);
  useEffect(() => {
    if (closeCooldown <= 0) return;
    const t = setTimeout(() => setCloseCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [closeCooldown]);
  const canReply = hasPermission('comments.reply');
  const canReport = hasPermission('comments.report');
  const canTag = hasPermission('comments.tag');
  const canEditOwn = hasPermission('comments.edit.own');
  // Owner cleanup item 7 (2026-05-08) — gate the self-edit menu item on
  // the same window + lock-on-reply rules the server enforces, so the
  // affordance disappears when the user can no longer succeed. Server
  // remains the final arbiter; this just spares the user a 403.
  const editWindowMs = 15 * 60 * 1000;
  const createdAtMs = comment.created_at ? new Date(comment.created_at).getTime() : 0;
  const editWindowOpen = Number.isFinite(createdAtMs)
    ? Date.now() - createdAtMs <= editWindowMs
    : false;
  const editLockedByReply = (comment.reply_count ?? 0) > 0;
  const canEditOwnNow = canEditOwn && editWindowOpen && !editLockedByReply;
  const canDeleteOwn = hasPermission('comments.delete.own');
  const canEditAny = hasPermission('admin.comments.edit.any');
  const canDeleteAny = hasPermission('admin.comments.delete.any');
  const canHideAny = hasPermission('admin.comments.hide');
  const canBlockUser = hasPermission('comments.block.add');
  const canReadExpert = hasPermission('article.expert_responses.read');
  // EXPERT_THREADS Wave 4b — moderate gates the reopen button on closed
  // expert threads (spec §5 enforcement table).
  const canModerate = hasPermission('comments.moderate');
  // Asker can close threads they originated (and we're the originator).
  const canCloseOwnThread = hasPermission('comments.thread.close.own');
  // Expert grants asker another reply on their own chain (spec §2 +
  // permission key list).
  const canAllowFollowup = hasPermission('comments.expert_thread.allow_followup');

  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.comment_max_depth === 'number') {
          setCommentMaxDepth(data.comment_max_depth);
        }
      })
      .catch(() => {
        // Keep default (2) on network error.
      });
  }, []);

  const isOwner = !!currentUserId && comment.user_id === currentUserId;
  const isDeleted = comment.status === 'deleted' || !!comment.deleted_at;
  const user: CommentUser = comment.users || {};
  const blurred = !!comment.is_expert_reply && !canReadExpert;

  // EXPERT_THREADS Wave 4b — distinctive expert chrome attaches to
  // author.is_expert AND article.category ∈ author.verified_categories
  // (spec §2 — NOT thread-mode-driven). The legacy `comment.is_expert_reply`
  // boolean (set by the expert-queue answer path) still triggers chrome
  // for backward compatibility.
  //
  // Launch-phase hide: the chrome (Verified Expert label + green container
  // tint) and the inline VerifiedBadge are gated to false post-launch.
  // Underlying data, state, and computation stay alive — flip the flag back
  // to true to restore. Per locked decision: hide via gates, do not delete.
  const SHOW_EXPERT_CHROME_ON_COMMENTS = false;
  const authorIsInCategoryExpert = (() => {
    if (!user.is_expert) return false;
    if (!articleCategoryId) return false;
    const set = (verifiedCategoriesByUser || {})[comment.user_id];
    return !!set && set.has(articleCategoryId);
  })();
  const _expertChromeWouldShow = !!comment.is_expert_reply || authorIsInCategoryExpert;
  const showExpertChrome = SHOW_EXPERT_CHROME_ON_COMMENTS && _expertChromeWouldShow;
  const expertCategoryName: string | null = null; // Category name not threaded down; chip uses generic "Verified Expert".

  // Thread-mode plumbing.
  const isExpertThreadRoot = !!comment.is_expert_thread_root;
  const isExpertThreadClosed = !!comment.expert_thread_closed_at;
  const threadRootId =
    isExpertThreadRoot ? comment.id : (comment.expert_thread_root_id || null);
  const rootAuthorId = threadRootId
    ? (rootAuthorByRoot || {})[threadRootId] || null
    : null;
  const viewerIsThreadOriginator =
    isExpertThreadRoot && !!currentUserId && comment.user_id === currentUserId;

  const hasMenuItems = isOwner
    ? (canEditOwnNow || canDeleteOwn)
    : (canEditAny || canDeleteAny || canReport || canBlockUser || (viewerIsSupervisor && !!onFlag) || (canHideAny && !!onHide));

  async function doTag(kind: TagKind) {
    if (busy) return;
    setBusy(`tag:${kind}`);
    try {
      await onToggleTag(comment.id, kind);
    } finally {
      setBusy('');
    }
  }
  async function doSaveEdit() {
    if (!editBody.trim() || busy) return;
    setBusy('edit');
    try {
      await onEdit(comment.id, editBody.trim());
      setEditing(false);
    } finally {
      setBusy('');
    }
  }
  function handleBodyMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyRef.current) { setSelectedQuote(''); return; }
    if (!bodyRef.current.contains(sel.anchorNode)) { setSelectedQuote(''); return; }
    setSelectedQuote(sel.toString().trim());
  }

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    }).catch(() => {});
  }

  const mentions = (Array.isArray(comment.mentions) ? comment.mentions : []) as Mention[];
  const commentDepth = comment.thread_depth ?? depth;
  const yours = comment._your_tags ?? new Set<TagKind>();
  function tagCount(k: TagKind): number {
    if (k === 'i_agree') return comment.i_agree_count ?? 0;
    return comment.helpful_count ?? 0;
  }

  // Threaded reply container treatment — only depth > 0 gets the tinted
  // background + intent-colored left border. Top-level comments stay
  // visually neutral; their intent (if any) renders as a small chip near
  // the meta line instead.
  const intentMeta = comment.intent ? INTENT_META[comment.intent] : null;
  const isThreadedReply = depth > 0 && !showExpertChrome;
  const replyTintBg = isThreadedReply
    ? (intentMeta ? intentMeta.bg : 'var(--accent-bg)')
    : undefined;
  const replyTintBorder = isThreadedReply
    ? (intentMeta ? intentMeta.color : 'var(--border)')
    : undefined;
  // Tag header for threaded replies. Plain reply (no intent) uses the
  // institutional "Reply" label in the muted ink; intent replies use
  // the intent's tag label + color. Top-level comments keep the small
  // meta-line chip and don't render this header.
  const replyTagText = intentMeta ? intentMeta.tagLabel : 'Reply';
  const replyTagColor = intentMeta ? intentMeta.color : 'var(--muted-foreground)';

  return (
    <div
      id={`comment-${comment.id}`}
      style={{
        ...(depth === 0 && !showExpertChrome ? {
          paddingTop: 28, // magic — intentional (between --s6 24 and --s7 32)
          paddingBottom: 'var(--s6)',
          borderBottom: '1px solid var(--border, #e5e5e5)',
        } : {}),
        ...(isThreadedReply ? {
          // eslint-disable-next-line no-restricted-syntax -- 14px is intentional off-grid for the threaded-reply container
          padding: '14px 16px',
          background: replyTintBg,
          borderLeft: `3px solid ${replyTintBorder}`,
          marginTop: 'var(--s1)',
          marginBottom: 'var(--s1)',
        } : {}),
        ...(showExpertChrome ? {
          background: '#f0faf4',
          borderLeft: '3px solid var(--success-text)',
          // eslint-disable-next-line no-restricted-syntax -- 8px is intentional off-grid radius
          borderRadius: '0 8px 8px 0',
          // eslint-disable-next-line no-restricted-syntax -- 14px is intentional off-grid for the expert-chrome container
          padding: '14px 16px',
          marginTop: 'var(--s1)',
          marginBottom: 'var(--s1)',
        } : {}),
      }}
    >
      {isThreadedReply && (
        <div
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: replyTagColor,
            marginBottom: 8,
          }}
        >
          {replyTagText}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <AvatarWithScoreCard
          user={user}
          canViewScore={canViewScore}
          subcategoryScore={authorCategoryScore ?? null}
          overallScore={authorOverallScore ?? null}
        />

        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          {showExpertChrome && (
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--success-text)',
              marginBottom: 4,
            }}>
              {comment.is_expert_reply
                ? `Expert Reply${user.expert_title ? ` · ${user.expert_title}` : ''}`
                : `Verified Expert${expertCategoryName ? ` · ${expertCategoryName}` : (user.expert_title ? ` · ${user.expert_title}` : '')}`}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-ink)', letterSpacing: '-0.005em' }}>
                  {user.username || 'user'}
                </span>
                {SHOW_EXPERT_CHROME_ON_COMMENTS && <VerifiedBadge user={user} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <button
                  onClick={copyLink}
                  title="Copy link to comment"
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                    fontSize: 10, lineHeight: 1, letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: copiedLink ? 'var(--success-text)' : 'var(--muted-foreground)',
                    transition: 'color 100ms',
                  }}
                >
                  {copiedLink ? 'Copied!' : `${timeAgo(comment.created_at)}${comment.is_edited ? ' · edited' : ''}`}
                </button>
                {/* Top-level intent chip — replies render their intent as a
                    tag header above the meta line instead, so this only
                    fires on depth === 0 to avoid duplication. */}
                {depth === 0 && intentMeta && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: intentMeta.color,
                    }}
                  >
                    {intentMeta.tagLabel}
                  </span>
                )}
              </div>
            </div>
            {/* context menu — header row */}
            {!isDeleted && !editing && hasMenuItems && (
              <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: menuOpen ? 'var(--p-ink)' : 'var(--p-ink-faint)',
                    cursor: 'pointer',
                    fontSize: 15,
                    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 2x6 tunes the kebab-menu hit-target
                    padding: '2px 6px',
                    lineHeight: 1,
                    letterSpacing: '0.06em',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  &#x22ef;
                </button>
                {menuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      zIndex: 10,
                      background: 'var(--bg)',
                      border: '1px solid var(--p-border)',
                      borderRadius: 8,
                      boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
                      minWidth: 140,
                      padding: 4,
                    }}
                  >
                    {isOwner ? (
                      <>
                        {canEditOwnNow && (
                          <MenuItem onClick={() => { setMenuOpen(false); setEditing(true); }}>
                            Edit
                          </MenuItem>
                        )}
                        {canDeleteOwn && (
                          <MenuItem danger onClick={() => { setMenuOpen(false); onDelete(comment.id); }}>
                            Delete
                          </MenuItem>
                        )}
                      </>
                    ) : (
                      <>
                        {canEditAny && (
                          <MenuItem onClick={() => { setMenuOpen(false); setEditing(true); }}>
                            Edit
                          </MenuItem>
                        )}
                        {canDeleteAny && (
                          <MenuItem danger onClick={() => { setMenuOpen(false); onDelete(comment.id); }}>
                            Delete
                          </MenuItem>
                        )}
                        {canReport && currentUserVerified && (
                          <MenuItem onClick={() => { setMenuOpen(false); onReport(comment.id); }}>
                            Report
                          </MenuItem>
                        )}
                        {canBlockUser && (
                          <MenuItem onClick={() => { setMenuOpen(false); onBlock(comment.user_id); }}>
                            Block user
                          </MenuItem>
                        )}
                        {viewerIsSupervisor && onFlag && (
                          <MenuItem onClick={() => { setMenuOpen(false); onFlag!(comment.id); }}>
                            Supervisor flag
                          </MenuItem>
                        )}
                        {canHideAny && onHide && (
                          <MenuItem danger onClick={() => { setMenuOpen(false); onHide!(comment.id); }}>
                            Hide (mod)
                          </MenuItem>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {editing ? (
            <div style={{
              borderLeft: '3px solid var(--p-ink)',
              borderRadius: '0 var(--r-md) var(--r-md) 0',
              border: '1px solid var(--p-border)',
              // eslint-disable-next-line no-restricted-syntax -- 10px is intentional off-grid (between --s2 8 and --s3 12)
              padding: '10px 12px',
              background: 'var(--card, #f7f7f7)',
              marginBottom: 2,
            }}>
              <textarea
                value={editBody}
                autoFocus
                onChange={(e) => setEditBody(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--p-ink)',
                  outline: 'none',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  // eslint-disable-next-line no-restricted-syntax -- magic, intentional: tight 2px inset for the inline edit textarea
                  padding: '2px 0',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--p-border)' }}>
                <button
                  onClick={doSaveEdit}
                  disabled={busy === 'edit' || !editBody.trim()}
                  style={{
                    fontSize: 13,
                    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 7px vertical matches the editor's compact toolbar
                    padding: '7px 16px',
                    borderRadius: 9,
                    border: 'none',
                    background: editBody.trim() && busy !== 'edit' ? 'var(--p-ink)' : 'var(--muted)',
                    color: 'var(--p-bg)',
                    fontWeight: 700,
                    cursor: busy === 'edit' || !editBody.trim() ? 'default' : 'pointer',
                  }}
                >
                  {busy === 'edit' ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditBody(comment.body || '');
                  }}
                  style={{
                    fontSize: 13,
                    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 7x14 sits a hair tighter than Save for visual rhythm
                    padding: '7px 14px',
                    borderRadius: 9,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--p-ink-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : isDeleted ? (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.65,
                color: 'var(--p-ink-muted)',
                fontStyle: 'italic',
              }}
            >
              [deleted]
            </div>
          ) : (
            <div
              style={{
                fontSize: 16,
                lineHeight: 1.7,
                color: 'var(--p-ink)',
                letterSpacing: '-0.005em',
                marginBottom: 2,
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                textRendering: 'optimizeLegibility',
                fontFeatureSettings: '"kern" 1, "liga" 1',
                filter: blurred ? 'blur(6px)' : 'none',
                userSelect: blurred ? 'none' : 'auto',
                pointerEvents: blurred ? 'none' : 'auto',
              }}
            >
              {isHtmlBody(comment.body || '') ? (
                <span
                  ref={bodyRef as React.Ref<HTMLSpanElement>}
                  className="vp-comment-html"
                  onMouseUp={handleBodyMouseUp}
                  dangerouslySetInnerHTML={{ __html: sanitizeDisplayHtml(comment.body || '') }}
                />
              ) : (
                <span ref={bodyRef as React.Ref<HTMLSpanElement>} onMouseUp={handleBodyMouseUp}>
                  {renderBody(comment.body || '', mentions, inertVisualGiveaway)}
                </span>
              )}
            </div>
          )}
          {blurred && (
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--p-ink-muted)' }}>
              Expert response &mdash;{' '}
              <a
                href="/profile/settings#billing"
                style={{ color: 'var(--p-ink)', fontWeight: 600 }}
              >
                available on paid plans
              </a>
            </div>
          )}

          {/* Firsthand self-tag — author-applied note rendered below the
              body. Unverifiable on purpose; honest framing per TODO-50
              non-tier-coloring rules. Optional context line follows. */}
          {!isDeleted && firsthand && (
            <div
              style={{
                marginTop: 8,
                fontFamily: 'var(--font-serif), Georgia, serif',
                fontStyle: 'italic',
                fontSize: 13,
                lineHeight: 1.45,
                color: 'var(--p-ink-muted, #52525b)',
                letterSpacing: '0.01em',
                animation: 'vpFadeIn 220ms ease-out',
              }}
            >
              — I know this firsthand
              {firsthandContext && (
                <>
                  {' '}
                  <span style={{ color: 'var(--p-ink-faint, #a1a1aa)' }}>·</span>{' '}
                  <span style={{ color: 'var(--p-ink, #0a0a0a)', fontStyle: 'italic' }}>
                    {firsthandContext}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Action row: Reply */}
          {!isDeleted && !editing && (() => {
            // EXPERT_THREADS Wave 4b — chain lookup for cap affordances.
            // Asker-side view: viewer is the root author and target is an
            // in-category expert reply. The chain row tracks asker reply
            // count + free_pass; both cap the asker's reply button.
            const chainsForRoot = threadRootId ? (chainsByRoot || {})[threadRootId] : undefined;
            const isExpertReplyByAuthor =
              !!user.is_expert &&
              !!articleCategoryId &&
              !!(verifiedCategoriesByUser || {})[comment.user_id]?.has(articleCategoryId);
            const viewerIsAsker =
              !!currentUserId &&
              !!rootAuthorId &&
              currentUserId === rootAuthorId;
            // Chain seen by the asker when replying to an expert.
            const askerChain =
              viewerIsAsker && isExpertReplyByAuthor && chainsForRoot
                ? chainsForRoot[`${currentUserId}:${comment.user_id}`]
                : undefined;
            const askerCapHit =
              !!askerChain &&
              !askerChain.free_pass_granted_at &&
              askerChain.asker_reply_count >= ASKER_REPLIES_PER_CHAIN_CAP;
            const askerRepliesLeft =
              askerChain &&
              !askerChain.free_pass_granted_at &&
              askerChain.asker_reply_count < ASKER_REPLIES_PER_CHAIN_CAP
                ? ASKER_REPLIES_PER_CHAIN_CAP - askerChain.asker_reply_count
                : null;
            // Chain seen by an expert on their own reply: viewer === comment
            // author, asker is rootAuthor. Used to show "Allow another reply"
            // when the asker has actually replied to this expert at least once.
            const expertChainOnOwnReply =
              isOwner &&
              isExpertReplyByAuthor &&
              !!rootAuthorId &&
              chainsForRoot
                ? chainsForRoot[`${rootAuthorId}:${currentUserId}`]
                : undefined;
            const showAllowFollowup =
              !!expertChainOnOwnReply &&
              expertChainOnOwnReply.asker_reply_count > 0 &&
              !expertChainOnOwnReply.free_pass_granted_at &&
              canAllowFollowup &&
              !!onGrantFollowup &&
              !!threadRootId &&
              !!rootAuthorId &&
              !isExpertThreadClosed;
            // Close + reopen permissions live on the root row only.
            const showClose =
              isExpertThreadRoot &&
              !isExpertThreadClosed &&
              viewerIsThreadOriginator &&
              canCloseOwnThread &&
              !!onCloseThread;
            const showReopen =
              isExpertThreadRoot &&
              isExpertThreadClosed &&
              canModerate &&
              !!onReopenThread;
            const replyDisabled =
              isExpertThreadClosed || askerCapHit || quizPassed === false;
            const replyTitle = isExpertThreadClosed
              ? 'This thread is closed.'
              : askerCapHit
                ? `Conversation complete with @${user.username || 'expert'} — they can grant another reply if you have a follow-up.`
                : undefined;
            // Smaller action buttons on threaded replies to keep the
            // nested block visually lighter (mockup spec — 6px 12px / 12px
            // font on replies vs 9px 16px / 13px on top-level).
            const actionPad = isThreadedReply ? '6px 12px' : '9px 16px';
            const actionFontSize = isThreadedReply ? 12 : 13;
            // Sharp-cornered institutional pill used by I agree / Helpful /
            // Reply (and the legacy Quote reply / thread toggle entries). On
            // state inverts to ink fill, white label, count at 0.85 opacity.
            function actionPillStyle(opts: {
              on: boolean;
              disabled?: boolean;
            }): React.CSSProperties {
              const { on, disabled } = opts;
              return {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'inherit',
                fontSize: actionFontSize,
                fontWeight: 500,
                lineHeight: 1.2,
                padding: actionPad,
                border: `1px solid ${on ? 'var(--text)' : 'var(--border)'}`,
                borderRadius: 0,
                background: on ? 'var(--text)' : 'transparent',
                color: disabled
                  ? 'var(--muted)'
                  : on
                    ? 'var(--bg)'
                    : 'var(--text-secondary)',
                cursor: disabled ? 'default' : 'pointer',
                letterSpacing: '0',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                transition: 'color 120ms, background 120ms, border-color 120ms',
              };
            }
            // Tally line — render above the action row. Mono small caps,
            // ink-3 separators, ink-1 bold for the numbers. Skip any count
            // that is 0; if all counts are 0 the whole line collapses.
            const iAgreeCount = comment.i_agree_count ?? 0;
            const helpfulCount = comment.helpful_count ?? 0;
            const replyCount = comment.reply_count ?? 0;
            type TallySeg = { label: string; n: number };
            const tallySegments: TallySeg[] = [];
            if (iAgreeCount > 0) tallySegments.push({ label: 'Agreed by', n: iAgreeCount });
            if (helpfulCount > 0) tallySegments.push({ label: 'Helpful', n: helpfulCount });
            if (replyCount > 0) tallySegments.push({ label: replyCount === 1 ? 'reply' : 'replies', n: replyCount });
            const showTally = tallySegments.length > 0;
            // Unified intent model: composer owns the intent picker. The
            // action row just shows the Reply toggle.
            const replyButtons =
              canReply && commentDepth < commentMaxDepth ? (
                <button
                  onClick={() => {
                    if (replyDisabled) return;
                    setReplyOpen((v) => !v);
                  }}
                  disabled={replyDisabled}
                  title={replyTitle}
                  style={actionPillStyle({ on: replyOpen, disabled: replyDisabled })}
                >
                  <span>Reply</span>
                </button>
              ) : null;
            return (
              <>
                {showTally && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginTop: 12,
                      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                      fontSize: 9.5,
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--muted-foreground)',
                    }}
                    aria-label="Comment tally"
                  >
                    {tallySegments.map((seg, i) => (
                      <span key={seg.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {i > 0 && (
                          <span aria-hidden="true" style={{ color: 'var(--border)' }}>·</span>
                        )}
                        {/* "Agreed by 24" / "Helpful 19" — label first. For
                            replies we render "4 replies" with the count first. */}
                        {seg.label === 'Agreed by' || seg.label === 'Helpful' ? (
                          <>
                            <span>{seg.label}</span>
                            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{seg.n}</span>
                          </>
                        ) : (
                          <>
                            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{seg.n}</span>
                            <span>{seg.label}</span>
                          </>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: showTally ? 8 : 14, flexWrap: 'wrap' }}>
                  {/* Quote reply — appears when reader has selected text in this comment's body */}
                  {selectedQuote && canReply && !replyOpen && (
                    <button
                      onClick={() => {
                        setQuoteReplyText(selectedQuote);
                        setSelectedQuote('');
                        window.getSelection()?.removeAllRanges();
                        setReplyOpen(true);
                      }}
                      style={actionPillStyle({ on: false })}
                    >
                      <span>Quote reply</span>
                    </button>
                  )}
                  {!isOwner && canTag && quizPassed !== false && tagKinds.map((k) => {
                    const meta = TAG_META[k];
                    const active = yours.has(k);
                    const count = tagCount(k);
                    return (
                      <button
                        key={k}
                        onClick={() => doTag(k)}
                        disabled={!!busy}
                        aria-pressed={active}
                        style={actionPillStyle({ on: active, disabled: !!busy })}
                      >
                        <span>{meta.label}</span>
                        {count > 0 && (
                          <span
                            style={{
                              fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                              fontSize: actionFontSize - 2,
                              opacity: active ? 0.85 : 0.6,
                              marginLeft: 2,
                            }}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {replyButtons}
                  {askerRepliesLeft != null && askerRepliesLeft > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--p-ink-muted)',
                        marginLeft: 4,
                      }}
                      aria-label={`${askerRepliesLeft} replies left in this expert chain`}
                    >
                      {askerRepliesLeft === 1 ? '1 reply left' : `${askerRepliesLeft} replies left`}
                    </span>
                  )}
                  {showAllowFollowup && (
                    <button
                      onClick={async () => {
                        if (busy === 'grant') return;
                        setBusy('grant');
                        try {
                          await onGrantFollowup!(threadRootId!, rootAuthorId!);
                        } finally {
                          setBusy('');
                        }
                      }}
                      disabled={busy === 'grant'}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        // eslint-disable-next-line no-restricted-syntax -- magic, intentional: compact 30pt-min control padding off the 4-grid
                        padding: '4px 10px',
                        borderRadius: 'var(--r-sm)',
                        minHeight: 30,
                        border: '1px solid var(--success-text)',
                        background: 'rgba(22,163,74,0.06)',
                        color: 'var(--success-text)',
                        cursor: busy === 'grant' ? 'default' : 'pointer',
                        marginLeft: 4,
                      }}
                    >
                      {busy === 'grant' ? 'Granting…' : 'Allow another reply'}
                    </button>
                  )}
                  {showClose && (
                    <button
                      onClick={async () => {
                        if (busy === 'close' || closeCooldown > 0) return;
                        setBusy('close');
                        try {
                          const result = await onCloseThread!(comment.id);
                          if (!result.ok && result.reason === 'wait_for_cooldown') {
                            setCloseCooldown(result.seconds_remaining);
                          }
                        } finally {
                          setBusy('');
                        }
                      }}
                      disabled={busy === 'close' || closeCooldown > 0}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        // eslint-disable-next-line no-restricted-syntax -- magic, intentional: compact 30pt-min control padding off the 4-grid
                        padding: '4px 10px',
                        borderRadius: 'var(--r-sm)',
                        minHeight: 30,
                        border: '1px solid var(--p-border)',
                        background: 'transparent',
                        color: closeCooldown > 0 ? 'var(--p-ink-faint)' : 'var(--p-ink-muted)',
                        cursor: busy === 'close' || closeCooldown > 0 ? 'default' : 'pointer',
                        marginLeft: 4,
                      }}
                      title={closeCooldown > 0 ? `Try again in ${closeCooldown}s.` : undefined}
                    >
                      {closeCooldown > 0
                        ? `Close thread (${closeCooldown}s)`
                        : busy === 'close'
                          ? 'Closing…'
                          : 'Close thread'}
                    </button>
                  )}
                  {showReopen && (
                    <button
                      onClick={async () => {
                        if (busy === 'reopen') return;
                        setBusy('reopen');
                        try {
                          await onReopenThread!(comment.id);
                        } finally {
                          setBusy('');
                        }
                      }}
                      disabled={busy === 'reopen'}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        // eslint-disable-next-line no-restricted-syntax -- magic, intentional: compact 30pt-min control padding off the 4-grid
                        padding: '4px 10px',
                        borderRadius: 'var(--r-sm)',
                        minHeight: 30,
                        border: '1px solid var(--p-border)',
                        background: 'transparent',
                        color: 'var(--p-ink-muted)',
                        cursor: busy === 'reopen' ? 'default' : 'pointer',
                        marginLeft: 4,
                      }}
                    >
                      {busy === 'reopen' ? 'Reopening…' : 'Reopen (mod)'}
                    </button>
                  )}
                  {isExpertThreadRoot && isExpertThreadClosed && !showReopen && (
                    <span
                      style={{ fontSize: 11, color: 'var(--p-ink-faint)', marginLeft: 8 }}
                    >
                      Thread closed
                    </span>
                  )}
                  {askerCapHit && (
                    <span style={{ fontSize: 11, color: 'var(--p-ink-muted)', marginLeft: 8 }}>
                      Conversation complete with @{user.username || 'expert'} — they can grant another reply if you have a follow-up.
                    </span>
                  )}
                  {/* Reply thread toggle — lives in the action row, same as all other toggles */}
                  {depth === 0 && replies.length > 0 && (
                    <button
                      onClick={() => setRepliesOpen((v) => !v)}
                      style={actionPillStyle({ on: repliesOpen })}
                    >
                      <span>
                        {repliesOpen
                          ? 'Hide replies'
                          : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                      </span>
                    </button>
                  )}
                </div>
              </>
            );
          })()}

          {replyOpen && canReply && (
            <div style={{ marginTop: 10 }}>
              <CommentComposer
                articleId={articleId}
                parentId={comment.id}
                onPosted={(c) => {
                  setReplyOpen(false);
                  setQuoteReplyText('');
                  onReplied?.(c);
                }}
                onCancel={() => { setReplyOpen(false); setQuoteReplyText(''); }}
                autoFocus={!quoteReplyText}
                prefillQuote={quoteReplyText || undefined}
              />
            </div>
          )}

          {repliesOpen && replies.length > 0 && (
            <div
              style={{
                marginTop: 18,
                marginLeft: 28,
                paddingLeft: 18,
                borderLeft: '2px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              {replies.map((r, i) => (
                <React.Fragment key={i}>{r}</React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MenuItemProps {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

function MenuItem({ children, onClick, danger }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: 'var(--s2) var(--s3)',
        fontSize: 13,
        background: 'transparent',
        border: 'none',
        color: danger ? '#dc2626' : 'var(--p-ink)',
        cursor: 'pointer',
        borderRadius: 'var(--r-sm)',
      }}
    >
      {children}
    </button>
  );
}

function ScorePopoverRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        padding: 'var(--s1) var(--s0)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--p-ink-muted, #71717a)' }}>{label}</span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'var(--p-ink, #111)',
        }}
      >
        {value != null ? value : '—'}
      </span>
    </div>
  );
}

// Avatar with optional Verity Score popover. Anon viewers (canViewScore=false)
// keep the plain avatar→profile link. Signed-in viewers see a small card on
// desktop hover or mobile tap with subcategory + overall scores and a profile
// link. The card is dismissed on outside click, Escape, or scroll.
function AvatarWithScoreCard({
  user,
  canViewScore,
  subcategoryScore,
  overallScore,
}: {
  user: CommentUser;
  canViewScore: boolean;
  subcategoryScore: number | null;
  overallScore: number | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Anon / no-perm viewers: keep the original behaviour exactly.
  if (!canViewScore) {
    if (user.username) {
      return (
        <a
          href={`/u/${user.username}`}
          style={{ flexShrink: 0, display: 'block', textDecoration: 'none' }}
        >
          <Avatar user={user} size={36} />
        </a>
      );
    }
    return (
      <span style={{ flexShrink: 0, display: 'block' }}>
        <Avatar user={user} size={36} />
      </span>
    );
  }

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 350);
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openOnHover = () => {
    cancelClose();
    setOpen(true);
  };

  return (
    <div
      ref={wrapRef}
      style={{
        flexShrink: 0,
        position: 'relative',
        // Don't stretch to the flex row's full height — without this the
        // wrapper grows to encompass the comment body + replies, and
        // `top: 100%` on the popover lands below the entire comment block
        // instead of directly under the avatar.
        alignSelf: 'flex-start',
        // Inline-block keeps the wrapper sized to the avatar (36×36) and
        // makes the relative-positioned popover anchor against that box.
        display: 'inline-block',
        // height pin matches the avatar's intrinsic size so vertical-align
        // quirks (line-height of inline children) can't add a few extra
        // pixels under the button before `top: 100%` is computed.
        height: 36,
      }}
      onMouseEnter={openOnHover}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={user.username ? `${user.username} — Verity Score card` : 'User card'}
        onMouseEnter={openOnHover}
        onMouseLeave={scheduleClose}
        onFocus={openOnHover}
        onBlur={scheduleClose}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          display: 'block',
          lineHeight: 0,
        }}
      >
        <Avatar user={user} size={36} />
      </button>
      {open && (
        <div
          role="dialog"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{
            position: 'absolute',
            // Sits flush with the bottom of the avatar (no gap) so the
            // cursor doesn't have to cross dead space to reach the card.
            top: '100%',
            left: 0,
            zIndex: 50,
            minWidth: 232,
            background: 'var(--card, #ffffff)',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: 12, // magic — intentional (between --r-md 10 and --r-lg 14 for the score card)
            // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 14/16/10 tuned for the score-card popover insets
            padding: '14px 16px 10px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
            fontSize: 13,
            color: 'var(--p-ink, #111)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              marginBottom: 10,
              color: 'var(--p-ink, #111)',
            }}
          >
            {user.username ? `@${user.username}` : 'Reader'}
          </div>
          <ScorePopoverRow label="Verity Score" value={overallScore} />
          <ScorePopoverRow label="Category score" value={subcategoryScore} />
          <div
            aria-hidden="true"
            style={{
              height: 1,
              background: 'var(--border, #e5e5e5)',
              margin: '10px -16px 6px',
            }}
          />
          {user.username && (
            <a
              href={`/u/${user.username}`}
              className="vp-avatar-card-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                color: 'var(--p-ink, #111)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 500,
                // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 6px vertical inset for the View profile row
                padding: '6px 0',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <span>View profile</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0, opacity: 0.55 }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
