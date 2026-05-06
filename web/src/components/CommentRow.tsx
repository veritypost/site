'use client';
import { useState, useEffect, useRef, ReactNode } from 'react';
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

export type TagKind = 'context' | 'helpful' | 'cite_needed' | 'off_topic';

// Four tags: two additive (helpful, context), two challenge (cite_needed, off_topic).
// No counts shown in UI — quality_score is the only derived number surfaced.
const TAG_META: Record<TagKind, { label: string; color: string; challenge: boolean }> = {
  helpful:     { label: 'Helpful',     color: 'var(--success-text)', challenge: false },
  context:     { label: 'Context',     color: 'var(--accent, #111)', challenge: false },
  cite_needed: { label: 'Cite needed', color: '#ea580c', challenge: true },
  off_topic:   { label: 'Off-topic',   color: '#6b7280', challenge: true },
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
};

interface CommentRowProps {
  comment: EnrichedComment;
  replies?: ReactNode[];
  currentUserId?: string | null;
  currentUserTier?: string;
  currentUserVerified?: boolean;
  authorCategoryScore?: number | null;
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

const DEFAULT_TAG_KINDS: TagKind[] = ['helpful', 'context', 'cite_needed', 'off_topic'];

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
    if (idx > lastIndex) parts.push(body.slice(lastIndex, idx));

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
            color: 'var(--dim, #999)',
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
          style={{ color: 'var(--accent, #111)', fontWeight: 600, textDecoration: 'none' }}
        >
          @{name}
        </a>
      );
    } else {
      parts.push(full);
    }
    lastIndex = idx + full.length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

export default function CommentRow({
  comment,
  replies = [],
  currentUserId,
  currentUserTier,
  currentUserVerified = true,
  authorCategoryScore,
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
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [commentMaxDepth, setCommentMaxDepth] = useState<number>(2);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
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
  const authorIsInCategoryExpert = (() => {
    if (!user.is_expert) return false;
    if (!articleCategoryId) return false;
    const set = (verifiedCategoriesByUser || {})[comment.user_id];
    return !!set && set.has(articleCategoryId);
  })();
  const showExpertChrome = !!comment.is_expert_reply || authorIsInCategoryExpert;
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
  const mentions = (Array.isArray(comment.mentions) ? comment.mentions : []) as Mention[];
  const commentDepth = comment.thread_depth ?? depth;

  return (
    <div
      style={{
        padding: depth === 0 ? '12px 0' : '10px 0',
        borderBottom: depth === 0 && !showExpertChrome ? '1px solid #e5e5e5' : 'none',
        ...(showExpertChrome ? {
          background: '#f0faf4',
          borderLeft: '3px solid var(--success-text)',
          borderRadius: '0 8px 8px 0',
          padding: depth > 0 ? '14px 16px' : '14px 16px',
          marginTop: 4,
          marginBottom: 4,
        } : {}),
      }}
    >
      {comment.is_context_pinned && (
        <div
          style={{ borderLeft: '2px solid var(--accent, #111)', paddingLeft: 8, marginBottom: 8 }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent, #111)' }}>
            Pinned as Article Context
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        {user.username ? (
          <a href={`/u/${user.username}`} style={{ flexShrink: 0, display: 'block', textDecoration: 'none' }}>
            <Avatar user={user} size={32} />
          </a>
        ) : (
          <span style={{ flexShrink: 0, display: 'block' }}>
            <Avatar user={user} size={32} />
          </span>
        )}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            ...(depth > 0 ? {
              paddingLeft: 16,
              ...(!showExpertChrome ? { borderLeft: '2px solid #e0e0e0' } : {}),
              marginLeft: 12,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #111)' }}>
              {user.username || 'user'}
            </span>
            <VerifiedBadge user={user} />
            {(comment.helpful_count ?? 0) >= helpfulThreshold && (
              <span
                title={`Marked helpful by ${comment.helpful_count} readers`}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(22,163,74,0.12)',
                  color: 'var(--success-text)',
                }}
              >
                Helpful
              </span>
            )}
            {authorCategoryScore != null && (
              <span
                title="Verity Score in this category"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: 'rgba(17,17,17,0.08)',
                  color: 'var(--accent, #111)',
                }}
              >
                VS {authorCategoryScore}
              </span>
            )}
            <span style={{ fontSize: 12, color: '#ccc', margin: '0 4px' }}>&middot;</span>
              <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>
                {timeAgo(comment.created_at)}
                {comment.is_edited ? ' · edited' : ''}
              </span>
              {(comment.quality_score ?? 0) !== 0 && (
                <>
                  <span style={{ fontSize: 12, color: '#ccc', margin: '0 2px' }}>&middot;</span>
                  <span
                    title="Community quality signal"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: (comment.quality_score ?? 0) > 0 ? 'var(--success-text)' : '#b94040',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {(comment.quality_score ?? 0) > 0 ? '+' : ''}{comment.quality_score}
                  </span>
                </>
              )}
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
                    color: menuOpen ? 'var(--text, #333)' : 'var(--dim, #bbb)',
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
                      border: '1px solid var(--border, #e5e5e5)',
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
              borderLeft: '3px solid var(--accent, #111)',
              borderRadius: '0 10px 10px 0',
              border: '1px solid var(--border, #e5e5e5)',
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
                  color: 'var(--text, #1a1a1a)',
                  outline: 'none',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  padding: '2px 0',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border, #e5e5e5)' }}>
                <button
                  onClick={doSaveEdit}
                  disabled={busy === 'edit' || !editBody.trim()}
                  style={{
                    fontSize: 13,
                    padding: '7px 16px',
                    borderRadius: 9,
                    border: 'none',
                    background: editBody.trim() && busy !== 'edit' ? 'var(--accent, #111)' : '#ccc',
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
                    color: 'var(--dim, #666)',
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
                color: 'var(--dim, #666)',
                fontStyle: 'italic',
              }}
            >
              [deleted]
            </div>
          ) : (
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: 'var(--text, #1a1a1a)',
                filter: blurred ? 'blur(6px)' : 'none',
                userSelect: blurred ? 'none' : 'auto',
                pointerEvents: blurred ? 'none' : 'auto',
              }}
            >
              {renderBody(comment.body || '', mentions, inertVisualGiveaway)}
            </div>
          )}
          {blurred && (
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--dim, #666)' }}>
              Expert response &mdash;{' '}
              <a
                href="/profile/settings#billing"
                style={{ color: 'var(--accent, #111)', fontWeight: 600 }}
              >
                available on paid plans
              </a>
            </div>
          )}

          {/* Tag chips — visible when any tag is active (you or community) */}
          {!isDeleted && !editing && !isOwner && canContextTag && (() => {
            const tc = (k: TagKind): number =>
              k === 'helpful' ? (comment.helpful_count ?? 0)
              : k === 'context' ? ((comment as CommentRowDb & { context_tag_count?: number | null }).context_tag_count ?? 0)
              : k === 'cite_needed' ? (comment.cite_needed_count ?? 0)
              : (comment.off_topic_count ?? 0);
            const yours = comment._your_tags ?? new Set<TagKind>();
            const activeTags = tagKinds.filter(k => yours.has(k) || tc(k) > 0);
            const inactiveTags = tagKinds.filter(k => !yours.has(k) && tc(k) === 0);
            if (activeTags.length === 0 && !tagPickerOpen) return (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setTagPickerOpen(true)}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px dashed var(--border, #e0e0e0)', background: 'transparent', color: 'var(--dim, #aaa)', cursor: 'pointer', lineHeight: 1.6 }}
                >
                  + Tag
                </button>
              </div>
            );
            return (
              <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                {activeTags.map(k => {
                  const meta = TAG_META[k];
                  const active = yours.has(k);
                  return (
                    <button
                      key={k}
                      onClick={() => doTag(k)}
                      disabled={!!busy}
                      style={{
                        fontSize: 11,
                        fontWeight: active ? 700 : 500,
                        padding: '2px 8px',
                        borderRadius: 5,
                        border: `1px solid ${active ? meta.color : 'var(--border, #e5e5e5)'}`,
                        background: active ? `${meta.color}18` : 'transparent',
                        color: active ? meta.color : 'var(--dim, #888)',
                        cursor: 'pointer',
                        lineHeight: 1.6,
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
                {inactiveTags.length > 0 && (
                  <button
                    onClick={() => setTagPickerOpen(v => !v)}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px dashed var(--border, #e0e0e0)', background: 'transparent', color: 'var(--dim, #aaa)', cursor: 'pointer', lineHeight: 1.6 }}
                  >
                    {tagPickerOpen ? '−' : '+'}
                  </button>
                )}
                {tagPickerOpen && inactiveTags.map(k => {
                  const meta = TAG_META[k];
                  return (
                    <button
                      key={k}
                      onClick={() => { doTag(k); setTagPickerOpen(false); }}
                      disabled={!!busy}
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: 5,
                        border: '1px dashed var(--border, #e0e0e0)',
                        background: 'transparent',
                        color: 'var(--dim, #888)',
                        cursor: 'pointer',
                        lineHeight: 1.6,
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

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
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 6,
                    minHeight: 30,
                    border: 'none',
                    background: 'transparent',
                    color: replyDisabled ? 'var(--dim, #bbb)' : 'var(--dim, #666)',
                    cursor: replyDisabled ? 'default' : 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  Reply
                </button>
              ) : null;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 6, flexWrap: 'wrap' }}>
                  {replyButton}
                  {askerRepliesLeft != null && askerRepliesLeft > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--dim, #888)',
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
                        border: '1px solid var(--border, #e5e5e5)',
                        background: 'transparent',
                        color: closeCooldown > 0 ? 'var(--dim, #bbb)' : 'var(--dim, #666)',
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
                        border: '1px solid var(--border, #e5e5e5)',
                        background: 'transparent',
                        color: 'var(--dim, #666)',
                        cursor: busy === 'reopen' ? 'default' : 'pointer',
                        marginLeft: 4,
                      }}
                    >
                      {busy === 'reopen' ? 'Reopening…' : 'Reopen (mod)'}
                    </button>
                  )}
                  {isExpertThreadRoot && isExpertThreadClosed && !showReopen && (
                    <span
                      style={{ fontSize: 11, color: 'var(--dim, #999)', marginLeft: 8 }}
                    >
                      Thread closed
                    </span>
                  )}
                  {askerCapHit && (
                    <span style={{ fontSize: 11, color: 'var(--dim, #888)', marginLeft: 8 }}>
                      Conversation complete with @{user.username || 'expert'} — they can grant another reply if you have a follow-up.
                    </span>
                  )}
              </div>
            );
          })()}

          {replyOpen && canReply && (
            <div style={{ marginTop: 10 }}>
              <CommentComposer
                articleId={articleId}
                parentId={comment.id}
                currentUserTier={currentUserTier}
                onPosted={(c) => {
                  setReplyOpen(false);
                  onReplied?.(c);
                }}
                onCancel={() => setReplyOpen(false)}
                autoFocus
              />
            </div>
          )}

          {replies.map((r) => r)}
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
        color: danger ? '#dc2626' : 'var(--text-primary, #111)',
        cursor: 'pointer',
        borderRadius: 6,
      }}
    >
      {children}
    </button>
  );
}
