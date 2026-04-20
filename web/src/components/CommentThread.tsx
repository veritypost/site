// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
'use client';
import { useState, useEffect, useCallback, useRef, CSSProperties, ReactNode } from 'react';
import { createClient } from '../lib/supabase/client';
import CommentComposer from './CommentComposer';
import CommentRow, { EnrichedComment } from './CommentRow';
import { useFocusTrap } from '../lib/useFocusTrap';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { MOD_ROLES } from '@/lib/roles';
import type { Database } from '@/types/database';

type CommentDb = Database['public']['Tables']['comments']['Row'];

type CommentWithAuthor = CommentDb & {
  users?: {
    id?: string;
    username?: string;
    avatar_url?: string | null;
    avatar_color?: string | null;
    is_verified_public_figure?: boolean;
    is_expert?: boolean;
  };
};

interface CommentThreadProps {
  articleId: string;
  articleCategoryId?: string | null;
  currentUserId?: string | null;
  currentUserTier?: string;
}

type DialogAction = 'delete' | 'report' | 'flag' | 'hide' | 'block';

type DialogState = {
  action: DialogAction;
  reason: string;
  description: string;
  submitting: boolean;
  commentId?: string;
  targetUserId?: string;
} | null;

type VoteType = 'upvote' | 'downvote' | 'clear';

export default function CommentThread({
  articleId,
  articleCategoryId,
  currentUserId,
  currentUserTier,
}: CommentThreadProps) {
  const supabase = createClient();
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [authorScores, setAuthorScores] = useState<Record<string, number>>({});
  const [yourVotes, setYourVotes] = useState<Record<string, 'upvote' | 'downvote' | undefined>>({});
  const [yourTags, setYourTags] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [viewerIsSupervisor, setViewerIsSupervisor] = useState<boolean>(false);
  const [viewerIsModerator, setViewerIsModerator] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [permsLoaded, setPermsLoaded] = useState<boolean>(false);

  const canViewSection = permsLoaded ? hasPermission('comments.section.view') : true;
  const canViewScore = permsLoaded ? hasPermission('comments.score.view_subcategory') : false;
  const canSubscribe = permsLoaded ? hasPermission('comments.realtime.subscribe') : false;
  const canAskExpert = permsLoaded ? hasPermission('expert.ask') : false;

  useEffect(() => {
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      setPermsLoaded(true);
    })();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: rows, error: loadErr } = await supabase
      .from('comments')
      .select('*, users!user_id(id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert)')
      .eq('article_id', articleId)
      .eq('status', 'visible')
      .is('deleted_at', null)
      .order('is_context_pinned', { ascending: false })
      .order('upvote_count', { ascending: false })
      .order('created_at', { ascending: true });
    if (loadErr) { setError(loadErr.message); setLoading(false); return; }
    const rowsSafe = (rows || []) as CommentWithAuthor[];
    setComments(rowsSafe);

    const userIds = Array.from(new Set(rowsSafe.map((c) => c.user_id).filter(Boolean)));
    const commentIds = rowsSafe.map((c) => c.id);

    if (currentUserId) {
      if (commentIds.length > 0) {
        const { data: v } = await supabase
          .from('comment_votes')
          .select('comment_id, vote_type')
          .eq('user_id', currentUserId)
          .in('comment_id', commentIds);
        const votes: Record<string, 'upvote' | 'downvote' | undefined> = {};
        (v || []).forEach((row) => { votes[row.comment_id] = row.vote_type as 'upvote' | 'downvote'; });
        setYourVotes(votes);

        const { data: t } = await supabase
          .from('comment_context_tags')
          .select('comment_id')
          .eq('user_id', currentUserId)
          .in('comment_id', commentIds);
        setYourTags(new Set((t || []).map((r) => r.comment_id)));
      }

      const { data: b } = await supabase
        .from('blocked_users')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`);
      const blocks = new Set<string>();
      (b || []).forEach((row) => {
        if (row.blocker_id === currentUserId) blocks.add(row.blocked_id);
        if (row.blocked_id === currentUserId) blocks.add(row.blocker_id);
      });
      setBlockedIds(blocks);
    }

    if (currentUserId && articleCategoryId) {
      const { data: sup } = await supabase.rpc('user_is_supervisor_in', {
        p_user_id: currentUserId, p_category_id: articleCategoryId,
      });
      setViewerIsSupervisor(!!sup);
    }
    if (currentUserId) {
      const { data: roleRows } = await supabase
        .from('user_roles').select('roles(name)').eq('user_id', currentUserId);
      const names = ((roleRows || []) as Array<{ roles: { name?: string } | null }>)
        .map((r) => r.roles?.name).filter((n): n is string => !!n);
      setViewerIsModerator(names.some((n) => MOD_ROLES.has(n)));
    }

    if (canViewScore && articleCategoryId && userIds.length > 0) {
      const { data: s } = await supabase
        .from('category_scores')
        .select('user_id, score')
        .eq('category_id', articleCategoryId)
        .in('user_id', userIds);
      const map: Record<string, number> = {};
      (s || []).forEach((r) => { if (r.user_id != null && r.score != null) map[r.user_id] = r.score; });
      setAuthorScores(map);
    }

    setLoading(false);
  }, [articleId, articleCategoryId, currentUserId, canViewScore, supabase]);

  useEffect(() => {
    if (!permsLoaded) return;
    loadAll();
  }, [loadAll, permsLoaded]);

  useEffect(() => {
    if (!articleId || !canSubscribe) return;
    let cancelled = false;
    const channelName = `article-comments:${articleId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes' as never, {
        event: 'INSERT', schema: 'public', table: 'comments',
        filter: `article_id=eq.${articleId}`,
      }, async (payload: { new: CommentDb }) => {
        if (payload.new.status && payload.new.status !== 'visible') return;
        const { data } = await supabase
          .from('comments')
          .select('*, users!user_id(id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert)')
          .eq('id', payload.new.id)
          .maybeSingle();
        if (cancelled) return;
        if (data) setComments((prev) => prev.find((c) => c.id === data.id) ? prev : [...prev, data as CommentWithAuthor]);
      })
      .on('postgres_changes' as never, {
        event: 'UPDATE', schema: 'public', table: 'comments',
        filter: `article_id=eq.${articleId}`,
      }, async (payload: { new: CommentDb }) => {
        if (cancelled) return;
        if (payload.new.status && payload.new.status !== 'visible') {
          setComments((prev) => prev.filter((c) => c.id !== payload.new.id));
          return;
        }
        const id = payload.new.id;
        let alreadyPresent = false;
        setComments((prev) => {
          alreadyPresent = !!prev.find((c) => c.id === id);
          return alreadyPresent
            ? prev.map((c) => c.id === id ? { ...c, ...payload.new } : c)
            : prev;
        });
        if (!alreadyPresent) {
          const { data } = await supabase
            .from('comments')
            .select('*, users!user_id(id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert)')
            .eq('id', id)
            .maybeSingle();
          if (cancelled) return;
          if (data) setComments((prev) => prev.find((c) => c.id === id) ? prev : [...prev, data as CommentWithAuthor]);
        }
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [articleId, canSubscribe, supabase]);

  async function handleVote(commentId: string, type: VoteType) {
    const res = await fetch(`/api/comments/${commentId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Vote failed'); return; }
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, upvote_count: data.up, downvote_count: data.down } : c));
    setYourVotes((prev) => ({ ...prev, [commentId]: data.your_vote || undefined }));
  }

  async function handleToggleTag(commentId: string) {
    const res = await fetch(`/api/comments/${commentId}/context-tag`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Tag failed'); return; }
    setComments((prev) => prev.map((c) => c.id === commentId ? {
      ...c,
      context_tag_count: data.count,
      is_context_pinned: data.is_pinned,
      context_pinned_at: data.is_pinned ? (c.context_pinned_at || new Date().toISOString()) : c.context_pinned_at,
    } : c));
    setYourTags((prev) => {
      const next = new Set(prev);
      if (data.tagged) next.add(commentId); else next.delete(commentId);
      return next;
    });
  }

  async function handleEdit(commentId: string, body: string) {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Edit failed'); return; }
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, body, is_edited: true } : c));
  }

  const [dialog, setDialog] = useState<DialogState>(null);
  const [flashMessage, setFlashMessage] = useState<string>('');

  const openDialog = (action: DialogAction, payload: Partial<NonNullable<DialogState>> = {}) =>
    setDialog({ action, reason: '', description: '', submitting: false, ...payload });
  const closeDialog = () => setDialog(null);
  const updateDialog = (patch: Partial<NonNullable<DialogState>>) =>
    setDialog((prev) => prev ? { ...prev, ...patch } : prev);

  function handleDelete(commentId: string) { openDialog('delete', { commentId }); }
  function handleReport(commentId: string) { openDialog('report', { commentId }); }
  function handleFlag(commentId: string) { openDialog('flag', { commentId }); }
  function handleHide(commentId: string) { openDialog('hide', { commentId }); }
  function handleBlock(targetUserId: string) { openDialog('block', { targetUserId }); }

  async function runDialogAction() {
    if (!dialog) return;
    updateDialog({ submitting: true });
    try {
      if (dialog.action === 'delete' && dialog.commentId) {
        const res = await fetch(`/api/comments/${dialog.commentId}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Delete failed'); return; }
        setComments((prev) => prev.map((c) => c.id === dialog.commentId ? { ...c, body: '[deleted]', status: 'deleted', deleted_at: new Date().toISOString() } : c));
        closeDialog();
        return;
      }
      if (dialog.action === 'report' && dialog.commentId) {
        const res = await fetch(`/api/comments/${dialog.commentId}/report`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: dialog.reason, description: dialog.description }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Report failed'); return; }
        closeDialog();
        setFlashMessage('Thanks \u2014 our team will review it.');
        setTimeout(() => setFlashMessage(''), 3000);
        return;
      }
      if (dialog.action === 'flag' && dialog.commentId) {
        const res = await fetch(`/api/comments/${dialog.commentId}/flag`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category_id: articleCategoryId, reason: dialog.reason.trim(), description: dialog.description }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(data?.error || 'Flag failed'); return; }
        closeDialog();
        setFlashMessage('Flagged \u2014 moderators will review it.');
        setTimeout(() => setFlashMessage(''), 3000);
        return;
      }
      if (dialog.action === 'hide' && dialog.commentId) {
        const res = await fetch(`/api/admin/moderation/comments/${dialog.commentId}/hide`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: dialog.reason || 'moderator action' }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Hide failed'); return; }
        setComments((prev) => prev.filter((c) => c.id !== dialog.commentId));
        closeDialog();
        return;
      }
      if (dialog.action === 'block' && dialog.targetUserId) {
        const res = await fetch(`/api/users/${dialog.targetUserId}/block`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) { setError(data?.error || 'Block failed'); return; }
        if (data.blocked) {
          setBlockedIds((prev) => new Set([...prev, dialog.targetUserId as string]));
        } else {
          setBlockedIds((prev) => { const n = new Set(prev); n.delete(dialog.targetUserId as string); return n; });
        }
        closeDialog();
      }
    } finally {
      updateDialog({ submitting: false });
    }
  }

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(!!dialog, dialogRef, { onEscape: closeDialog });

  function handlePosted(comment: CommentDb | null) {
    if (!comment) return;
    setComments((prev) => prev.find((c) => c.id === comment.id) ? prev : [...prev, comment as CommentWithAuthor]);
  }

  const [expertDialogOpen, setExpertDialogOpen] = useState<boolean>(false);
  const [expertQuestion, setExpertQuestion] = useState<string>('');
  const [expertSubmitting, setExpertSubmitting] = useState<boolean>(false);

  async function submitExpertQuestion() {
    const body = expertQuestion.trim();
    if (!body || !articleCategoryId) return;
    setExpertSubmitting(true);
    try {
      const res = await fetch('/api/expert/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: articleId,
          body,
          target_type: 'category',
          target_id: articleCategoryId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Ask failed');
      setExpertQuestion('');
      setExpertDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask failed');
    } finally {
      setExpertSubmitting(false);
    }
  }

  if (!permsLoaded) {
    return <div style={{ color: 'var(--dim, #666)', fontSize: 13, padding: 12 }}>Loading discussion\u2026</div>;
  }

  if (!canViewSection) return null;

  if (loading) {
    return <div style={{ color: 'var(--dim, #666)', fontSize: 13, padding: 12 }}>Loading discussion\u2026</div>;
  }

  const visible = comments.filter((c) => !blockedIds.has(c.user_id));
  const tops = visible.filter((c) => !c.parent_id);
  const childrenByParent: Record<string, CommentWithAuthor[]> = {};
  visible.filter((c) => c.parent_id).forEach((c) => {
    const pid = c.parent_id as string;
    (childrenByParent[pid] ||= []).push(c);
  });

  const renderWithReplies = (c: CommentWithAuthor, depth = 0): ReactNode => {
    const kids = (childrenByParent[c.id] || []).map((child) => renderWithReplies(child, depth + 1));
    const enriched: EnrichedComment = {
      ...c,
      _your_vote: yourVotes[c.id],
      _you_tagged: yourTags.has(c.id),
    };
    return (
      <CommentRow
        key={c.id}
        comment={enriched}
        replies={kids as ReactNode[]}
        currentUserId={currentUserId}
        currentUserTier={currentUserTier}
        authorCategoryScore={canViewScore ? authorScores[c.user_id] : null}
        articleId={articleId}
        depth={depth}
        viewerIsSupervisor={viewerIsSupervisor}
        viewerIsModerator={viewerIsModerator}
        onVote={handleVote}
        onToggleTag={handleToggleTag}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReport={handleReport}
        onBlock={handleBlock}
        onFlag={handleFlag}
        onHide={handleHide}
        onReplied={handlePosted}
      />
    );
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: 'var(--dim, #666)', marginBottom: 12 }}>
        Discussion \u00b7 {visible.length}
      </div>

      {currentUserId && (
        <CommentComposer
          articleId={articleId}
          currentUserTier={currentUserTier}
          onPosted={handlePosted}
        />
      )}

      {currentUserId && canAskExpert && !expertDialogOpen && (
        <button onClick={() => setExpertDialogOpen(true)} style={askExpertBtnStyle}>+ Ask an Expert</button>
      )}

      {expertDialogOpen && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>Ask an Expert \u2014 routes to the category queue</div>
          <textarea
            value={expertQuestion}
            onChange={(e) => setExpertQuestion(e.target.value)}
            rows={3}
            placeholder="Frame a specific question an expert can answer."
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={submitExpertQuestion} disabled={!expertQuestion.trim() || expertSubmitting} style={{
              padding: '6px 14px', borderRadius: 7, border: 'none',
              background: expertQuestion.trim() && !expertSubmitting ? '#111' : '#ccc',
              color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: expertQuestion.trim() && !expertSubmitting ? 'pointer' : 'default',
            }}>{expertSubmitting ? 'Sending\u2026' : 'Send to queue'}</button>
            <button onClick={() => { setExpertDialogOpen(false); setExpertQuestion(''); }} style={{
              padding: '6px 14px', borderRadius: 7, border: '1px solid #e5e5e5', background: 'transparent', color: '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      {flashMessage && (
        <div style={{ fontSize: 12, color: '#166534', background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
          {flashMessage}
        </div>
      )}

      {dialog && (
        <div style={overlayStyle} onClick={closeDialog}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="comment-dialog-title"
            onClick={(e) => e.stopPropagation()}
            style={dialogStyle}
          >
            <div id="comment-dialog-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
              {dialog.action === 'delete' && 'Delete this comment?'}
              {dialog.action === 'report' && 'Report this comment'}
              {dialog.action === 'flag' && 'Flag this comment'}
              {dialog.action === 'hide' && 'Hide this comment'}
              {dialog.action === 'block' && 'Block this user?'}
            </div>

            {dialog.action === 'delete' && (
              <p style={{ fontSize: 13, color: 'var(--dim, #666)', margin: '0 0 14px 0' }}>
                The comment will be replaced with a removed marker. This can&apos;t be undone.
              </p>
            )}
            {dialog.action === 'block' && (
              <p style={{ fontSize: 13, color: 'var(--dim, #666)', margin: '0 0 14px 0' }}>
                You won&apos;t see their comments and they won&apos;t see yours.
              </p>
            )}

            {(dialog.action === 'report' || dialog.action === 'flag' || dialog.action === 'hide') && (
              <>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--dim, #666)', textTransform: 'uppercase', marginBottom: 4 }}>Reason</label>
                <input
                  autoFocus
                  value={dialog.reason}
                  onChange={(e) => updateDialog({ reason: e.target.value })}
                  placeholder={dialog.action === 'hide' ? 'moderator action' : 'e.g. harassment, spam, misinformation'}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
                />
                {dialog.action !== 'hide' && (
                  <>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--dim, #666)', textTransform: 'uppercase', marginBottom: 4 }}>Context (optional)</label>
                    <textarea
                      value={dialog.description}
                      onChange={(e) => updateDialog({ description: e.target.value })}
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box', resize: 'vertical' }}
                    />
                  </>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={closeDialog} style={{
                padding: '7px 14px', borderRadius: 8,
                border: '1px solid var(--border, #e5e5e5)', background: 'transparent',
                fontSize: 12, cursor: 'pointer', color: 'var(--dim, #666)', fontFamily: 'inherit',
              }}>Cancel</button>
              <button
                onClick={runDialogAction}
                disabled={dialog.submitting || ((dialog.action === 'report' || dialog.action === 'flag') && !dialog.reason.trim())}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none',
                  background: dialog.action === 'delete' || dialog.action === 'block' ? '#dc2626' : 'var(--accent, #111)',
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: dialog.submitting ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {dialog.submitting ? 'Working\u2026'
                  : dialog.action === 'delete' ? 'Delete'
                  : dialog.action === 'block' ? 'Block'
                  : dialog.action === 'hide' ? 'Hide'
                  : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tops.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--dim, #666)', textAlign: 'center', padding: '30px 0' }}>
          No comments yet \u2014 be the first.
        </div>
      ) : (
        tops.map((c) => renderWithReplies(c))
      )}
    </div>
  );
}

const askExpertBtnStyle: CSSProperties = {
  display: 'inline-block', padding: '8px 14px', borderRadius: 8,
  border: '1px dashed var(--border, #e5e5e5)', background: 'transparent',
  color: 'var(--accent, #111)', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', marginBottom: 16,
};
const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.85)',
  zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const dialogStyle: CSSProperties = {
  background: 'var(--card, #fff)', border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 12, padding: 18, width: '90%', maxWidth: 420,
  color: 'var(--white, #111)',
};
