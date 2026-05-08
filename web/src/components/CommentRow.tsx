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

export type TagKind = 'context' | 'cite_needed' | 'off_topic';

// Three tags: one additive (context), two challenge (cite_needed, off_topic).
// No counts shown in UI — quality_score is the only derived number surfaced.
const TAG_META: Record<TagKind, { label: string; color: string; challenge: boolean }> = {
  context:     { label: 'Context',     color: 'var(--p-ink)', challenge: false },
  cite_needed: { label: 'Cite needed', color: '#ea580c', challenge: true },
  off_topic:   { label: 'Off-topic',   color: '#6b7280', challenge: true },
};

export type CommentFollowup = {
  id: string;
  body: string;
  sort_order: number | null;
  created_at: string;
};

export type EnrichedComment = CommentRowDb & {
  users?: CommentUser;
  _your_tags?: Set<TagKind>;
  helpful_count?: number | null;
  cite_needed_count?: number | null;
  off_topic_count?: number | null;
  quality_score?: number | null;
  // EXPERT_THREADS Wave 4b — newer columns the generated db.ts may not
  // yet carry. Kept optional so loadAll's `select('*')` unwraps cleanly.
  is_expert_thread_root?: boolean | null;
  expert_thread_root_id?: string | null;
  expert_thread_closed_at?: string | null;
  last_reopen_at?: string | null;
  // TODO-48 author follow-ups — embedded via PostgREST relation
  // `followups:comment_followups(...)` in CommentThread's select. Optional
  // because pre-migration cached rows may not carry it.
  followups?: CommentFollowup[] | null;
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

const DEFAULT_TAG_KINDS: TagKind[] = ['context', 'cite_needed', 'off_topic'];

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
  // Follow-ups (TODO-48) — author-only, cap of 2, immutable. Hydrated via
  // PostgREST embed in CommentThread's select. Optimistic local append on
  // post; server is the source of truth on next load.
  const serverFollowups = (comment.followups || []) as CommentFollowup[];
  const [followupsLocal, setFollowupsLocal] = useState<CommentFollowup[]>([]);
  const [followupOpen, setFollowupOpen] = useState<boolean>(false);
  const [followupText, setFollowupText] = useState<string>('');
  const [followupBusy, setFollowupBusy] = useState<boolean>(false);
  const [followupError, setFollowupError] = useState<string>('');
  const FOLLOWUP_MAX = 3;
  const FOLLOWUP_CHAR_LIMIT = 280;
  // Merge server + optimistic local. De-dupe by id; sort by sort_order then
  // created_at so stable ordering matches the DB UNIQUE (comment_id, sort_order).
  const followupsMerged: CommentFollowup[] = (() => {
    const byId = new Map<string, CommentFollowup>();
    for (const f of serverFollowups) byId.set(f.id, f);
    for (const f of followupsLocal) byId.set(f.id, f);
    return [...byId.values()].sort((a, b) => {
      const sa = a.sort_order ?? 0;
      const sb = b.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  })();
  const followups = followupsMerged;
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
  const canContextTag = hasPermission('comments.context_tag');
  const canEditOwn = hasPermission('comments.edit.own');
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
    ? (canEditOwn || canDeleteOwn)
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
    if (k === 'context') return (comment as CommentRowDb & { context_tag_count?: number | null }).context_tag_count ?? 0;
    if (k === 'cite_needed') return comment.cite_needed_count ?? 0;
    return comment.off_topic_count ?? 0;
  }

  return (
    <div
      id={`comment-${comment.id}`}
      style={{
        ...(depth === 0 && !showExpertChrome ? {
          paddingTop: 28,
          paddingBottom: 24,
          borderBottom: '1px solid var(--border, #e5e5e5)',
        } : depth > 0 && !showExpertChrome ? {
          paddingTop: 16,
          paddingBottom: 4,
        } : {}),
        ...(showExpertChrome ? {
          background: '#f0faf4',
          borderLeft: '3px solid var(--success-text)',
          borderRadius: '0 8px 8px 0',
          padding: '14px 16px',
          marginTop: 4,
          marginBottom: 4,
        } : {}),
      }}
    >
      {comment.is_context_pinned && (
        <div
          style={{ borderLeft: '2px solid var(--p-ink)', paddingLeft: 8, marginBottom: 8 }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--p-ink)' }}>
            Pinned as Article Context
          </span>
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
            ...(depth > 0 && !showExpertChrome ? {
              paddingLeft: 14,
              borderLeft: '2px solid var(--border, #e5e5e5)',
            } : {}),
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
                    fontSize: 11, lineHeight: 1, letterSpacing: '0.02em',
                    color: copiedLink ? 'var(--success-text, #16a34a)' : 'var(--p-ink-muted)',
                    fontFamily: 'inherit',
                    transition: 'color 100ms',
                  }}
                >
                  {copiedLink ? 'Copied!' : `${timeAgo(comment.created_at)}${comment.is_edited ? ' · edited' : ''}`}
                </button>
                {(comment.quality_score ?? 0) !== 0 && (
                  <span
                    title="Community quality signal"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: (comment.quality_score ?? 0) > 0 ? 'var(--success-text)' : '#b94040',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {(comment.quality_score ?? 0) > 0 ? '+' : ''}{comment.quality_score}
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
                      background: '#fff',
                      border: '1px solid var(--p-border)',
                      borderRadius: 8,
                      boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
                      minWidth: 140,
                      padding: 4,
                    }}
                  >
                    {isOwner ? (
                      <>
                        {canEditOwn && (
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
              borderRadius: '0 10px 10px 0',
              border: '1px solid var(--p-border)',
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
                  padding: '2px 0',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--p-border)' }}>
                <button
                  onClick={doSaveEdit}
                  disabled={busy === 'edit' || !editBody.trim()}
                  style={{
                    fontSize: 13,
                    padding: '7px 16px',
                    borderRadius: 9,
                    border: 'none',
                    background: editBody.trim() && busy !== 'edit' ? 'var(--p-ink)' : '#ccc',
                    color: '#fff',
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

          {/* Author follow-ups — pinned beneath the parent comment. OP-only
              composer. Cap of FOLLOWUP_MAX. Editorial typeset: serif italic
              label, no chrome boxes, the typographic shift carries the meaning. */}
          {!isDeleted && (followups.length > 0 || (isOwner && followupOpen) || (isOwner && followups.length < FOLLOWUP_MAX)) && (
            <div
              style={{
                marginTop: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {followups.map((f, idx) => {
                const ageMs = Date.now() - new Date(f.created_at).getTime();
                const rel =
                  ageMs < 30_000
                    ? 'just now'
                    : ageMs < 3_600_000
                    ? `${Math.floor(ageMs / 60_000)} min later`
                    : ageMs < 86_400_000
                    ? `${Math.floor(ageMs / 3_600_000)} h later`
                    : `${Math.floor(ageMs / 86_400_000)} d later`;
                return (
                  <div
                    key={f.id}
                    style={{
                      animation: 'vpFadeIn 240ms ease-out',
                      display: 'grid',
                      gridTemplateColumns: '14px 1fr',
                      columnGap: 14,
                    }}
                  >
                    <div aria-hidden="true" style={{ position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          top: 7,
                          left: 0,
                          width: 14,
                          height: 1,
                          background: 'var(--p-warn, #b45309)',
                          opacity: 0.9,
                        }}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--font-serif), Georgia, serif',
                          fontStyle: 'italic',
                          fontSize: 13,
                          fontWeight: 400,
                          color: 'var(--p-warn, #b45309)',
                          letterSpacing: '0.01em',
                          marginBottom: 4,
                        }}
                      >
                        Update{followups.length > 1 ? ` ${idx + 1} of ${followups.length}` : ''},{' '}
                        <span style={{ opacity: 0.78 }}>{rel}</span>
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans), -apple-system, sans-serif',
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: 'var(--p-ink, #0a0a0a)',
                        }}
                      >
                        {f.body}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isOwner && followupOpen && (
                <div
                  style={{
                    animation: 'vpFadeIn 200ms ease-out',
                    display: 'grid',
                    gridTemplateColumns: '14px 1fr',
                    columnGap: 14,
                  }}
                >
                  <div aria-hidden="true" style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        top: 7,
                        left: 0,
                        width: 14,
                        height: 1,
                        background: 'var(--p-warn, #b45309)',
                        opacity: 0.9,
                      }}
                    />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-serif), Georgia, serif',
                        fontStyle: 'italic',
                        fontSize: 13,
                        fontWeight: 400,
                        color: 'var(--p-warn, #b45309)',
                        letterSpacing: '0.01em',
                        marginBottom: 4,
                      }}
                    >
                      Update
                    </div>
                    <textarea
                      value={followupText}
                      onChange={(e) => setFollowupText(e.target.value.slice(0, FOLLOWUP_CHAR_LIMIT))}
                      rows={2}
                      placeholder="Clarify or correct — this pins beneath your comment and can't be edited."
                      style={{
                        width: '100%',
                        padding: 0,
                        border: 'none',
                        fontFamily: 'var(--font-sans), -apple-system, sans-serif',
                        fontSize: 14,
                        lineHeight: 1.6,
                        outline: 'none',
                        resize: 'none',
                        background: 'transparent',
                        color: 'var(--p-ink, #0a0a0a)',
                        minHeight: 46,
                      }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setFollowupOpen(false);
                          setFollowupText('');
                        }
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        marginTop: 8,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-serif), Georgia, serif',
                          fontStyle: 'italic',
                          fontSize: 12,
                          color:
                            followupText.length > FOLLOWUP_CHAR_LIMIT - 20
                              ? 'var(--p-warn, #b45309)'
                              : 'var(--p-ink-faint, #a1a1aa)',
                          fontVariantNumeric: 'tabular-nums',
                          transition: 'color 140ms ease',
                        }}
                      >
                        {FOLLOWUP_CHAR_LIMIT - followupText.length}
                      </span>
                      <span style={{ flex: 1 }} />
                      <button
                        onClick={() => { setFollowupOpen(false); setFollowupText(''); setFollowupError(''); }}
                        disabled={followupBusy}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '4px 2px',
                          fontSize: 12,
                          color: 'var(--p-ink-muted, #52525b)',
                          cursor: followupBusy ? 'default' : 'pointer',
                          opacity: followupBusy ? 0.5 : 1,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          const body = followupText.trim();
                          if (!body || followupBusy) return;
                          setFollowupBusy(true);
                          setFollowupError('');
                          try {
                            const res = await fetch(
                              `/api/comments/${encodeURIComponent(comment.id)}/followups`,
                              {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ body }),
                              }
                            );
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              if (res.status === 409) {
                                setFollowupError(data?.message || 'this comment already has 3 updates.');
                              } else if (res.status === 403) {
                                setFollowupError('only the comment author can post follow-ups.');
                              } else {
                                setFollowupError(data?.error || 'could not post update.');
                              }
                              return;
                            }
                            const created = data?.followup;
                            if (created && created.id) {
                              setFollowupsLocal((prev) => [...prev, created as CommentFollowup]);
                            }
                            setFollowupText('');
                            setFollowupOpen(false);
                          } catch {
                            setFollowupError('could not post update.');
                          } finally {
                            setFollowupBusy(false);
                          }
                        }}
                        disabled={!followupText.trim() || followupBusy}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 999,
                          border: '1px solid var(--p-warn, #b45309)',
                          background: followupText.trim() ? 'var(--p-warn, #b45309)' : 'transparent',
                          color: followupText.trim() ? '#ffffff' : 'var(--p-warn, #b45309)',
                          fontFamily: 'var(--font-serif), Georgia, serif',
                          fontStyle: 'italic',
                          fontSize: 12.5,
                          fontWeight: 500,
                          letterSpacing: '0.01em',
                          cursor: followupText.trim() ? 'pointer' : 'not-allowed',
                          opacity: followupText.trim() && !followupBusy ? 1 : 0.55,
                          transition: 'background 140ms ease, opacity 140ms ease',
                        }}
                      >
                        {followupBusy ? 'Posting…' : 'Post update'}
                      </button>
                    </div>
                    {followupError && (
                      <div
                        role="alert"
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: 'var(--p-warn, #b45309)',
                          fontStyle: 'italic',
                        }}
                      >
                        {followupError}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isOwner && !followupOpen && followups.length < FOLLOWUP_MAX && (
                <button
                  onClick={() => setFollowupOpen(true)}
                  style={{
                    fontFamily: 'var(--font-serif), Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: 13,
                    fontWeight: 400,
                    color: 'var(--p-warn, #b45309)',
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 0',
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                    opacity: 0.78,
                    letterSpacing: '0.01em',
                    transition: 'opacity 140ms ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.78')}
                >
                  {followups.length === 0 ? 'Add an update' : 'Add another'}
                </button>
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
            const replyButton =
              canReply && commentDepth < commentMaxDepth ? (
                <button
                  onClick={() => {
                    if (replyDisabled) return;
                    setReplyOpen((v) => !v);
                  }}
                  disabled={replyDisabled}
                  title={
                    isExpertThreadClosed
                      ? 'This thread is closed.'
                      : askerCapHit
                        ? `Conversation complete with @${user.username || 'expert'} — they can grant another reply if you have a follow-up.`
                        : undefined
                  }
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '5px 12px',
                    borderRadius: 20,
                    minHeight: 32,
                    border: '1px solid var(--border, #e5e5e5)',
                    background: 'transparent',
                    color: replyDisabled ? 'var(--p-ink-faint)' : 'var(--p-ink-muted)',
                    cursor: replyDisabled ? 'default' : 'pointer',
                    touchAction: 'manipulation',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Reply
                </button>
              ) : null;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                  {/* Quote reply — appears when reader has selected text in this comment's body */}
                  {selectedQuote && canReply && !replyOpen && (
                    <button
                      onClick={() => {
                        setQuoteReplyText(selectedQuote);
                        setSelectedQuote('');
                        window.getSelection()?.removeAllRanges();
                        setReplyOpen(true);
                      }}
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        padding: '5px 12px',
                        borderRadius: 20,
                        minHeight: 32,
                        border: '1px solid var(--border, #e5e5e5)',
                        background: 'transparent',
                        color: 'var(--p-ink-muted, #888)',
                        cursor: 'pointer',
                        letterSpacing: '-0.01em',
                        touchAction: 'manipulation',
                      }}
                    >
                      Quote reply
                    </button>
                  )}
                  {replyButton}
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
                        padding: '4px 10px',
                        borderRadius: 6,
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
                        padding: '4px 10px',
                        borderRadius: 6,
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
                        padding: '4px 10px',
                        borderRadius: 6,
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
                  {/* Context / Cite needed / Off-topic tag buttons — inline, always visible to non-owners */}
                  {!isOwner && canContextTag && quizPassed !== false && tagKinds.map(k => {
                    const meta = TAG_META[k];
                    const active = yours.has(k);
                    const count = tagCount(k);
                    return (
                      <button
                        key={k}
                        onClick={() => doTag(k)}
                        disabled={!!busy}
                        style={{
                          fontSize: 12,
                          fontWeight: active ? 600 : 500,
                          padding: '5px 12px',
                          borderRadius: 20,
                          minHeight: 32,
                          border: `1px solid ${active ? meta.color : 'var(--border, #e5e5e5)'}`,
                          background: active ? `${meta.color}15` : 'transparent',
                          color: active ? meta.color : 'var(--p-ink-muted, #888)',
                          cursor: busy ? 'default' : 'pointer',
                          letterSpacing: '0',
                          touchAction: 'manipulation',
                          WebkitTapHighlightColor: 'transparent',
                          transition: 'border-color 120ms, background 120ms, color 120ms',
                        }}
                      >
                        {meta.label}{count > 0 ? ` ${count}` : ''}
                      </button>
                    );
                  })}
                  {/* Reply thread toggle — lives in the action row, same as all other toggles */}
                  {depth === 0 && replies.length > 0 && (
                    <button
                      onClick={() => setRepliesOpen(v => !v)}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '5px 12px',
                        borderRadius: 20,
                        minHeight: 32,
                        border: '1px solid var(--border, #e5e5e5)',
                        background: repliesOpen ? 'var(--card, #f5f5f5)' : 'transparent',
                        color: 'var(--p-ink-muted, #888)',
                        cursor: 'pointer',
                        letterSpacing: '0',
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                        transition: 'background 120ms',
                      }}
                    >
                      {repliesOpen
                        ? 'Hide replies'
                        : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                    </button>
                  )}
              </div>
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

          {repliesOpen && replies.map((r, i) => <React.Fragment key={i}>{r}</React.Fragment>)}
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
        padding: '8px 12px',
        fontSize: 13,
        background: 'transparent',
        border: 'none',
        color: danger ? '#dc2626' : 'var(--p-ink)',
        cursor: 'pointer',
        borderRadius: 6,
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
        padding: '4px 0',
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
            borderRadius: 12,
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
                padding: '6px 0',
                borderRadius: 6,
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
