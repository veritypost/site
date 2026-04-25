// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
'use client';
import { useState, useEffect, useRef, CSSProperties, ReactNode } from 'react';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import CommentComposer from './CommentComposer';
import { hasPermission } from '@/lib/permissions';
import { MENTION_RE } from '@/lib/mentions';
import type { Database } from '@/types/database';

type CommentRowDb = Database['public']['Tables']['comments']['Row'];

type CommentUser = {
  id?: string;
  username?: string;
  avatar_url?: string | null;
  avatar_color?: string | null;
  is_verified_public_figure?: boolean;
  is_expert?: boolean;
};

type Mention = { user_id?: string; username: string };

// Ext-E4 — mirrors the server-side `comment_max_depth` setting
// (schema/033 sets it to 2; the post_comment RPC reads `_setting_int(
// 'comment_max_depth', 3)` and rejects v_depth > max). Hoisting here
// so the literal is named + traceable. If the DB setting changes,
// update this constant in the same change. Future: fetch from a
// `/api/settings/public` shim instead of mirroring.
const COMMENT_MAX_DEPTH = 2;

export type EnrichedComment = CommentRowDb & {
  users?: CommentUser;
  _your_vote?: 'upvote' | 'downvote' | null | undefined;
  _you_tagged?: boolean;
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
  onVote: (commentId: string, type: VoteType) => void | Promise<void>;
  onToggleTag: (commentId: string) => void | Promise<void>;
  onDelete: (commentId: string) => void;
  onEdit: (commentId: string, body: string) => void | Promise<void>;
  onReport: (commentId: string) => void;
  onBlock: (userId: string) => void;
  onFlag?: (commentId: string) => void;
  onHide?: (commentId: string) => void;
  onReplied?: (comment: CommentRowDb | null) => void;
  depth?: number;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

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
          href={`/u/${name}`}
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
  async function doTag() {
    if (busy) return;
    setBusy('tag');
    try {
      await onToggleTag(comment.id);
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

  return (
    <div
      style={{
        padding: '12px 0',
        borderBottom: depth === 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
        marginLeft: depth > 0 ? 24 : 0,
        borderLeft: depth > 0 ? '2px solid var(--border, #e5e5e5)' : 'none',
        paddingLeft: depth > 0 ? 12 : 0,
      }}
    >
      {comment.is_context_pinned && (
        <div
          style={{ fontSize: 11, color: 'var(--accent, #111)', fontWeight: 700, marginBottom: 6 }}
        >
          Pinned as Article Context
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Avatar user={user} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 3,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--white, #111)' }}>
              {user.username || 'user'}
            </span>
            <VerifiedBadge user={user} />
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
            {comment.is_expert_reply && (
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(34,197,94,0.12)',
                  color: '#16a34a',
                  fontWeight: 600,
                }}
              >
                Expert
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--dim, #666)', marginLeft: 'auto' }}>
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
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  onClick={doSaveEdit}
                  disabled={busy === 'edit' || !editBody.trim()}
                  style={{
                    fontSize: 12,
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent, #111)',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
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
          ) : (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: 'var(--soft, #333)',
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                flexWrap: 'wrap',
              }}
            >
              {canUpvote && (
                <button
                  onClick={() => doVote(yourVote === 'upvote' ? 'clear' : 'upvote')}
                  style={voteBtn(yourVote === 'upvote')}
                >
                  Up {comment.upvote_count || 0}
                </button>
              )}
              {canDownvote && (
                <button
                  onClick={() => doVote(yourVote === 'downvote' ? 'clear' : 'downvote')}
                  style={voteBtn(yourVote === 'downvote', true)}
                >
                  Down {comment.downvote_count || 0}
                </button>
              )}

              {canContextTag && (
                <button
                  onClick={doTag}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '10px 12px',
                    borderRadius: 14,
                    minHeight: 44,
                    minWidth: 44,
                    border: `1px solid ${comment._you_tagged ? 'var(--accent, #111)' : 'var(--border, #e5e5e5)'}`,
                    background: comment._you_tagged ? 'rgba(17,17,17,0.06)' : 'transparent',
                    color: comment._you_tagged ? 'var(--accent, #111)' : 'var(--dim, #666)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  Context \u00b7 {comment.context_tag_count || 0}
                </button>
              )}

              {canReply && commentDepth < COMMENT_MAX_DEPTH && (
                <button
                  onClick={() => setReplyOpen((v) => !v)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '10px 12px',
                    borderRadius: 14,
                    minHeight: 44,
                    minWidth: 44,
                    border: '1px solid var(--border, #e5e5e5)',
                    background: 'transparent',
                    color: 'var(--dim, #666)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  Reply
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
                    fontSize: 14,
                    padding: '10px 12px',
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

function voteBtn(active: boolean, isDown = false): CSSProperties {
  const color = active ? (isDown ? '#dc2626' : '#16a34a') : 'var(--dim, #666)';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '10px 12px',
    borderRadius: 14,
    minHeight: 44,
    minWidth: 44,
    border: `1px solid ${active ? color : 'var(--border, #e5e5e5)'}`,
    background: active ? `${color}12` : 'transparent',
    color,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    touchAction: 'manipulation',
  };
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
        padding: '6px 10px',
        fontSize: 12,
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
