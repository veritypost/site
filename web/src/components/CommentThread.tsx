'use client';
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  CSSProperties,
  Fragment,
  ReactNode,
} from 'react';
import { createClient } from '../lib/supabase/client';
import CommentComposer from './CommentComposer';
import CommentRow, { EnrichedComment } from './CommentRow';
import { useFocusTrap } from '../lib/useFocusTrap';
import { hasPermission, refreshIfStale } from '@/lib/permissions';
import type { Database } from '@/types/database';
import { Z } from '@/lib/zIndex';
import Skeleton from './Skeleton';
import { COMMENT_REPORT_REASONS } from '@/lib/reportReasons';
import { friendlyError } from '@/lib/friendlyError';

type CommentDb = Database['public']['Tables']['comments']['Row'];

// T32 — Web comment-report categories must mirror the iOS ReportReason
// enum at VerityPost/VerityPost/BlockService.swift so reports landing in
// the `reports` table from either surface use the same set of strings.
// T278 — Centralized in @/lib/reportReasons. The list now leads with
// the three urgent / 18 U.S.C. § 2258A categories (csam,
// child_exploitation, grooming) so a victim sees the most actionable
// option first; server-side enum validation lives in
// `assertReportReason` and the urgent code path is handled by the
// comment-report route.
const REPORT_REASONS = COMMENT_REPORT_REASONS;

const HIDE_REASONS = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'off_topic', label: 'Off-topic' },
  { value: 'abuse_or_threats', label: 'Abuse or threats' },
  { value: 'context_blocking', label: 'Context blocking' },
  { value: 'other', label: 'Other' },
];

type CommentWithAuthor = CommentDb & {
  users?: {
    id?: string;
    username?: string;
    avatar_url?: string | null;
    avatar_color?: string | null;
    is_verified_public_figure?: boolean;
    is_expert?: boolean;
    expert_title?: string | null;
  };
};

interface CommentThreadProps {
  articleId: string;
  articleCategoryId?: string | null;
  currentUserId?: string | null;
  // Signature moment per Future Projects/13_QUIZ_UNLOCK_MOMENT.md.
  // Set true ONLY on the first reveal after the reader passes the quiz
  // in this session — the first five comments fade in 50ms-staggered.
  // Subsequent visits (already-passed reader returning) render instantly.
  // Honored only when prefers-reduced-motion: no-preference.
  justRevealed?: boolean;
  // T11 — optional editorial follow-up shown ONLY in the empty-state
  // (passed-quiz user, zero comments yet). Rendered below the
  // "start the conversation" copy so the reader has somewhere to go
  // when they don't want to be the first to post. Story page passes a
  // compact "More in [Category]" list.
  emptyStateExtra?: React.ReactNode;
  // Locked-composer gate: logged-in users who haven't passed the quiz see
  // the composer in a locked state. Defaults to true so existing call
  // sites that don't pass this prop are unaffected.
  quizPassed?: boolean;
}

type DialogAction = 'delete' | 'report' | 'flag' | 'hide' | 'block';

type DialogState = {
  action: DialogAction;
  reason: string;
  description: string;
  submitting: boolean;
  error?: string;
  commentId?: string;
  targetUserId?: string;
} | null;

export type TagKind = 'context' | 'helpful' | 'cite_needed' | 'off_topic';

const TAG_KINDS: TagKind[] = ['helpful', 'context', 'cite_needed', 'off_topic'];

export default function CommentThread({
  articleId,
  articleCategoryId,
  currentUserId,
  justRevealed = false,
  emptyStateExtra,
  quizPassed = false,
}: CommentThreadProps) {
  const supabase = createClient();
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const commentsRef = useRef<CommentWithAuthor[]>([]);
  const mountedRef = useRef<boolean>(true);
  const [authorScores, setAuthorScores] = useState<Record<string, number>>({});
  // Author overall Verity Score, keyed by user_id. Same gate as authorScores —
  // populated only when the viewer has comments.score.view_subcategory. Drives
  // the "Verity Score: N" line in the avatar hover/tap card alongside the
  // subcategory score.
  const [authorOverallScores, setAuthorOverallScores] = useState<Record<string, number>>({});
  const [yourTags, setYourTags] = useState<Map<string, Set<TagKind>>>(new Map());
  // Threshold above which the inline "Helpful" badge is shown next to
  // the author. Pulled from /api/settings/public; falls back to 10 on
  // network error or missing key (matches the editorial bar).
  const [helpfulThreshold, setHelpfulThreshold] = useState<number>(10);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [viewerIsSupervisor, setViewerIsSupervisor] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [permsLoaded, setPermsLoaded] = useState<boolean>(false);
  // EXPERT_THREADS Wave 4b — distinctive expert chrome attaches to
  // author.is_expert AND article.category ∈ author.verified_categories
  // (spec §2 "Distinctive expert reply chrome"). Map: user_id → Set of
  // approved category IDs.
  const [verifiedCategoriesByUser, setVerifiedCategoriesByUser] = useState<
    Record<string, Set<string>>
  >({});
  // EXPERT_THREADS Wave 4b — chain-cap affordances. expert_thread_chains
  // rows for visible expert thread roots, keyed root_id → (askerId:expertId)
  // → row. Used by CommentRow to render "1 reply left" / cap-hit copy and
  // the "Allow another reply" button.
  type ChainRow = {
    thread_root_id: string;
    asker_user_id: string;
    expert_user_id: string;
    asker_reply_count: number;
    free_pass_granted_at: string | null;
  };
  const [chainsByRoot, setChainsByRoot] = useState<
    Record<string, Record<string, ChainRow>>
  >({});
  const [inertVisualGiveaway, setInertVisualGiveaway] = useState<boolean>(false);

  const canViewSection = currentUserId
    ? (permsLoaded ? hasPermission('comments.section.view') : false)
    : true;
  const canViewScore = permsLoaded ? hasPermission('comments.score.view_subcategory') : false;
  const canSubscribe = permsLoaded ? hasPermission('comments.realtime.subscribe') : false;
  const canAskExpert = permsLoaded ? hasPermission('expert.ask') : false;

  useEffect(() => {
    (async () => {
      await refreshIfStale();
      setPermsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Section A — pull the editorial threshold from /api/settings/public.
  // Same endpoint CommentRow already uses for `comment_max_depth`, so no
  // new server surface required. Falls back to 10 on any failure.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const t = data.helpful_badge_threshold;
        if (typeof t === 'number' && Number.isFinite(t) && t > 0) {
          setHelpfulThreshold(t);
        }
        // EXPERT_THREADS Wave 4b — inert mention render flag
        if (typeof data.expert_inert_mention_visual_giveaway === 'boolean') {
          setInertVisualGiveaway(data.expert_inert_mention_visual_giveaway);
        }
      })
      .catch(() => {
        // Default 10 stands.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    // T300 — author info now fetched via a separate public_profiles_v
    // batch instead of a relation embed. Pre-T300, we used
    // `users!user_id(...)` to embed author display data in the same
    // round-trip; PostgREST applies RLS to each table in an embed, so
    // post-T300 (RLS on users tightened to self/admin) the embed would
    // 403 for normal viewers reading other authors' comments. The
    // separate batch through public_profiles_v sidesteps that — the
    // view's whitelisted columns are exactly the ones the comment row
    // needs for render. Authors who've been deleted/banned/private
    // since posting won't appear in the batch; the merge below produces
    // `users: null` for them, which the existing `user.username || 'user'`
    // fallback in CommentRow handles.
    // T3.6 — initial fetch capped at 50 rows to prevent full-row blast on
    // hot articles. Cursor-based load-more is queued separately; until it
    // ships, threads beyond 50 rows render the top-50 by quality order.
    const { data: rows, error: loadErr } = await supabase
      .from('comments')
      .select('*, followups:comment_followups(id, body, sort_order, created_at)')
      .eq('article_id', articleId)
      .eq('status', 'visible')
      .is('deleted_at', null)
      .order('is_context_pinned', { ascending: false })
      .order('upvote_count', { ascending: false })
      .order('created_at', { ascending: true })
      .range(0, 49);
    if (loadErr) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoadError(false);
    const rowsSafe = (rows || []) as CommentWithAuthor[];

    const userIds = Array.from(new Set(rowsSafe.map((c) => c.user_id).filter(Boolean)));

    // Fetch authors via public_profiles_v + merge into the comment rows
    // so the existing CommentRow render (`comment.users.username` etc.)
    // keeps working without further changes.
    type AuthorRow = NonNullable<CommentWithAuthor['users']>;
    let authorById = new Map<string, AuthorRow>();
    if (userIds.length > 0) {
      const { data: authorRows } = await supabase
        .from('public_profiles_v')
        .select('id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, expert_title')
        .in('id', userIds);
      authorById = new Map(
        ((authorRows as unknown as AuthorRow[]) || [])
          .filter((a): a is AuthorRow & { id: string } => typeof a?.id === 'string')
          .map((a) => [a.id, a])
      );
    }
    const enriched = rowsSafe.map((c) => ({
      ...c,
      users: c.user_id ? (authorById.get(c.user_id) ?? undefined) : undefined,
    }));
    setComments(enriched);

    const commentIds = rowsSafe.map((c) => c.id);

    if (currentUserId) {
      if (commentIds.length > 0) {
        const { data: t } = await supabase
          .from('comment_context_tags')
          .select('comment_id, tag_kind')
          .eq('user_id', currentUserId)
          .in('comment_id', commentIds);
        const tagMap = new Map<string, Set<TagKind>>();
        ((t || []) as unknown as Array<{ comment_id: string; tag_kind: TagKind }>).forEach((r) => {
          if (!r?.comment_id || !r?.tag_kind) return;
          let set = tagMap.get(r.comment_id);
          if (!set) {
            set = new Set();
            tagMap.set(r.comment_id, set);
          }
          set.add(r.tag_kind);
        });
        setYourTags(tagMap);
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
        p_user_id: currentUserId,
        p_category_id: articleCategoryId,
      });
      setViewerIsSupervisor(!!sup);
    }
    // Score data is fetched for any signed-in viewer (free + paid). Anon
    // viewers don't get the avatar score card, so we skip the round-trip.
    if (currentUserId && articleCategoryId && userIds.length > 0) {
      const [subRes, overallRes] = await Promise.all([
        supabase
          .from('category_scores')
          .select('user_id, score')
          .eq('category_id', articleCategoryId)
          .in('user_id', userIds),
        supabase
          .from('users')
          .select('id, verity_score')
          .in('id', userIds),
      ]);
      const subMap: Record<string, number> = {};
      (subRes.data || []).forEach((r) => {
        if (r.user_id != null && r.score != null) subMap[r.user_id] = r.score;
      });
      setAuthorScores(subMap);
      const overallMap: Record<string, number> = {};
      (overallRes.data || []).forEach((r) => {
        if (r.id != null && r.verity_score != null) overallMap[r.id] = r.verity_score;
      });
      setAuthorOverallScores(overallMap);
    }

    // EXPERT_THREADS Wave 4b — fetch thread-state (verified categories +
    // chains) in one round-trip. Server-side because expert_applications
    // RLS scopes reads to (user_id = auth.uid()) OR is_admin_or_above
    // and expert_thread_chains isn't in the generated TS types yet.
    // 404 → kill switch off; silently no-op (chrome falls back to the
    // legacy is_expert_reply column, no chain affordances render).
    try {
      const tsRes = await fetch(
        `/api/comments/expert-thread-state?article_id=${encodeURIComponent(articleId)}`
      );
      if (tsRes.ok) {
        const tsJson = await tsRes.json().catch(() => null) as {
          verifiedCategoriesByUser?: Record<string, string[]>;
          chainsByRoot?: Record<
            string,
            Array<{
              asker_user_id: string;
              expert_user_id: string;
              asker_reply_count: number;
              free_pass_granted_at: string | null;
            }>
          >;
        } | null;
        if (tsJson) {
          const byUser: Record<string, Set<string>> = {};
          for (const [uid, cats] of Object.entries(tsJson.verifiedCategoriesByUser || {})) {
            byUser[uid] = new Set(cats);
          }
          setVerifiedCategoriesByUser(byUser);

          const byRoot: Record<string, Record<string, ChainRow>> = {};
          for (const [rootId, chains] of Object.entries(tsJson.chainsByRoot || {})) {
            const inner: Record<string, ChainRow> = {};
            for (const c of chains) {
              inner[`${c.asker_user_id}:${c.expert_user_id}`] = {
                thread_root_id: rootId,
                asker_user_id: c.asker_user_id,
                expert_user_id: c.expert_user_id,
                asker_reply_count: c.asker_reply_count,
                free_pass_granted_at: c.free_pass_granted_at,
              };
            }
            byRoot[rootId] = inner;
          }
          setChainsByRoot(byRoot);
        }
      } else if (tsRes.status === 404) {
        // Kill switch off — clear any prior state.
        setVerifiedCategoriesByUser({});
        setChainsByRoot({});
      }
    } catch {
      // Network blip — leave previous state. Worst case is missing
      // chrome on author rows; functionality degrades gracefully.
    }

    setLoading(false);
  }, [articleId, articleCategoryId, currentUserId, supabase]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!articleId || !canSubscribe) return;
    let cancelled = false;
    const channelName = `article-comments:${articleId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `article_id=eq.${articleId}`,
        },
        async (payload: { new: CommentDb }) => {
          if (payload.new.status && payload.new.status !== 'visible') return;
          const { data: row } = await supabase
            .from('comments')
            .select('*, followups:comment_followups(id, body, sort_order, created_at)')
            .eq('id', payload.new.id)
            .maybeSingle();
          if (cancelled || !row) return;
          type AuthorRow = NonNullable<CommentWithAuthor['users']>;
          let author: AuthorRow | undefined;
          if (row.user_id) {
            const { data: authorRow } = await supabase
              .from('public_profiles_v')
              .select('id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, expert_title')
              .eq('id', row.user_id)
              .maybeSingle();
            if (authorRow) author = authorRow as unknown as AuthorRow;
          }
          if (cancelled) return;
          const enriched: CommentWithAuthor = { ...row, users: author };
          setComments((prev) =>
            prev.find((c) => c.id === enriched.id) ? prev : [...prev, enriched]
          );
        }
      )
      .on(
        'postgres_changes' as never,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comments',
          filter: `article_id=eq.${articleId}`,
        },
        async (payload: { new: CommentDb }) => {
          if (cancelled) return;
          if (payload.new.status && payload.new.status !== 'visible') {
            setComments((prev) =>
              prev.map((c) =>
                c.id !== payload.new.id
                  ? c
                  : { ...c, body: '[deleted]', status: 'deleted' as string, deleted_at: new Date().toISOString() }
              )
            );
            return;
          }
          const id = payload.new.id;
          const alreadyPresent = commentsRef.current.find((c) => c.id === id);
          if (alreadyPresent) {
            setComments((prev) => prev.map((c) => (c.id === id ? { ...c, ...payload.new } : c)));
          } else {
            const { data: row } = await supabase
              .from('comments')
              .select('*, followups:comment_followups(id, body, sort_order, created_at)')
              .eq('id', id)
              .maybeSingle();
            if (cancelled || !row) return;
            type AuthorRow = NonNullable<CommentWithAuthor['users']>;
            let author: AuthorRow | undefined;
            if (row.user_id) {
              const { data: authorRow } = await supabase
                .from('public_profiles_v')
                .select('id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, expert_title')
                .eq('id', row.user_id)
                .maybeSingle();
              if (authorRow) author = authorRow as unknown as AuthorRow;
            }
            if (cancelled) return;
            const enriched: CommentWithAuthor = { ...row, users: author };
            setComments((prev) =>
              prev.find((c) => c.id === id) ? prev : [...prev, enriched]
            );
          }
        }
      )
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comment_followups',
        },
        async (payload: { new: { comment_id: string } }) => {
          const cid = payload.new?.comment_id;
          if (!cid) return;
          if (!commentsRef.current.find((c) => c.id === cid)) return;
          const { data: rows } = await supabase
            .from('comment_followups')
            .select('id, body, sort_order, created_at')
            .eq('comment_id', cid)
            .order('sort_order', { ascending: true });
          if (cancelled) return;
          setComments((prev) =>
            prev.map((c) =>
              c.id === cid ? ({ ...c, followups: rows || [] } as CommentWithAuthor) : c
            )
          );
        }
      )
      .on(
        'postgres_changes' as never,
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comment_followups',
        },
        async (payload: { old: { comment_id: string } }) => {
          const cid = payload.old?.comment_id;
          if (!cid) return;
          if (!commentsRef.current.find((c) => c.id === cid)) return;
          const { data: rows } = await supabase
            .from('comment_followups')
            .select('id, body, sort_order, created_at')
            .eq('comment_id', cid)
            .order('sort_order', { ascending: true });
          if (cancelled) return;
          setComments((prev) =>
            prev.map((c) =>
              c.id === cid ? ({ ...c, followups: rows || [] } as CommentWithAuthor) : c
            )
          );
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [articleId, canSubscribe, supabase]);

  async function handleToggleTag(commentId: string, tagKind: TagKind) {
    const res = await fetch(`/api/comments/${commentId}/context-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_kind: tagKind }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(friendlyError(data?.error, 'Tag failed'));
      return;
    }
    // The RPC always returns the canonical { tagged, count, tag_kind,
    // helpful_count, is_pinned } shape. `count` is context-only and
    // unchanged for non-context kinds; `helpful_count` is reflected on
    // every response so a helpful toggle and a context toggle both
    // converge to truth on the row.
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              ...(tagKind === 'context'
                ? {
                    context_tag_count: data.count,
                    is_context_pinned: data.is_pinned,
                    context_pinned_at: data.is_pinned
                      ? c.context_pinned_at || new Date().toISOString()
                      : c.context_pinned_at,
                  }
                : {}),
              // helpful_count column lands with the Section A migration;
              // cast to `unknown` then merge so older type defs accept it.
              ...(typeof data.helpful_count === 'number'
                ? ({ helpful_count: data.helpful_count } as unknown as Partial<CommentDb>)
                : {}),
            }
          : c
      )
    );
    setYourTags((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(commentId) || []);
      if (data.tagged) set.add(tagKind);
      else set.delete(tagKind);
      if (set.size === 0) next.delete(commentId);
      else next.set(commentId, set);
      return next;
    });
  }

  async function handleEdit(commentId: string, body: string) {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.message ?? friendlyError(d?.error, 'Edit failed'));
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, body, is_edited: true } : c))
    );
  }

  const [dialog, setDialog] = useState<DialogState>(null);
  const [flashMessage, setFlashMessage] = useState<string>('');

  const openDialog = (action: DialogAction, payload: Partial<NonNullable<DialogState>> = {}) =>
    setDialog({ action, reason: '', description: '', submitting: false, error: undefined, ...payload });
  const closeDialog = () => setDialog(null);
  const updateDialog = (patch: Partial<NonNullable<DialogState>>) =>
    setDialog((prev) => (prev ? { ...prev, ...patch } : prev));

  function handleDelete(commentId: string) {
    openDialog('delete', { commentId });
  }
  function handleReport(commentId: string) {
    openDialog('report', { commentId });
  }
  function handleFlag(commentId: string) {
    openDialog('flag', { commentId });
  }
  function handleHide(commentId: string) {
    openDialog('hide', { commentId });
  }
  function handleBlock(targetUserId: string) {
    openDialog('block', { targetUserId });
  }

  async function runDialogAction() {
    if (!dialog) return;
    updateDialog({ submitting: true });
    try {
      if (dialog.action === 'delete' && dialog.commentId) {
        const res = await fetch(`/api/comments/${dialog.commentId}`, { method: 'DELETE' });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          updateDialog({ error: friendlyError(d?.error, 'Delete failed'), submitting: false });
          return;
        }
        setComments((prev) =>
          prev.map((c) =>
            c.id === dialog.commentId
              ? { ...c, body: '[deleted]', status: 'deleted', deleted_at: new Date().toISOString() }
              : c
          )
        );
        closeDialog();
        return;
      }
      if (dialog.action === 'report' && dialog.commentId) {
        // T32 — `reason` is a category enum value (see REPORT_REASONS).
        // Free-text context is only sent when the user picked "other".
        const isOther = dialog.reason === 'other';
        const description = isOther ? dialog.description.trim() : '';
        const res = await fetch(`/api/comments/${dialog.commentId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: dialog.reason,
            ...(description ? { description } : {}),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          updateDialog({ error: friendlyError(d?.error, 'Report failed'), submitting: false });
          return;
        }
        closeDialog();
        setFlashMessage('Thanks \u2014 our team will review it.');
        setTimeout(() => setFlashMessage(''), 3000);
        return;
      }
      if (dialog.action === 'flag' && dialog.commentId) {
        const res = await fetch(`/api/comments/${dialog.commentId}/flag`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_id: articleCategoryId,
            reason: dialog.reason.trim(),
            description: dialog.description,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          updateDialog({ error: friendlyError(data?.error, 'Flag failed'), submitting: false });
          return;
        }
        closeDialog();
        setFlashMessage('Flagged \u2014 moderators will review it.');
        setTimeout(() => setFlashMessage(''), 3000);
        return;
      }
      if (dialog.action === 'hide' && dialog.commentId) {
        const res = await fetch(`/api/admin/moderation/comments/${dialog.commentId}/hide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: dialog.reason,
            ...(dialog.reason === 'other' && dialog.description.trim() ? { context: dialog.description.trim() } : {}),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          updateDialog({ error: friendlyError(d?.error, 'Hide failed'), submitting: false });
          return;
        }
        setComments((prev) => prev.filter((c) => c.id !== dialog.commentId));
        closeDialog();
        return;
      }
      if (dialog.action === 'block' && dialog.targetUserId) {
        // The API (/api/users/[id]/block) is POST-to-block, DELETE-to-unblock
        // per the Apple Guideline 1.2 split. The comment-row surface only
        // blocks — unblock lives in profile/settings, because blocked authors'
        // comments are filtered out below (see `visible` below) and the row
        // menu is unreachable for them.
        const res = await fetch(`/api/users/${dialog.targetUserId}/block`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          updateDialog({ error: friendlyError(data?.error, 'Block failed'), submitting: false });
          return;
        }
        setBlockedIds((prev) => new Set([...prev, dialog.targetUserId as string]));
        setFlashMessage('Blocked. Manage blocks in Settings.');
        setTimeout(() => setFlashMessage(''), 3000);
        closeDialog();
      }
    } finally {
      updateDialog({ submitting: false });
    }
  }

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(!!dialog, dialogRef, { onEscape: closeDialog });

  useEffect(() => {
    if (dialog) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [dialog]);

  // EXPERT_THREADS Wave 4b — close/reopen/grant handlers. Each updates
  // local state on success so the UI reflects the new state without a
  // full reload. Errors surface inline via setError; the cooldown 429
  // returns { ok:false, reason:'wait_for_cooldown', seconds_remaining }
  // which the close handler returns to CommentRow so the row can show
  // a per-comment countdown rather than a global error.
  type CloseResult =
    | { ok: true }
    | { ok: false; reason: 'wait_for_cooldown'; seconds_remaining: number }
    | { ok: false; reason: 'unknown' };
  async function handleCloseThread(rootId: string): Promise<CloseResult> {
    const res = await fetch(`/api/comments/${rootId}/close`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429 && data?.reason === 'wait_for_cooldown') {
      const sec = Number(data.seconds_remaining);
      return {
        ok: false,
        reason: 'wait_for_cooldown',
        seconds_remaining: Number.isFinite(sec) && sec > 0 ? sec : 60,
      };
    }
    if (!res.ok) {
      setError(friendlyError(data?.error, 'Could not close thread'));
      return { ok: false, reason: 'unknown' };
    }
    setComments((prev) =>
      prev.map((c) =>
        c.id === rootId
          ? ({
              ...c,
              expert_thread_closed_at: new Date().toISOString(),
            } as CommentWithAuthor)
          : c
      )
    );
    return { ok: true };
  }

  async function handleReopenThread(rootId: string): Promise<boolean> {
    const res = await fetch(`/api/comments/${rootId}/close?action=reopen`, { method: 'POST' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(friendlyError(d?.error, 'Could not reopen thread'));
      return false;
    }
    setComments((prev) =>
      prev.map((c) =>
        c.id === rootId
          ? ({
              ...c,
              expert_thread_closed_at: null,
              last_reopen_at: new Date().toISOString(),
            } as CommentWithAuthor)
          : c
      )
    );
    return true;
  }

  async function handleGrantFollowup(rootId: string, askerUserId: string): Promise<boolean> {
    const res = await fetch(`/api/expert/threads/${rootId}/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asker_user_id: askerUserId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(friendlyError(d?.error, 'Could not grant another reply'));
      return false;
    }
    // Optimistically stamp free_pass_granted_at on the chain row so the
    // asker's reply button re-enables locally. Real persistence is in
    // expert_thread_chains; the next refresh will pick up the durable row.
    setChainsByRoot((prev) => {
      const inner = { ...(prev[rootId] || {}) };
      const key = `${askerUserId}:${currentUserId}`;
      inner[key] = {
        thread_root_id: rootId,
        asker_user_id: askerUserId,
        expert_user_id: currentUserId || '',
        asker_reply_count: inner[key]?.asker_reply_count ?? 0,
        free_pass_granted_at: new Date().toISOString(),
      };
      return { ...prev, [rootId]: inner };
    });
    return true;
  }

  // Build a quick map: thread_root_id → root author id (the asker). Drives
  // chain key construction in CommentRow. Built from the visible comments;
  // any expert thread root visible in the current view contributes.
  const rootAuthorByRoot: Record<string, string> = {};
  for (const c of comments) {
    if ((c as { is_expert_thread_root?: boolean | null }).is_expert_thread_root) {
      if (typeof c.user_id === 'string') rootAuthorByRoot[c.id] = c.user_id;
    }
  }

  function handlePosted(comment: CommentDb | null) {
    if (!comment) return;
    const enrich = async () => {
      let author: CommentWithAuthor['users'] | undefined;
      if (comment.user_id) {
        const { data: authorRow } = await supabase
          .from('public_profiles_v')
          .select('id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, expert_title')
          .eq('id', comment.user_id)
          .maybeSingle();
        if (authorRow) author = authorRow as unknown as CommentWithAuthor['users'];
      }
      if (!mountedRef.current) return;
      setComments((prev) =>
        prev.find((c) => c.id === comment.id)
          ? prev
          : [...prev, { ...comment, users: author } as CommentWithAuthor]
      );
    };
    enrich().catch((err) => console.error('enrich failed:', err));
  }

  const [sort, setSort] = useState<'top' | 'newest'>('top');
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(friendlyError(data?.error, 'Ask failed'));
      setExpertQuestion('');
      setExpertDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask failed');
    } finally {
      setExpertSubmitting(false);
    }
  }

  if (loading) {
    // T-042: Skeleton loading rows replace the "Loading discussion…" text.
    // Three comment-shaped rows: avatar circle + 2-3 text lines each.
    // Shimmer animation defined in globals.css (.vp-skeleton / vpShimmer).
    return (
      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Skeleton width={32} height={32} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="85%" height={13} />
            <Skeleton width="70%" height={13} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Skeleton width={32} height={32} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="40%" height={13} />
            <Skeleton width="75%" height={13} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Skeleton width={32} height={32} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="60%" height={13} />
            <Skeleton width="90%" height={13} />
            <Skeleton width="50%" height={13} />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: '16px 0' }}>
        <p style={{ fontSize: 14, color: 'var(--dim, #888)', margin: '0 0 10px' }}>
          Comments couldn&apos;t load.
        </p>
        <button
          onClick={() => { setLoadError(false); loadAll(); }}
          style={{
            fontSize: 13, color: 'var(--accent, #111)', background: 'transparent',
            border: 'none', padding: 0, cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!canViewSection) {
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
          Comments aren&apos;t available for your account.
        </div>
      </div>
    );
  }

  const visible = comments.filter((c) => !blockedIds.has(c.user_id));
  const topsUnsorted = visible.filter((c) => !c.parent_id);
  const tops = [...topsUnsorted].sort((a, b) => {
    if (sort === 'newest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    // 'top': sort by quality_score (helpful + context - cite_needed - off_topic) descending
    const qA = (a as unknown as { quality_score?: number | null }).quality_score ?? 0;
    const qB = (b as unknown as { quality_score?: number | null }).quality_score ?? 0;
    return qB - qA;
  });
  const childrenByParent: Record<string, CommentWithAuthor[]> = {};
  visible
    .filter((c) => c.parent_id)
    .forEach((c) => {
      const pid = c.parent_id as string;
      (childrenByParent[pid] ||= []).push(c);
    });

  const renderWithReplies = (c: CommentWithAuthor, depth = 0): ReactNode => {
    const kids = (childrenByParent[c.id] || []).map((child) => renderWithReplies(child, depth + 1));
    const enriched: EnrichedComment = {
      ...c,
      _your_tags: yourTags.get(c.id) ?? new Set<TagKind>(),
    };
    return (
      <CommentRow
        key={c.id}
        comment={enriched}
        replies={kids as ReactNode[]}
        currentUserId={currentUserId}
        authorCategoryScore={canViewScore ? authorScores[c.user_id] : null}
        authorOverallScore={currentUserId ? authorOverallScores[c.user_id] : null}
        canViewScore={!!currentUserId}
        articleId={articleId}
        articleCategoryId={articleCategoryId}
        verifiedCategoriesByUser={verifiedCategoriesByUser}
        chainsByRoot={chainsByRoot}
        rootAuthorByRoot={rootAuthorByRoot}
        inertVisualGiveaway={inertVisualGiveaway}
        onCloseThread={handleCloseThread}
        onReopenThread={handleReopenThread}
        onGrantFollowup={handleGrantFollowup}
        depth={depth}
        viewerIsSupervisor={viewerIsSupervisor}
        helpfulThreshold={helpfulThreshold}
        tagKinds={TAG_KINDS}
        onToggleTag={handleToggleTag}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReport={handleReport}
        onBlock={handleBlock}
        onFlag={handleFlag}
        onHide={handleHide}
        onReplied={handlePosted}
        quizPassed={quizPassed}
      />
    );
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Quiz Gate Brand — make the moat visible. Header is the trust
          signal: every commenter passed the comprehension quiz, by
          construction (schema/013 post_comment RPC; no role bypass).
          Suppressed on empty threads where "Every reader here" would
          contradict the "be the first" empty-state copy below. */}
      {visible.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          paddingBottom: 12,
          borderBottom: '1px solid #e5e5e5',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #1a1a1a)' }}>
              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['top', 'newest'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: sort === s ? 'var(--bg, #fff)' : 'var(--dim, #999)',
                  background: sort === s ? 'var(--text, #111)' : 'transparent',
                  border: 'none',
                  borderRadius: 20,
                  cursor: 'pointer',
                  padding: '5px 12px',
                }}
              >
                {s === 'top' ? 'Top' : 'Newest'}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentUserId && quizPassed && (
        <CommentComposer
          articleId={articleId}
          onPosted={handlePosted}
          autoFocus={justRevealed}
          quizPassed={quizPassed}
        />
      )}

      {expertDialogOpen && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>
            Ask an Expert &mdash; routes to the category queue
          </div>
          <textarea
            value={expertQuestion}
            onChange={(e) => setExpertQuestion(e.target.value)}
            rows={3}
            placeholder="Frame a specific question an expert can answer."
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 8,
              border: '1px solid #e5e5e5',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              onClick={submitExpertQuestion}
              disabled={!expertQuestion.trim() || expertSubmitting}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: 'none',
                background: expertQuestion.trim() && !expertSubmitting ? '#111' : '#ccc',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: expertQuestion.trim() && !expertSubmitting ? 'pointer' : 'default',
              }}
            >
              {expertSubmitting ? 'Sending\u2026' : 'Send to queue'}
            </button>
            <button
              onClick={() => {
                setExpertDialogOpen(false);
                setExpertQuestion('');
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: '1px solid #e5e5e5',
                background: 'transparent',
                color: '#111',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      {flashMessage && (
        <div
          style={{
            fontSize: 13,
            color: '#166534',
            background: '#ecfdf5',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 8,
          }}
        >
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
            <div
              id="comment-dialog-title"
              style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}
            >
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

            {dialog.action === 'report' && (
              // T32 — Structured category radio matching iOS ReportReason
              // (BlockService.swift). Free-text "Context" only appears when
              // the user picks "Other"; for the named categories the reason
              // alone is sent and the description field is suppressed.
              <>
                <fieldset style={{ border: 'none', padding: 0, margin: '0 0 10px 0' }}>
                  <legend
                    style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--dim, #666)',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                      padding: 0,
                    }}
                  >
                    Reason
                  </legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {REPORT_REASONS.map((r, idx) => (
                      <label
                        key={r.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          color: 'var(--text-primary, #111)',
                          cursor: 'pointer',
                          minHeight: 28,
                        }}
                      >
                        <input
                          type="radio"
                          name="report-reason"
                          value={r.value}
                          checked={dialog.reason === r.value}
                          onChange={() => updateDialog({ reason: r.value })}
                          autoFocus={idx === 0}
                          style={{ margin: 0 }}
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {dialog.reason === 'other' && (
                  <>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--dim, #666)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Tell us more
                    </label>
                    <textarea
                      value={dialog.description}
                      onChange={(e) => updateDialog({ description: e.target.value })}
                      rows={3}
                      maxLength={1000}
                      placeholder="What's the issue?"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border, #e5e5e5)',
                        fontSize: 13,
                        outline: 'none',
                        fontFamily: 'inherit',
                        marginBottom: 10,
                        boxSizing: 'border-box',
                        resize: 'vertical',
                      }}
                    />
                  </>
                )}
              </>
            )}

            {dialog.action === 'flag' && (
              <>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--dim, #666)',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Reason
                </label>
                <input
                  autoFocus
                  value={dialog.reason}
                  onChange={(e) => updateDialog({ reason: e.target.value })}
                  placeholder="e.g. harassment, spam, misinformation"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #e5e5e5)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                    marginBottom: 10,
                    boxSizing: 'border-box',
                  }}
                />
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--dim, #666)',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Context (optional)
                </label>
                <textarea
                  value={dialog.description}
                  onChange={(e) => updateDialog({ description: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #e5e5e5)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                    marginBottom: 10,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </>
            )}

            {dialog.action === 'hide' && (
              <>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--dim, #666)',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Reason <span style={{ color: 'var(--danger, #dc2626)' }}>*</span>
                </label>
                <select
                  value={dialog.reason}
                  onChange={(e) => updateDialog({ reason: e.target.value })}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #e5e5e5)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    marginBottom: 10,
                    background: 'var(--card, #fff)',
                    color: 'var(--text, #111)',
                  }}
                >
                  <option value="">Select a reason…</option>
                  {HIDE_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {dialog.reason === 'other' && (
                  <>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--dim, #666)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Context <span style={{ color: 'var(--danger, #dc2626)' }}>*</span>
                    </label>
                    <textarea
                      value={dialog.description}
                      onChange={(e) => updateDialog({ description: e.target.value })}
                      rows={3}
                      maxLength={500}
                      placeholder="Describe the issue."
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border, #e5e5e5)',
                        fontSize: 13,
                        fontFamily: 'inherit',
                        marginBottom: 10,
                        boxSizing: 'border-box',
                        resize: 'vertical',
                      }}
                    />
                  </>
                )}
              </>
            )}

            {dialog.error && (
              <p style={{ fontSize: 12, color: 'var(--danger, #dc2626)', margin: '0 0 10px 0' }}>
                {dialog.error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={closeDialog}
                style={{
                  padding: '8px 16px',
                  borderRadius: 9,
                  border: '1px solid var(--border, #e5e5e5)',
                  background: 'transparent',
                  fontSize: 13,
                  cursor: 'pointer',
                  color: 'var(--dim, #666)',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={runDialogAction}
                disabled={
                  dialog.submitting ||
                  (dialog.action === 'flag' && !dialog.reason.trim()) ||
                  // T32 — report requires a category; "other" additionally
                  // requires non-empty context so we don't ship the server
                  // an empty meaningless payload.
                  (dialog.action === 'report' &&
                    (!dialog.reason || (dialog.reason === 'other' && !dialog.description.trim()))) ||
                  // DECISION #034 — hide requires a pre-set reason; "other"
                  // additionally requires a context description.
                  (dialog.action === 'hide' &&
                    (!dialog.reason || (dialog.reason === 'other' && !dialog.description.trim())))
                }
                style={{
                  padding: '8px 16px',
                  borderRadius: 9,
                  border: 'none',
                  background:
                    dialog.action === 'delete' || dialog.action === 'block'
                      ? '#dc2626'
                      : 'var(--accent, #111)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: dialog.submitting ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {dialog.submitting
                  ? 'Working\u2026'
                  : dialog.action === 'delete'
                    ? 'Delete'
                    : dialog.action === 'block'
                      ? 'Block'
                      : dialog.action === 'hide'
                        ? 'Hide'
                        : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tops.length === 0 ? (
        // T142 — CommentThread is only mounted for readers who already
        // passed the quiz (story page gates the not-passed and anon
        // states with their own pedagogic lock-panels at
        // app/story/[slug]/page.tsx). So the empty-state here only ever
        // addresses the auth+passed reader: name the unlock and invite
        // them to start the conversation rather than reciting the rule.
        // T11 — when the article has same-category siblings, the story
        // page passes them in via `emptyStateExtra` so the passed-but-
        // alone reader has an editorial follow-up rather than a dead end.
        <div style={{ padding: '8px 0 32px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text, #111)', letterSpacing: '-0.01em', marginBottom: 6 }}>
            Be the first.
          </div>
          <div style={{ fontSize: 14, color: 'var(--dim, #666)', lineHeight: 1.5 }}>
            You read it. You passed. Your take belongs here.
          </div>
          {emptyStateExtra && <div style={{ marginTop: 24, textAlign: 'left' }}>{emptyStateExtra}</div>}
        </div>
      ) : (
        <>
          {/* Signature moment fade-in cascade per
              Future Projects/13_QUIZ_UNLOCK_MOMENT.md. First five comments
              arrive 50ms-staggered when the reader has just passed the quiz
              this session; subsequent visits render instantly. Honored only
              under prefers-reduced-motion: no-preference. */}
          {justRevealed && (
            <style>{`
              @media (prefers-reduced-motion: no-preference) {
                .vp-comment-stagger {
                  opacity: 0;
                  transform: translateY(8px);
                  animation: vp-comment-arrive 400ms ease-out forwards;
                }
              }
              @keyframes vp-comment-arrive {
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          )}
          {tops.map((c, idx) => {
            const stagger = justRevealed && idx < 5;
            const node = renderWithReplies(c);
            return stagger ? (
              <div
                key={`stagger-${c.id}`}
                className="vp-comment-stagger"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                {node}
              </div>
            ) : (
              <Fragment key={`row-${c.id}`}>{node}</Fragment>
            );
          })}
        </>
      )}
    </div>
  );
}

const askExpertBtnStyle: CSSProperties = {
  display: 'inline-block',
  padding: '9px 16px',
  borderRadius: 8,
  border: '1px solid var(--border, #e5e5e5)',
  background: 'transparent',
  color: 'var(--accent, #111)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  marginBottom: 16,
};
const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17,17,17,0.85)',
  zIndex: Z.CRITICAL,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const dialogStyle: CSSProperties = {
  background: 'var(--card, #fff)',
  border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 14,
  padding: 22,
  width: '90%',
  maxWidth: 420,
  color: 'var(--text-primary, #111)',
};
