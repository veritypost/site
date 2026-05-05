// EXPERT_THREADS Wave 4b — GET /api/expert/picker?article_id=<uuid>
//
// Powers the @expert picker in CommentComposer. Returns the article's
// category + the list of currently-active experts in that category
// (NOT paused, NOT in quiet hours, NOT at per-day quota, NOT at per-post
// quota for this article). Picker rate-limit is enforced inside the
// RPC `list_active_experts_for_category` (10/min per asker via
// `check_rate_limit`) — on hit the RPC raises P0001 'rate_limited' which
// we surface as 429 + the spec-mandated toast copy.
//
// Kill switch read once at entry — feature off → 404 (don't reveal the
// surface exists). Owner-mode bypasses the RPC's rate-limit + filter
// (see RPC body); same authz the rest of Wave 3+ uses.
//
// Response shape (200):
//   {
//     category_id:   uuid,
//     category_name: string,
//     experts: [{ id, username, display_name, avatar_url, avatar_color,
//                 expert_title }]   -- in_category, currently active
//   }
// Rate-limited (429):
//   { error: 'rate_limited',
//     composer_message: 'easy on the search — try again in a sec' }

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { isExpertThreadsEnabled } from '@/lib/expertConfig';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(request) {
  if (!(await isExpertThreadsEnabled())) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[expert.picker.permission]', err?.message || err);
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

  // Resolve article → category. The picker RPC takes p_category_id
  // directly; the composer only knows the article it lives on, so we
  // do the join here and then call the RPC.
  const { data: article, error: articleErr } = await service
    .from('articles')
    .select('id, category_id, categories!fk_articles_category_id(id, name)')
    .eq('id', articleId)
    .maybeSingle();

  if (articleErr) {
    console.error('[expert.picker.article_lookup]', articleErr);
    return NextResponse.json(
      { error: 'lookup_failed' },
      { status: 500, headers: NO_STORE }
    );
  }
  if (!article || !article.category_id) {
    return NextResponse.json(
      { error: 'article_not_found' },
      { status: 404, headers: NO_STORE }
    );
  }

  const categoryId = article.category_id;
  const categoryName =
    (article.categories &&
      typeof article.categories === 'object' &&
      'name' in article.categories &&
      typeof article.categories.name === 'string')
      ? article.categories.name
      : '';

  // Call the RPC. Rate-limit + filtering live inside it.
  const { data: ids, error: rpcErr } = await service.rpc(
    'list_active_experts_for_category',
    {
      p_category_id: categoryId,
      p_article_id: articleId,
      p_asker_id: user.id,
    }
  );

  if (rpcErr) {
    // Picker rate-limit raises 'rate_limited' (P0001).
    const msg = (rpcErr.message || '').toLowerCase();
    if (rpcErr.code === 'P0001' && msg.includes('rate_limited')) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          composer_message: 'easy on the search — try again in a sec',
        },
        { status: 429, headers: NO_STORE }
      );
    }
    console.error('[expert.picker.rpc]', rpcErr);
    return NextResponse.json(
      { error: 'lookup_failed' },
      { status: 500, headers: NO_STORE }
    );
  }

  const expertIds = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];

  // Resolve to display rows. public_profiles_v whitelists the columns
  // safe for non-admin viewers (matches CommentThread's loadAll).
  let experts = [];
  if (expertIds.length > 0) {
    const { data: rows, error: profErr } = await service
      .from('public_profiles_v')
      .select('id, username, display_name, avatar_url, avatar_color, is_expert, expert_title')
      .in('id', expertIds);
    if (profErr) {
      console.error('[expert.picker.profile_lookup]', profErr);
      // Return the IDs anyway so the composer can still render usernames
      // resolved from the body's existing mention map. But the picker UX
      // benefits from the display data, so log + degrade gracefully.
    } else {
      experts = (rows || []).filter(
        (r) => typeof r.id === 'string' && typeof r.username === 'string'
      );
    }
  }

  return NextResponse.json(
    {
      category_id: categoryId,
      category_name: categoryName,
      experts,
    },
    { headers: NO_STORE }
  );
}
