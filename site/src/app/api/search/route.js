import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET /api/search?q=...&category=...&subcategory=...&from=...&to=...&source=...
// D26: basic keyword for everyone (anon can search titles), advanced
// filters (date range, category, subcategory, source) are Verity+ only.
// Filters from free users are silently ignored.
// Strip PostgREST filter-delimiter chars + wildcards so user input
// can't break out of the enclosing .or()/.ilike() pattern.
function sanitizeIlikeTerm(s) {
  return String(s || '').replace(/[,.%*()"\\]/g, ' ').trim();
}

export async function GET(request) {
  const url = new URL(request.url);
  const q = sanitizeIlikeTerm(url.searchParams.get('q') || '');
  if (!q) return NextResponse.json({ articles: [] });

  // Look up the caller for paid-status gating; anon is fine too.
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  let isPaid = false;
  if (authUser) {
    const service = createServiceClient();
    const { data } = await service.rpc('_user_is_paid', { p_user_id: authUser.id });
    isPaid = !!data;
  }

  const category = url.searchParams.get('category');
  const subcategory = url.searchParams.get('subcategory');
  const source = sanitizeIlikeTerm(url.searchParams.get('source'));
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const kidScope = url.searchParams.get('kids') === '1' || !!url.searchParams.get('kid_profile_id');

  // Basic: title ILIKE. Paid: add body + excerpt, plus filter chain.
  const service = createServiceClient();
  let query = service
    .from('articles')
    .select('id, title, slug, excerpt, published_at, category_id, is_kids_safe, categories(name)')
    .eq('status', 'published')
    .limit(50)
    .order('published_at', { ascending: false });

  // D12 (kid surfaces exclude adult content): when a kid context is
  // signalled, only return articles flagged is_kids_safe. Belt +
  // suspenders — even when called directly with ?kids=1.
  if (kidScope) {
    query = query.eq('is_kids_safe', true);
  } else {
    // Adults never want kid-only articles polluting results.
    query = query.eq('is_kids_safe', false);
  }

  if (isPaid) {
    // Migration 046 added articles.search_tsv (generated from title + excerpt + body)
    // with a GIN index. websearch handles bare keywords + quoted phrases + AND/OR the
    // way users expect, so we hand the sanitized q straight through.
    query = query.textSearch('search_tsv', q, { type: 'websearch', config: 'english' });
    if (category)    query = query.eq('category_id', category);
    if (subcategory) query = query.eq('subcategory_id', subcategory);
    if (from)        query = query.gte('published_at', from);
    if (to)          query = query.lte('published_at', to);
    if (source) {
      // Source filter requires a join through the sources table.
      const { data: srcArticleIds } = await service
        .from('sources')
        .select('article_id')
        .ilike('publisher', `%${source}%`)
        .limit(500);
      const ids = (srcArticleIds || []).map(r => r.article_id);
      if (ids.length === 0) return NextResponse.json({ articles: [], applied: { source } });
      query = query.in('id', ids);
    }
  } else {
    query = query.ilike('title', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    articles: data || [],
    mode: isPaid ? 'advanced' : 'basic',
  });
}
