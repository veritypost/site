import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { sanitizeIlikeTerm, sanitizeWebsearchTerm } from './sanitize';

// Shared article-search core used by /api/search. Lives in lib/ so the
// route handler can stay a thin permission/rate-limit adapter and so
// other future entry points (server components, RSC handlers, etc.)
// can reuse the same data-access path without duplicating logic.
//
// Permission/auth/rate-limit decisions are explicitly NOT performed
// here — the caller is responsible for resolving `canAdvanced` and
// the per-filter advanced-permission booleans before invoking. This
// keeps the lib pure data-access and easy to test.
//
// Response shape MUST stay byte-identical to the historical
// `/api/search` JSON response — iOS FindView's frozen contract
// decodes `articles` and the web /search page reads `articles`,
// `mode`, and `ignored_filters`.

export interface ArticleSearchFilters {
  category?: string | null;
  subcategory?: string | null;
  from?: string | null;
  to?: string | null;
  source?: string | null;
}

export type AdvancedFilterName = 'category' | 'subcategory' | 'date_range' | 'source';

// Resolver the caller passes in so this lib stays free of any auth
// imports. The route handler implements it with `hasPermissionServer`.
// Invoked lazily — only when a given filter is actually present in
// the request — to preserve the historical permission-check pattern.
export type AdvancedFilterPermCheck = (filter: AdvancedFilterName) => Promise<boolean>;

export interface RunArticleSearchInput {
  q: string;
  filters: ArticleSearchFilters;
  canAdvanced: boolean;
  // Required when `canAdvanced` is true; optional otherwise.
  checkAdvancedFilterPerm?: AdvancedFilterPermCheck;
  // null = adult web (default-adult); true = kid-scoped request;
  // false = explicit adult (same default-adult treatment as null).
  // The route handler maps `?kids=1` / `?kid_profile_id` to true.
  kidScope: boolean | null;
  supabase: SupabaseClient<Database>;
}

// Loose article row — matches the SELECT projection below. We don't
// constrain to a generated row type because the embed `categories!fk_...(name)`
// shape isn't expressible cleanly via Database types and the historical
// response forwards `data` as-is.
export type ArticleSearchRow = Record<string, unknown>;

export type RunArticleSearchSuccess =
  | {
      articles: ArticleSearchRow[];
      mode: 'basic' | 'advanced';
      ignored_filters: string[];
    }
  | {
      // Source-filter no-match early return path. Preserves the
      // historical `applied: { source }` field that the route used
      // to return when an advanced source filter resolved to zero
      // article ids.
      articles: [];
      applied: { source: string };
      ignored_filters: string[];
    };

export type RunArticleSearchResult =
  | { ok: true; value: RunArticleSearchSuccess }
  | { ok: false; error: unknown };

export async function runArticleSearch(
  input: RunArticleSearchInput
): Promise<RunArticleSearchResult> {
  const { q: rawQ, filters, canAdvanced, checkAdvancedFilterPerm, kidScope, supabase } = input;

  const q = sanitizeIlikeTerm(rawQ);
  const qAdvanced = sanitizeWebsearchTerm(rawQ);

  // Empty-q short-circuit is the route handler's responsibility — it
  // returns the historical `{ articles: [] }` shape (no `mode`, no
  // `ignored_filters`) before we ever get here. Defensive guard only.
  if (!q && !qAdvanced) {
    return {
      ok: true,
      value: { articles: [], mode: canAdvanced ? 'advanced' : 'basic', ignored_filters: [] },
    };
  }

  const category = filters.category || null;
  const subcategory = filters.subcategory || null;
  const source = sanitizeIlikeTerm(filters.source);
  const from = filters.from || null;
  const to = filters.to || null;

  // Basic: title ILIKE. Paid: add body + excerpt, plus filter chain.
  let query = supabase
    .from('articles')
    .select(
      'id, title, stories(slug), excerpt, published_at, category_id, is_kids_safe, categories!fk_articles_category_id(name)'
    )
    .eq('status', 'published')
    .not('stories.slug', 'is', null)
    .limit(50)
    .order('published_at', { ascending: false });

  // D12 (kid surfaces exclude adult content): when a kid context is
  // signalled, only return articles flagged is_kids_safe. Belt +
  // suspenders — even when called directly with ?kids=1.
  if (kidScope === true) {
    query = query.eq('is_kids_safe', true);
  } else {
    // Adults never want kid-only articles polluting results.
    query = query.eq('is_kids_safe', false);
  }

  // H6 — track which filters the caller sent but the server dropped
  // (either because they're not on advanced tier, or because their
  // permission matrix has the specific filter gated off). UI can
  // surface this so a free user hand-editing the URL doesn't get
  // results that silently ignore their filters.
  const ignoredFilters: string[] = [];

  if (canAdvanced) {
    // Migration 046 added articles.search_tsv (generated from title + excerpt + body)
    // with a GIN index. websearch handles bare keywords + quoted phrases + AND/OR the
    // way users expect, so we hand the sanitized q straight through.
    query = query.textSearch('search_tsv', qAdvanced, { type: 'websearch', config: 'english' });

    // Default-deny if caller didn't supply a resolver (defensive —
    // route handler always passes one when canAdvanced is true).
    const checkPerm: AdvancedFilterPermCheck = checkAdvancedFilterPerm || (async () => false);

    if (category) {
      if (await checkPerm('category')) {
        query = query.eq('category_id', category);
      } else {
        ignoredFilters.push('category');
      }
    }
    if (subcategory) {
      if (await checkPerm('subcategory')) {
        query = query.eq('subcategory_id', subcategory);
      } else {
        ignoredFilters.push('subcategory');
      }
    }
    if (from || to) {
      if (await checkPerm('date_range')) {
        if (from) query = query.gte('published_at', from);
        if (to) query = query.lte('published_at', to);
      } else {
        ignoredFilters.push('date_range');
      }
    }
    if (source) {
      if (await checkPerm('source')) {
        // Source filter requires a join through the sources table.
        const { data: srcArticleIds } = await supabase
          .from('sources')
          .select('article_id')
          .ilike('publisher', `%${source}%`)
          .limit(500);
        const ids = (srcArticleIds || []).map((r) => r.article_id).slice(0, 200);
        if ((srcArticleIds || []).length > 200) {
          ignoredFilters.push('source_partial');
        }
        if (ids.length === 0) {
          return {
            ok: true,
            value: {
              articles: [],
              applied: { source },
              ignored_filters: ignoredFilters,
            },
          };
        }
        query = query.in('id', ids);
      } else {
        ignoredFilters.push('source');
      }
    }
  } else {
    query = query.ilike('title', `%${q}%`);
    // H6 — in basic mode, record each advanced filter the caller
    // passed so the UI can show "Advanced filters ignored — upgrade
    // to apply category / date / source filters."
    if (category) ignoredFilters.push('category');
    if (subcategory) ignoredFilters.push('subcategory');
    if (from || to) ignoredFilters.push('date_range');
    if (source) ignoredFilters.push('source');
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, error };
  }

  return {
    ok: true,
    value: {
      articles: (data as ArticleSearchRow[] | null) || [],
      mode: canAdvanced ? 'advanced' : 'basic',
      ignored_filters: ignoredFilters,
    },
  };
}
