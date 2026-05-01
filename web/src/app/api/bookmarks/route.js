// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { trackServer } from '@/lib/trackServer';

// T170/T209 — bookmarks are per-user state; never cacheable by a CDN
// or shared proxy.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// POST /api/bookmarks — create. Cap enforced by trigger.
// Body: { article_id, collection_id?, notes? }
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('article.bookmark.add');
  } catch (err) {
    console.error('[bookmarks.POST]', err);
    if (err.status) {
      return NextResponse.json(
        { error: 'Not allowed to bookmark' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  // God-mode bypass: owners skip maintenance gate, rate limit, and plan cap.
  const isGodMode = user.email === 'admin@veritypost.com';

  if (!isGodMode) {
    const blocked = await v2LiveGuard();
    if (blocked) return blocked;
  }

  const { article_id, collection_id, notes } = await request.json().catch(() => ({}));
  if (!article_id)
    return NextResponse.json({ error: 'article_id required' }, { status: 400, headers: NO_STORE });

  const service = createServiceClient();

  if (!isGodMode) {
    const rate = await checkRateLimit(service, {
      key: `bookmarks:${user.id}`,
      policyKey: 'bookmarks',
      max: 60,
      windowSec: 60,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } }
      );
    }
  }

  const { data, error } = await service
    .from('bookmarks')
    .insert({
      user_id: user.id,
      article_id,
      collection_id: collection_id || null,
      notes: notes || null,
    })
    .select('id')
    .single();
  if (error) {
    // C9 — idempotent create on unique-violation.
    if (error.code === '23505') {
      const { data: existing } = await service
        .from('bookmarks')
        .select('id')
        .eq('user_id', user.id)
        .eq('article_id', article_id)
        .maybeSingle();
      if (existing?.id)
        return NextResponse.json({ id: existing.id, deduped: true }, { headers: NO_STORE });
    }
    // P0001 from `enforce_bookmark_cap` — god-mode users bypass the cap
    // via a SECURITY DEFINER RPC that disables the trigger for the insert.
    if (isGodMode && error.code === 'P0001') {
      const { data: bypassId, error: bypassErr } = await service.rpc('admin_force_bookmark', {
        p_user_id: user.id,
        p_article_id: article_id,
        p_collection_id: collection_id || null,
        p_notes: notes || null,
      });
      if (!bypassErr && bypassId) {
        void trackServer('bookmark_add', 'product', {
          user_id: user.id, article_id, request,
          payload: { bookmark_id: bypassId, collection_id: collection_id || null, has_notes: !!notes },
        });
        return NextResponse.json({ id: bypassId }, { headers: NO_STORE });
      }
    }
    return safeErrorResponse(NextResponse, error, {
      route: 'bookmarks.POST',
      fallbackStatus: 400,
      fallbackMessage: 'Could not save bookmark',
      headers: NO_STORE,
    });
  }

  // T322 — fire bookmark_add after the row lands. Fire-and-forget.
  void trackServer('bookmark_add', 'product', {
    user_id: user.id,
    article_id,
    request,
    payload: {
      bookmark_id: data.id,
      collection_id: collection_id || null,
      has_notes: !!notes,
    },
  });

  return NextResponse.json({ id: data.id }, { headers: NO_STORE });
}
