// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
'use client';
import { useState, useEffect, useRef, CSSProperties, ReactNode } from 'react';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import CommentComposer from './CommentComposer';
import { hasPermission } from '@/lib/permissions';
import { MENTION_RE } from '@/lib/mentions';
import { timeAgo } from '@/lib/dates';
import type { Database } from '@/types/database';

type CommentRowDb = Database['public']['Tables']['comments']['Row'];

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

// Section A — kept loosely typed at the row layer to avoid pulling the
// Thread-level union here; CommentThread owns the canonical TagKind.
export type TagKind =
  | 'context'
  | 'helpful'
  | 'insightful'
  | 'sarcastic'
  | 'cite_needed'
  | 'off_topic';

// Per-tag chip metadata. Colors mirror the Section A spec; labels match
// the public copy. Counts come from the row when ≥ 1 (context_tag_count
// for 'context', helpful_count for 'helpful', otherwise we rely on the
// per-user state without a public count — Section A only ships a
// public count for context + helpful).
const TAG_META: Record<TagKind, { label: string; color: string }> = {
  helpful:     { label: 'Helpful',      color: '#16a34a' },
  insightful:  { label: 'Insightful',   color: '#2563eb' },
  sarcastic:   { label: 'Sarcastic',    color: '#f59e0b' },
  cite_needed: { label: 'Cite needed',  color: '#ea580c' },
  off_topic:   { label: 'Off-topic',    color: '#6b7280' },
  context:     { label: 'Context',      color: 'var(--accent, #111)' },
};

// Section A — `helpful_count` lives on `comments` after the migration;
// the regen will surface it natively, but we keep an explicit optional
// field on the enriched row so the typeline holds during the transition
// window before `npm run types:gen` runs.
export type EnrichedComment = CommentRowDb & {
  users?: CommentUser;
  _your_vote?: 'upvote' | 'downvote' | null | undefined;
  _your_tags?: Set<TagKind>;
  helpful_count?: number | null;
};

type VoteType = 'upvote' | 'downvote' | 'clear';

interface CommentRowProps {
  comment: EnrichedComment;
  replies?: ReactNode[];
  currentUserId?: string | null;
  currentUserTier?: string;
  currentUserVerified?: boolean;
  authorCategoryScore?: number | null;
  articleId: string;
  viewerIsSupervisor?: boolean;
  viewerIsModerator?: boolean;
  // Section A — passed by CommentThread; defaults are used if a caller
  // doesn't supply them so existing direct-mount tests still work.
  helpfulThreshold?: number;
  tagKinds?: TagKind[];
  onVote: (commentId: string, type: VoteType) => void | Promise<void>;
  onToggleTag: (commentId: string, tagKind: TagKind) => void | Promise<void>;
  onDelete: (commentId: string) => void;
  onEdit: (commentId: string, body: string) => void | Promise<void>;
  onReport: (commentId: string) => void;
  onBlock: (userId: string) => void;
  onFlag?: (commentId: string) => void;
  onHide?: (commentId: string) => void;
  onReplied?: (comment: CommentRowDb | null) => void;
  depth?: number;
}

const DEFAULT_TAG_KINDS: TagKind[] = [
  'helpful',
  'insightful',
  'sarcastic',
  'cite_needed',
  'off_topic',
  'context',
];

function renderBody(body: string, mentions: Mention[] = []): ReactNode[] {
  const resolved = new Set((mentions || []).map((m) => m.username));
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const [full, name] = match;
    const idx = match.index ?? 0;
    if (idx > lastIndex) parts.push(body.slice(lastIndex, idx));
    if (resolved.has(name)) {
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
  viewerIsModerator = false,
  helpfulThreshold = 10,
  tagKinds = DEFAULT_TAG_KINDS,
  onVote,
  onToggleTag,
  onDelete,
  onEdit,
  onReport,
  onBlock,
  onFlag,
  onHide,
  onReplied,
  depth = 0,
}: CommentRowProps) {
  const [replyOpen, setReplyOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [editBody, setEditBody] = useState<string>(comment.body || '');
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [commentMaxDepth, setCommentMaxDepth] = useState<number>(2);
  const [tagsOpen, setTagsOpen] = useState<boolean>(false);

  const canReply = hasPermission('comments.reply');
  const canUpvote = hasPermission('comments.upvote');
  const canDownvote = hasPermission('comments.downvote');
  const canContextTag = hasPermission('comments.context_tag');
  const canReport = hasPermission('comments.report');
  const canEditOwn = hasPermission('comments.edit.own');
  const canDeleteOwn = hasPermission('comments.delete.own');
  const canBlockUser = hasPermission('comments.block.add');
  const canReadExpert = hasPermission('article.expert_responses.read');

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

  async function doVote(type: VoteType) {
    if (busy) return;
    setBusy('vote');
    try {
      await onVote(comment.id, type);
    } finally {
      setBusy('');
    }
  }
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

  const yourVote = comment._your_vote;
  const mentions = (Array.isArray(comment.mentions) ? comment.mentions : []) as Mention[];
  const commentDepth = comment.thread_depth ?? depth;
  const hasAnyTag = canContextTag && tagKinds.some((kind) => {
    if (comment._your_tags?.has(kind)) return true;
    if (kind === 'context' && (comment.context_tag_count ?? 0) >= 1) return true;
    if (kind === 'helpful' && (comment.helpful_count ?? 0) >= 1) return true;
    return false;
  });

  return (
    <div
      style={{
        padding: depth === 0 ? '20px 0' : '16px 0',
        borderBottom: depth === 0 && !comment.is_expert_reply ? '1px solid #e5e5e5' : 'none',
        ...(comment.is_expert_reply ? {
          background: '#f0faf4',
          borderLeft: '3px solid #2d9e6b',
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
        <Avatar user={user} size={32} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            ...(depth > 0 ? {
              paddingLeft: 16,
              borderLeft: '2px solid #e0e0e0',
              marginLeft: 12,
            } : {}),
          }}
        >
          {comment.is_expert_reply && (
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: '#2d9e6b',
              marginBottom: 4,
            }}>
              Expert Reply{user.expert_title ? ` · ${user.expert_title}` : ''}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              flexWrap: 'wrap',
              marginBottom: 5,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--white, #111)' }}>
              {user.username || 'user'}
            </span>
            <VerifiedBadge user={user} />
            {/* Section A — inline Helpful badge once the comment crosses
                the editorial threshold (default 10, settings-tunable via
                helpful_badge_threshold). Sits between the verified badge
                and the category score so verified-figure + helpful both
                read at a glance. */}
            {(comment.helpful_count ?? 0) >= helpfulThreshold && (
              <span
                title={`Marked helpful by ${comment.helpful_count} readers`}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(22,163,74,0.12)',
                  color: '#16a34a',
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
            <span style={{ fontSize: 12, color: '#ccc', margin: '0 4px' }}>·</span>
            <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>
              {timeAgo(comment.created_at)}
              {comment.is_edited ? ' \u00b7 edited' : ''}
            </span>
          </div>

          {editing ? (
            <div>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid var(--border, #e5e5e5)',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  onClick={doSaveEdit}
                  disabled={busy === 'edit' || !editBody.trim()}
                  style={{
                    fontSize: 13,
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent, #111)',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: busy === 'edit' ? 'not-allowed' : 'pointer',
                    opacity: busy === 'edit' ? 0.6 : 1,
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditBody(comment.body || '');
                  }}
                  style={{
                    fontSize: 12,
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border, #e5e5e5)',
                    background: 'transparent',
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
              {renderBody(comment.body || '', mentions)}
            </div>
          )}
          {blurred && (
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--dim, #666)' }}>
              Expert response \u2014{' '}
              <a
                href="/profile/settings#billing"
                style={{ color: 'var(--accent, #111)', fontWeight: 600 }}
              >
                available on paid plans
              </a>
            </div>
          )}

          {!isDeleted && !editing && (
            <div style={{ marginTop: 8 }}>
              {/* Row 1 \u2014 vote / reply / menu */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
              {(canUpvote || canDownvote) && (() => {
                const up = comment.upvote_count || 0;
                const down = comment.downvote_count || 0;
                const net = up - down;
                const votedUp = yourVote === 'upvote';
                const votedDown = yourVote === 'downvote';
                // Pill border shifts to match active vote; neutral otherwise.
                const pillBorderColor = votedUp ? '#1a7a4a' : votedDown ? '#b94040' : 'var(--border, #e5e5e5)';
                return (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'stretch',
                      border: `1px solid ${pillBorderColor}`,
                      borderRadius: 8,
                      overflow: 'hidden',
                      transition: 'border-color 0.15s ease',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Up button */}
                    {canUpvote && (
                      <button
                        onClick={() => doVote(votedUp ? 'clear' : 'upvote')}
                        aria-label={`Upvote (${up})`}
                        aria-pressed={votedUp}
                        style={voteClusterBtn(votedUp, false)}
                      >
                        <ChevronUp active={votedUp} />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: votedUp ? 700 : 500,
                            color: votedUp ? '#1a7a4a' : 'var(--dim, #666)',
                            letterSpacing: '-0.01em',
                            fontVariantNumeric: 'tabular-nums',
                            transition: 'color 0.15s ease',
                          }}
                        >
                          {up}
                        </span>
                      </button>
                    )}
                    {/* Net score — display only, never a button */}
                    <div
                      title={`${up} up · ${down} down`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 10px',
                        borderLeft: canUpvote ? '1px solid var(--border, #e5e5e5)' : 'none',
                        borderRight: canDownvote ? '1px solid var(--border, #e5e5e5)' : 'none',
                        minWidth: 32,
                        userSelect: 'none',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: net > 0 ? '#1a7a4a' : net < 0 ? '#b94040' : 'var(--dim, #999)',
                          letterSpacing: '-0.02em',
                          lineHeight: 1,
                          fontVariantNumeric: 'tabular-nums',
                          transition: 'color 0.15s ease',
                        }}
                      >
                        {net > 0 ? '+' : ''}{net}
                      </span>
                    </div>
                    {/* Down button */}
                    {canDownvote && (
                      <button
                        onClick={() => doVote(votedDown ? 'clear' : 'downvote')}
                        aria-label={`Downvote (${down})`}
                        aria-pressed={votedDown}
                        style={voteClusterBtn(votedDown, true)}
                      >
                        <ChevronDown active={votedDown} />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: votedDown ? 700 : 500,
                            color: votedDown ? '#b94040' : 'var(--dim, #666)',
                            letterSpacing: '-0.01em',
                            fontVariantNumeric: 'tabular-nums',
                            transition: 'color 0.15s ease',
                          }}
                        >
                          {down}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {canReply && commentDepth < commentMaxDepth && (
                <button
                  onClick={() => setReplyOpen((v) => !v)}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '6px 8px',
                    borderRadius: 6,
                    minHeight: 44,
                    minWidth: 44,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--dim, #666)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  Reply
                </button>
              )}

              {canContextTag && (
                <button
                  onClick={() => setTagsOpen((v) => !v)}
                  title="Tag this comment"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '6px 8px',
                    borderRadius: 6,
                    minHeight: 44,
                    minWidth: 44,
                    border: 'none',
                    background: tagsOpen || hasAnyTag ? 'rgba(17,17,17,0.07)' : 'transparent',
                    color: tagsOpen ? 'var(--accent, #111)' : hasAnyTag ? 'var(--accent, #111)' : 'var(--dim, #666)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  #
                </button>
              )}

              <div ref={menuRef} style={{ marginLeft: 'auto', position: 'relative' }}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--dim, #666)',
                    cursor: 'pointer',
                    fontSize: 16,
                    padding: '8px 12px',
                    minHeight: 44,
                    minWidth: 44,
                    touchAction: 'manipulation',
                  }}
                >
                  \u22ef
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
                          <MenuItem
                            onClick={() => {
                              setMenuOpen(false);
                              setEditing(true);
                            }}
                          >
                            Edit
                          </MenuItem>
                        )}
                        {canDeleteOwn && (
                          <MenuItem
                            danger
                            onClick={() => {
                              setMenuOpen(false);
                              onDelete(comment.id);
                            }}
                          >
                            Delete
                          </MenuItem>
                        )}
                      </>
                    ) : (
                      <>
                        {canReport && currentUserVerified && (
                          <MenuItem
                            onClick={() => {
                              setMenuOpen(false);
                              onReport(comment.id);
                            }}
                          >
                            Report
                          </MenuItem>
                        )}
                        {canBlockUser && (
                          <MenuItem
                            onClick={() => {
                              setMenuOpen(false);
                              onBlock(comment.user_id);
                            }}
                          >
                            Block user
                          </MenuItem>
                        )}
                        {viewerIsSupervisor && onFlag && (
                          <MenuItem
                            onClick={() => {
                              setMenuOpen(false);
                              onFlag(comment.id);
                            }}
                          >
                            Supervisor flag
                          </MenuItem>
                        )}
                        {viewerIsModerator && onHide && (
                          <MenuItem
                            danger
                            onClick={() => {
                              setMenuOpen(false);
                              onHide(comment.id);
                            }}
                          >
                            Hide (mod)
                          </MenuItem>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              </div>

              {/* Tag chip strip — revealed by # toggle */}
              {canContextTag && tagsOpen && (
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    overflowX: 'auto',
                    paddingBottom: 4,
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    marginTop: 8,
                  }}
                >
                  {tagKinds.map((kind) => {
                    const meta = TAG_META[kind];
                    const cast = !!comment._your_tags?.has(kind);
                    let count: number | undefined;
                    if (kind === 'context') count = comment.context_tag_count ?? 0;
                    else if (kind === 'helpful') count = comment.helpful_count ?? 0;
                    const showCount = typeof count === 'number' && count >= 1;
                    const busyThis = busy === `tag:${kind}`;
                    return (
                      <button
                        key={kind}
                        onClick={() => doTag(kind)}
                        disabled={busyThis}
                        aria-pressed={cast}
                        aria-label={`Tag ${meta.label}${showCount ? ` (${count})` : ''}`}
                        style={{
                          flexShrink: 0,
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: 10,
                          minHeight: 28,
                          border: `1px solid ${cast ? meta.color : 'var(--border, #e5e5e5)'}`,
                          background: cast ? `${meta.color}1f` : 'transparent',
                          color: cast ? meta.color : 'var(--dim, #666)',
                          cursor: busyThis ? 'default' : 'pointer',
                          opacity: busyThis ? 0.6 : 1,
                          touchAction: 'manipulation',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {meta.label}
                        {showCount ? ` ${count}` : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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

// Vote cluster button — left (up) or right (down) cell of the pill.
// Active state: colored background fill + no border-radius (the outer pill
// provides rounding). The fill is intentionally light (alpha 0x18) so it
// reads as "confirmed" without screaming.
function voteClusterBtn(active: boolean, isDown: boolean): CSSProperties {
  const hue = isDown ? '#b94040' : '#1a7a4a';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    // Horizontal padding gives the 44px tap area together with the icon+number.
    // minWidth ensures the tap target even at count=0.
    padding: '0 10px',
    minHeight: 44,
    minWidth: 44,
    border: 'none',
    borderRadius: 0,
    background: active ? `${hue}18` : 'transparent',
    cursor: 'pointer',
    touchAction: 'manipulation',
    transition: 'background 0.15s ease',
    WebkitTapHighlightColor: 'transparent',
  };
}

// Chevron icons as inline SVG — no library dependency.
// Stroke width 1.75 keeps them crisp at small sizes without looking heavy.
function ChevronUp({ active }: { active: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, transition: 'stroke 0.15s ease' }}
    >
      <polyline
        points="2,8 6,4 10,8"
        stroke={active ? '#1a7a4a' : 'var(--dim, #666)'}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDown({ active }: { active: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, transition: 'stroke 0.15s ease' }}
    >
      <polyline
        points="2,4 6,8 10,4"
        stroke={active ? '#b94040' : 'var(--dim, #666)'}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
        color: danger ? '#dc2626' : 'var(--white, #111)',
        cursor: 'pointer',
        borderRadius: 6,
      }}
    >
      {children}
    </button>
  );
}
