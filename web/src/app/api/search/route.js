// @migrated-to-permissions 2026-04-18
// @feature-verified search 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { safeErrorResponse } from '@/lib/apiErrors';
import { runArticleSearch } from '@/lib/search/runArticleSearch';
import { runUnifiedSearch } from '@/lib/search/runUnifiedSearch';
import { sanitizeIlikeTerm, sanitizeWebsearchTerm } from '@/lib/search/sanitize';

// GET /api/search?q=...&category=...&subcategory=...&from=...&to=...&source=...
// D26: basic keyword for everyone (anon can search titles), advanced
// filters (date range, category, subcategory, source) are paid-tier only.
// Filters from unauthorized callers are silently ignored.
//
// Gate swap: the former `_user_is_paid` RPC is replaced with
// `hasPermissionServer('search.advanced')` — same source of truth the
// client uses to decide whether to render the filter panel. The route
// is intentionally NOT wrapped in `requirePermission` because anon
// visitors are allowed basic title search (`search.articles.free` is
// on the `anon` set); `requirePermission` would 401 them.
//
// Wave 1 of unified-search session extracted the data-access core to
// `@/lib/search/runArticleSearch`. This handler stays a thin
// permission/adapter layer — it resolves request → permissions →
// filters, then forwards to the lib. Permission gates and any future
// rate-limit calls live HERE in the route, not the lib.

export async function GET(request) {
  const url = new URL(request.url);
  const rawQ = url.searchParams.get('q') || '';
  // We re-run the sanitizers here purely to detect the empty-q
  // case before doing any permission work. The lib re-sanitizes
  // internally — duplication is intentional and cheap.
  const qIlike = sanitizeIlikeTerm(rawQ);
  const qWebsearch = sanitizeWebsearchTerm(rawQ);
  // Detect whether the caller is on the unified (Session B) contract.
  // Empty-q is a VALID state for the unified flow — per TODO-SEARCH
  // locked decision 4, no-query + filters = curated browse (e.g.
  // ?topic=climate → all active climate stories). Only the legacy
  // path returns the early empty-articles shape.
  const wantsUnified =
    url.searchParams.has('unified') ||
    url.searchParams.has('type') ||
    url.searchParams.has('topic') ||
    url.searchParams.has('status') ||
    url.searchParams.has('chip') ||
    url.searchParams.has('sort');
  if (!qIlike && !qWebsearch && !wantsUnified) {
    return NextResponse.json({ articles: [] });
  }

  // Permission-driven tier check. For anon callers this returns false
  // and we stay on the basic title-only path.
  const canAdvanced = await hasPermissionServer('search.advanced');

  // Per-filter advanced-permission resolver. The lib invokes this
  // lazily — only when a given filter is actually present — so we
  // preserve the historical "no extra RPC if filter not supplied"
  // behavior. Lib stays free of auth imports.
  const checkAdvancedFilterPerm = (filter) => {
    switch (filter) {
      case 'category':
        return hasPermissionServer('search.advanced.category');
      case 'subcategory':
        return hasPermissionServer('search.advanced.subcategory');
      case 'date_range':
        return hasPermissionServer('search.advanced.date_range');
      case 'source':
        return hasPermissionServer('search.advanced.source');
      default:
        return Promise.resolve(false);
    }
  };

  const filters = {
    category: url.searchParams.get('category'),
    subcategory: url.searchParams.get('subcategory'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    source: url.searchParams.get('source'),
  };
  const kidScope =
    url.searchParams.get('kids') === '1' || !!url.searchParams.get('kid_profile_id');

  // TODO-SEARCH Session B: opt in to the unified Story + Article feed
  // when the caller passes any of the new params (?unified, ?type,
  // ?topic, ?status, ?chip, ?sort). Legacy callers (iOS FindView,
  // existing /search page) that pass none of these continue to hit
  // runArticleSearch and receive the historical `{articles, mode,
  // ignored_filters}` shape unchanged.
  if (wantsUnified) {
    const typeParam = (url.searchParams.get('type') || 'all').toLowerCase();
    const type =
      typeParam === 'stories' || typeParam === 'articles' ? typeParam : 'all';
    const statusParam = (url.searchParams.get('status') || '').toLowerCase();
    const status =
      statusParam === 'developing' || statusParam === 'updated' ? statusParam : null;
    const chipParam = (url.searchParams.get('chip') || 'all').toLowerCase();
    const chip = [
      'all',
      'today',
      'this_week',
      'developing',
      'updated_recently',
    ].includes(chipParam)
      ? chipParam
      : 'all';
    // 'relevance' was retired from the UI (the option silently sorted by
    // date — see UnifiedSearch SORT_OPTIONS). It stays in the allowlist
    // for inbound-URL back-compat and is coerced to 'recent', which is
    // the new default and what the lib already produced for 'relevance'.
    const sortParam = (url.searchParams.get('sort') || 'recent').toLowerCase();
    const allowedSort = [
      'relevance',
      'recent',
      'newest_article',
      'most_sourced',
      'just_broke',
      'resurfacing',
      'long_arcs',
    ].includes(sortParam)
      ? sortParam
      : 'recent';
    const sort = allowedSort === 'relevance' ? 'recent' : allowedSort;

    const unified = await runUnifiedSearch({
      q: rawQ,
      type,
      topicSlug: url.searchParams.get('topic'),
      status,
      chip,
      sort,
      from: filters.from,
      to: filters.to,
      source: filters.source,
      canAdvanced,
      checkAdvancedFilterPerm,
      kidScope,
      supabase: createServiceClient(),
    });
    if (!unified.ok) {
      return safeErrorResponse(NextResponse, unified.error, {
        route: 'search',
        fallbackStatus: 400,
      });
    }
    return NextResponse.json(unified.value);
  }

  const result = await runArticleSearch({
    q: rawQ,
    filters,
    canAdvanced,
    checkAdvancedFilterPerm,
    kidScope,
    supabase: createServiceClient(),
  });

  if (!result.ok) {
    return safeErrorResponse(NextResponse, result.error, {
      route: 'search',
      fallbackStatus: 400,
    });
  }

  return NextResponse.json(result.value);
}
