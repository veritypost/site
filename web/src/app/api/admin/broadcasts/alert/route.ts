// @migrated-to-permissions 2026-04-20
// @feature-verified admin_api 2026-04-20
// T-012 — server route for sending a breaking-news alert end-to-end.
//
// Replaces the direct `supabase.from('articles').insert(...)` that
// previously ran from admin/breaking/page.tsx. That path had no rank
// guard, no rate limit, and the audit-log call ran in parallel from
// the client (no atomicity). This route:
//
//   1. requirePermission('admin.broadcasts.breaking.send')
//   2. createServiceClient
//   3. checkRateLimit — 5/10min per actor (breaking-alert spam guard)
//   4. Resolve a valid category (slug=news, else first by sort_order)
//   5. INSERT article with is_breaking=true, status=published
//   6. recordAdminAction audit via the SECDEF RPC
//   7. rpc('send_breaking_news') fan-out (best-effort; failure of
//      the fan-out doesn't undo the article)
//
// Returns { ok: true, article, sent_count, push_error? } on success.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { checkRateLimit } from '@/lib/rateLimit';

type AlertBody = {
  text?: string;
  story?: string;
  target?: 'all' | 'paid' | 'free';
};

export async function POST(request: Request) {
  let actor: { id: string } | undefined;
  try {
    actor = (await requirePermission('admin.broadcasts.breaking.send')) as { id: string };
  } catch (err) {
    return permissionError(err);
  }

  const body = (await request.json().catch(() => ({}))) as AlertBody;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const story = typeof body.story === 'string' ? body.story.trim() : '';
  const target: 'all' | 'paid' | 'free' =
    body.target === 'paid' || body.target === 'free' ? body.target : 'all';

  if (!text) {
    return NextResponse.json({ error: 'text required' }, { status: 400 });
  }

  const service = createServiceClient();

  // Rate limit: accidental double-submit protection + spam guard.
  const rl = await checkRateLimit(service, {
    key: `admin.broadcasts.alert:${actor.id}`,
    policyKey: 'admin.broadcasts.alert',
    max: 5,
    windowSec: 600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many breaking alerts. Wait before sending another.' },
      { status: 429, headers: { 'Retry-After': '600' } }
    );
  }

  // Resolve a valid category. Prefer 'news'; fall back to the first active
  // category by sort_order. Articles.category_id is NOT NULL.
  const { data: newsCat } = await service
    .from('categories')
    .select('id')
    .eq('slug', 'news')
    .maybeSingle();
  let categoryId: string | null = (newsCat as { id: string } | null)?.id ?? null;
  if (!categoryId) {
    const { data: anyCat } = await service
      .from('categories')
      .select('id')
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    categoryId = (anyCat as { id: string } | null)?.id ?? null;
  }
  if (!categoryId) {
    return NextResponse.json(
      { error: 'No categories configured — cannot create breaking alert' },
      { status: 400 }
    );
  }

  const title = text.slice(0, 300);
  const articleBody = story || title;
  const slug = `breaking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const { data: article, error: insErr } = await service
    .from('articles')
    .insert({
      title,
      body: articleBody,
      slug,
      category_id: categoryId,
      author_id: actor.id,
      is_breaking: true,
      status: 'published',
      visibility: 'public',
      published_at: now,
      metadata: { target },
    })
    .select('*, categories!fk_articles_category_id(name)')
    .single();

  if (insErr || !article) {
    console.error('[admin.broadcasts.alert] insert', insErr?.message || 'no row');
    return NextResponse.json({ error: 'Could not create breaking alert' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'breaking_news.send',
    targetTable: 'articles',
    targetId: (article as { id: string }).id,
    newValue: { text: title, story: story || null, target },
  });

  // Best-effort push fan-out. If the RPC fails, the article still exists
  // (published + is_breaking) — a retry is safe via the same route OR the
  // legacy /api/admin/broadcasts/breaking endpoint with article_id.
  try {
    const { data: sentCount, error: pushErr } = await service.rpc('send_breaking_news', {
      p_article_id: (article as { id: string }).id,
      p_title: title,
      p_body: story || null,
    });
    if (pushErr) throw pushErr;
    return NextResponse.json({ ok: true, article, sent_count: sentCount ?? 0 });
  } catch (pushErr) {
    console.error('[admin.broadcasts.alert] push fanout', pushErr);
    return NextResponse.json({ ok: true, article, sent_count: 0, push_error: true });
  }
}
