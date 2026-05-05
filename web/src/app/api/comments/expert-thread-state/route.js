// EXPERT_THREADS Wave 4b — GET /api/comments/expert-thread-state?article_id=<uuid>
//
// One round-trip the comment thread UI uses to gather:
//   - verifiedCategoriesByUser: { [user_id]: string[] of approved
//     category_ids } — drives the distinctive expert chrome on author
//     rows (chrome attaches to author.is_expert AND article.category ∈
//     author.verified_categories per spec §2).
//   - chainsByRoot: { [root_id]: [{ asker_user_id, expert_user_id,
//     asker_reply_count, free_pass_granted_at }] } — drives the asker
//     "1 reply left" affordance + cap-hit copy + the expert "allow
//     another reply" button.
//
// Both reads need service-role: `expert_applications` RLS is scoped to
// `(user_id = auth.uid()) OR is_admin_or_above()`, and the generated
// TypeScript schema doesn't yet carry `expert_thread_chains`. Doing
// this server-side keeps the client component free of casts + bypass
// shims while still giving every viewer the read they need.
//
// Kill switch read-once: feature off → 404 (don't reveal the surface).
// No mutation; cheap to call alongside the comments load.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { isExpertThreadsEnabled } from '@/lib/expertConfig';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(request) {
  if (!(await isExpertThreadsEnabled())) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  try {
    await requireAuth();
  } catch (err) {
    if (err?.status) {
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const url = new URL(request.url);
  const articleId = url.searchParams.get('article_id');
  if (!articleId || typeof articleId !== 'string') {
    return NextResponse.json(
      { error: 'article_id required' },
      { status: 400, headers: NO_STORE }
    );
  }

  const service = createServiceClient();

  // Pull visible comments for the article so we know which users + roots
  // matter. Mirrors the same range cap CommentThread.loadAll uses (50).
  const { data: rows, error: commentsErr } = await service
    .from('comments')
    .select('id, user_id, is_expert_thread_root')
    .eq('article_id', articleId)
    .eq('status', 'visible')
    .is('deleted_at', null)
    .range(0, 49);

  if (commentsErr) {
    console.error('[comments.expert-thread-state.comments]', commentsErr);
    return NextResponse.json(
      { error: 'lookup_failed' },
      { status: 500, headers: NO_STORE }
    );
  }

  const userIds = Array.from(
    new Set(
      (rows || [])
        .map((c) => c.user_id)
        .filter((id) => typeof id === 'string')
    )
  );
  const rootIds = (rows || [])
    .filter((c) => c.is_expert_thread_root)
    .map((c) => c.id)
    .filter((id) => typeof id === 'string');

  // Verified categories: join expert_application_categories →
  // expert_applications (status=approved) for the visible userIds.
  let verifiedCategoriesByUser = {};
  if (userIds.length > 0) {
    const { data: catRows, error: catErr } = await service
      .from('expert_application_categories')
      .select('category_id, expert_applications!inner(user_id, status)')
      .eq('expert_applications.status', 'approved')
      .in('expert_applications.user_id', userIds);
    if (catErr) {
      console.error('[comments.expert-thread-state.categories]', catErr);
      // Non-fatal — return what we have; chrome will fall back to the
      // legacy `is_expert_reply` boolean column.
    } else {
      for (const r of catRows || []) {
        const uid = r?.expert_applications?.user_id;
        const cid = r?.category_id;
        if (typeof uid === 'string' && typeof cid === 'string') {
          (verifiedCategoriesByUser[uid] ||= []);
          if (!verifiedCategoriesByUser[uid].includes(cid)) {
            verifiedCategoriesByUser[uid].push(cid);
          }
        }
      }
    }
  }

  // Chain rows for visible expert thread roots.
  let chainsByRoot = {};
  if (rootIds.length > 0) {
    const { data: chainRows, error: chainErr } = await service
      .from('expert_thread_chains')
      .select(
        'thread_root_id, asker_user_id, expert_user_id, asker_reply_count, free_pass_granted_at'
      )
      .in('thread_root_id', rootIds);
    if (chainErr) {
      console.error('[comments.expert-thread-state.chains]', chainErr);
    } else {
      for (const r of chainRows || []) {
        if (
          !r?.thread_root_id ||
          !r?.asker_user_id ||
          !r?.expert_user_id
        )
          continue;
        (chainsByRoot[r.thread_root_id] ||= []).push({
          asker_user_id: r.asker_user_id,
          expert_user_id: r.expert_user_id,
          asker_reply_count: r.asker_reply_count ?? 0,
          free_pass_granted_at: r.free_pass_granted_at ?? null,
        });
      }
    }
  }

  return NextResponse.json(
    {
      verifiedCategoriesByUser,
      chainsByRoot,
    },
    { headers: NO_STORE }
  );
}
