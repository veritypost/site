// @migrated-to-permissions 2026-04-18
// @feature-verified search 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { safeErrorResponse } from '@/lib/apiErrors';
import { runArticleSearch } from '@/lib/search/runArticleSearch';
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
  if (!qIlike && !qWebsearch) return NextResponse.json({ articles: [] });

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
