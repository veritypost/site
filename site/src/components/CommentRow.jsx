'use client';
import { useState, useEffect, useRef } from 'react';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import CommentComposer from './CommentComposer';
import { isPaidTier } from '@/lib/tiers';
import { MENTION_RE } from '@/lib/mentions';

// One comment + its immediate reply tree (rendered via children prop).
// The parent (CommentThread) passes in `replies` to keep this dumb.

function timeAgo(iso) {
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

function renderBody(body, mentions = []) {
  // Highlight resolved @mentions only. Free-tier raw @text passes through.
  const resolved = new Set((mentions || []).map(m => m.username));
  const parts = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const [full, name] = match;
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index));
    if (resolved.has(name)) {
      parts.push(
        <a key={match.index} href={`/u/${name}`} style={{ color: 'var(--accent, #111)', fontWeight: 600, textDecoration: 'none' }}>@{name}</a>
      );
    } else {
      parts.push(full);
    }
    lastIndex = match.index + full.length;
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
  authorCategoryScore,      // D7: subcategory/category score for this commenter
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
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body || '');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
    };
  }, [menuOpen]);
  const [busy, setBusy] = useState('');

  const viewerIsPaid = isPaidTier(currentUserTier);
  const isOwner = currentUserId && comment.user_id === currentUserId;
  const isDeleted = comment.status === 'deleted' || !!comment.deleted_at;
  const user = comment.users || {};

  // D20 display: expert replies blurred for free viewers.
  const blurred = comment.is_expert_reply && !viewerIsPaid;

  async function doVote(type) {
    if (busy) return;
    setBusy('vote');
    try { await onVote(comment.id, type); } finally { setBusy(''); }
  }
  async function doTag() {
    if (busy) return;
    setBusy('tag');
    try { await onToggleTag(comment.id); } finally { setBusy(''); }
  }
  async function doSaveEdit() {
    if (!editBody.trim() || busy) return;
    setBusy('edit');
    try {
      await onEdit(comment.id, editBody.trim());
      setEditing(false);
    } finally { setBusy(''); }
  }

  const yourVote = comment._your_vote;

  return (
    <div style={{
      padding: '12px 0',
      borderBottom: depth === 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
      marginLeft: depth > 0 ? 24 : 0,
      borderLeft: depth > 0 ? '2px solid var(--border, #e5e5e5)' : 'none',
      paddingLeft: depth > 0 ? 12 : 0,
    }}>
      {comment.is_context_pinned && (
        <div style={{ fontSize: 11, color: 'var(--accent, #111)', fontWeight: 700, marginBottom: 6 }}>
          Pinned as Article Context
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Avatar user={user} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--white, #111)' }}>{user.username || 'user'}</span>
            <VerifiedBadge user={user} />
            {viewerIsPaid && authorCategoryScore != null && (
              <span title="Verity Score in this category" style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                background: 'rgba(17,17,17,0.08)', color: 'var(--accent, #111)',
              }}>VS {authorCategoryScore}</span>
            )}
            {comment.is_expert_reply && (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontWeight: 600,
              }}>Expert</span>
            )}
            <span style={{ fontSize: 10, color: 'var(--dim, #666)', marginLeft: 'auto' }}>
              {timeAgo(comment.created_at)}{comment.is_edited ? ' · edited' : ''}
            </span>
          </div>

          {editing ? (
            <div>
              <textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={doSaveEdit} disabled={busy === 'edit' || !editBody.trim()} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: 'none', background: 'var(--accent, #111)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                <button onClick={() => { setEditing(false); setEditBody(comment.body); }} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{
              fontSize: 14, lineHeight: 1.55, color: 'var(--soft, #333)',
              filter: blurred ? 'blur(6px)' : 'none',
              userSelect: blurred ? 'none' : 'auto',
              pointerEvents: blurred ? 'none' : 'auto',
            }}>
              {renderBody(comment.body || '', comment.mentions || [])}
            </div>
          )}
          {blurred && (
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--dim, #666)' }}>
              Expert response —{' '}
              <a href="/profile/settings/billing" style={{ color: 'var(--accent, #111)', fontWeight: 600 }}>
                available on paid plans
              </a>
            </div>
          )}

          {!isDeleted && !editing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {/* D29: separate upvote / downvote counts */}
              <button
                onClick={() => doVote(yourVote === 'upvote' ? 'clear' : 'upvote')}
                style={voteBtn(yourVote === 'upvote')}
              >Up {comment.upvote_count || 0}</button>
              <button
                onClick={() => doVote(yourVote === 'downvote' ? 'clear' : 'downvote')}
                style={voteBtn(yourVote === 'downvote', true)}
              >Down {comment.downvote_count || 0}</button>

              {/* D15/D16: Article Context tag. Pass 17 / UJ-601-605 touch-target lift. */}
              <button onClick={doTag} style={{
                fontSize: 11, fontWeight: 600, padding: '10px 12px', borderRadius: 14, minHeight: 44, minWidth: 44,
                border: `1px solid ${comment._you_tagged ? 'var(--accent, #111)' : 'var(--border, #e5e5e5)'}`,
                background: comment._you_tagged ? 'rgba(17,17,17,0.06)' : 'transparent',
                color: comment._you_tagged ? 'var(--accent, #111)' : 'var(--dim, #666)',
                cursor: 'pointer', touchAction: 'manipulation',
              }}>Context · {comment.context_tag_count || 0}</button>

              {(comment.thread_depth ?? depth) < 2 && (
                <button onClick={() => setReplyOpen(v => !v)} style={{
                  fontSize: 11, fontWeight: 600, padding: '10px 12px', borderRadius: 14, minHeight: 44, minWidth: 44,
                  border: '1px solid var(--border, #e5e5e5)', background: 'transparent',
                  color: 'var(--dim, #666)', cursor: 'pointer', touchAction: 'manipulation',
                }}>Reply</button>
              )}

              <div ref={menuRef} style={{ marginLeft: 'auto', position: 'relative' }}>
                <button onClick={() => setMenuOpen(v => !v)} aria-label="More options" aria-haspopup="menu" aria-expanded={menuOpen} style={{ background: 'none', border: 'none', color: 'var(--dim, #666)', cursor: 'pointer', fontSize: 14, padding: '10px 12px', minHeight: 44, minWidth: 44, touchAction: 'manipulation' }}>⋯</button>
                {menuOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', zIndex: 10,
                    background: '#fff', border: '1px solid var(--border, #e5e5e5)',
                    borderRadius: 8, boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
                    minWidth: 140, padding: 4,
                  }}>
                    {isOwner ? (
                      <>
                        <MenuItem onClick={() => { setMenuOpen(false); setEditing(true); }}>Edit</MenuItem>
                        <MenuItem danger onClick={() => { setMenuOpen(false); onDelete(comment.id); }}>Delete</MenuItem>
                      </>
                    ) : (
                      <>
                        {/* Pass 17 / UJ-607: hide Report entry for
                          * unverified accounts — reporting requires an
                          * identifiable actor. Block remains available. */}
                        {currentUserVerified && (
                          <MenuItem onClick={() => { setMenuOpen(false); onReport(comment.id); }}>Report</MenuItem>
                        )}
                        <MenuItem onClick={() => { setMenuOpen(false); onBlock(comment.user_id); }}>Block user</MenuItem>
                        {viewerIsSupervisor && onFlag && (
                          <MenuItem onClick={() => { setMenuOpen(false); onFlag(comment.id); }}>
                            Supervisor flag
                          </MenuItem>
                        )}
                        {viewerIsModerator && onHide && (
                          <MenuItem danger onClick={() => { setMenuOpen(false); onHide(comment.id); }}>
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

          {replyOpen && (
            <div style={{ marginTop: 10 }}>
              <CommentComposer
                articleId={articleId}
                parentId={comment.id}
                currentUserTier={currentUserTier}
                onPosted={(c) => { setReplyOpen(false); onReplied?.(c); }}
                onCancel={() => setReplyOpen(false)}
                autoFocus
              />
            </div>
          )}

          {replies.map(r => r)}
        </div>
      </div>
    </div>
  );
}

function voteBtn(active, isDown = false) {
  const color = active ? (isDown ? '#dc2626' : '#16a34a') : 'var(--dim, #666)';
  return {
    // Pass 17 / UJ-601-605: meet the 44×44 minimum HIG touch target on
    // mobile. Vertical padding lifted to ensure the hit area stays ≥ 44px
    // without inflating the visual pill size noticeably on desktop.
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '10px 12px', borderRadius: 14, minHeight: 44, minWidth: 44,
    border: `1px solid ${active ? color : 'var(--border, #e5e5e5)'}`,
    background: active ? `${color}12` : 'transparent',
    color, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    touchAction: 'manipulation',
  };
}

function MenuItem({ children, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '6px 10px', fontSize: 12,
      background: 'transparent', border: 'none',
      color: danger ? '#dc2626' : 'var(--white, #111)',
      cursor: 'pointer', borderRadius: 6,
    }}>{children}</button>
  );
}
