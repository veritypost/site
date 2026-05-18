// Home — thin server component. Fetches the live layout (or a
// preview-slug layout if passed) and delegates to HomeLayout. No
// hardcoded markup. Editorial chrome (the bordered grid, ticker,
// insight row, chumbox) is driven entirely by the home_layouts /
// home_slots / home_slot_items tables, configurable via /admin/home.

import { createServiceClient } from '../../lib/supabase/server';
import type { Tables } from '@/types/database-helpers';
import { fetchLayoutBySlug, fetchLiveLayout } from './data';
import HomeLayout from './HomeLayout';
import { relativeTimeBucket } from './_shared';
import type { TrendingArticle } from './slots/_shared';
import RhStyles from './styles';

type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

// Row shape of the `trending_stories_recent` view (mirror of database.ts
// without dragging the generated type in here).
type TrendingViewRow = {
  id: string | null;
  story_id: string | null;
  story_slug: string | null;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  category_id: string | null;
};

export type HomeFilter = {
  chip?: string;
  sort?: string;
  topic?: string;
  type?: string;
  q?: string;
  from?: string;
  to?: string;
};

export default async function HomeRoot({
  previewSlug,
  filter,
}: {
  previewSlug?: string;
  filter?: HomeFilter;
} = {}) {
  const service = createServiceClient();
  const activeFilter =
    filter &&
    (filter.chip ||
      filter.sort ||
      filter.topic ||
      filter.type ||
      filter.q ||
      filter.from ||
      filter.to)
      ? filter
      : null;

  const [layout, catsRes] = await Promise.all([
    previewSlug
      ? fetchLayoutBySlug(service, previewSlug)
      : fetchLiveLayout(),
    service
      .from('categories')
      .select('id, name, slug, color_hex, parent_id, sort_order')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false }),
  ]);

  const cats = (catsRes.data as CategoryRow[] | null) || [];
  const categoryById: Record<string, CategoryRow> = {};
  cats.forEach((c) => {
    categoryById[c.id] = c;
  });

  if (!layout || layout.slots.length === 0) {
    return (
      <div className="vp-rh">
        <p className="vp-rh-empty">No live layout configured.</p>
        <RhStyles />
      </div>
    );
  }

  // Wave 3: pre-fetch trending stories ONLY if at least one list_rail
  // slot in the layout has `config.source === 'trending'`. Avoids a
  // wasted query on layouts that don't surface the rail.
  const needsTrending = layout.slots.some(
    (s) =>
      s.kind === 'list_rail' &&
      (s.config as Record<string, unknown> | null)?.source === 'trending',
  );
  let trendingArticles: TrendingArticle[] | undefined;
  if (needsTrending) {
    const { data } = await service
      .from('trending_stories_recent')
      .select(
        'id, story_id, story_slug, title, excerpt, published_at, category_id',
      )
      .limit(10);
    const rows = (data ?? []) as TrendingViewRow[];
    trendingArticles = rows
      .filter(
        (r): r is TrendingViewRow & { id: string; category_id: string } =>
          !!r.id && !!r.category_id,
      )
      .map((r) => ({
        id: r.id,
        title: r.title || '',
        excerpt: r.excerpt,
        category_id: r.category_id,
        is_breaking: false,
        is_developing: false,
        published_at: r.published_at,
        updated_at: r.published_at ?? '',
        stories: r.story_slug
          ? { slug: r.story_slug, lifecycle_status: null }
          : null,
        cover_image_url: null,
        cover_image_alt: null,
        story_id: r.story_id,
        ad_eligible: null,
        sensitivity_tags: null,
      }));
  }

  // Auto-pool fill was removed 2026-05-16 — owner editorial flow now
  // requires every slot's article to be pinned via /admin/home. Empty
  // slots stay empty rather than silently showing a recent article
  // the editor didn't choose. Re-enable here only if a future demo
  // page needs auto-fill again.
  let filledLayout = layout;

  // Filter mode — when chip/topic/sort/type is active, the editorial
  // slot layout STAYS (hero + story cards + rail cards + squares)
  // but the article references inside hero/story_card/square slots
  // get swapped for articles matching the filter, oldest pinned slot
  // first. Rail cards (single + list variants), banner, and other
  // self-sourcing slots keep their existing content so the page
  // shape is identical to the home — only the article content rotates.
  // This is what powers /politics, /technology, /?today, etc.
  if (activeFilter) {
    const slugToId = new Map(cats.map((c) => [c.slug, c.id] as const));
    let q = service
      .from('articles')
      .select(
        'id, title, stories(slug, lifecycle_status), excerpt, category_id, story_id, is_breaking, is_developing, published_at, updated_at, cover_image_url, cover_image_alt, ad_eligible, sensitivity_tags',
      )
      .eq('status', 'published')
      .is('deleted_at', null);

    const now = Date.now();
    const day = 86400000;
    if (activeFilter.chip === 'today')
      q = q.gte('published_at', new Date(now - day).toISOString());
    else if (activeFilter.chip === 'this_week')
      q = q.gte('published_at', new Date(now - 7 * day).toISOString());
    else if (activeFilter.chip === 'this_month') {
      // First moment of the current calendar month (server local UTC).
      const d = new Date();
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      q = q.gte('published_at', start.toISOString());
    } else if (activeFilter.chip === 'new_24h')
      q = q.gte('published_at', new Date(now - day).toISOString());
    else if (activeFilter.sort === 'updated_recently')
      q = q.gte('updated_at', new Date(now - 7 * day).toISOString());

    // No-discussion lens — articles with zero comments. Renders as a
    // VIEW pick in the new filter pill; backend stays a simple
    // .or() against comment_count.
    if (activeFilter.type === 'no_discussion') {
      q = q.or('comment_count.is.null,comment_count.eq.0');
    }

    if (activeFilter.topic) {
      const catId = slugToId.get(activeFilter.topic);
      if (catId) {
        // Subcategory rollup — when the slug resolves to a parent
        // category (parent_id IS NULL), the feed should include
        // articles in any of its child subcategories too. /politics
        // surfaces Congress/Elections/White House articles, not just
        // ones pinned to the bare parent. categoryById is already
        // hydrated from the same cats query above, so no extra DB
        // round-trip.
        const cat = categoryById[catId];
        if (cat && !cat.parent_id) {
          const childIds = cats
            .filter((c) => c.parent_id === catId)
            .map((c) => c.id);
          if (childIds.length > 0) {
            q = q.in('category_id', [catId, ...childIds]);
          } else {
            q = q.eq('category_id', catId);
          }
        } else {
          q = q.eq('category_id', catId);
        }
      }
    }

    if (activeFilter.chip === 'developing') {
      q = q.eq('is_developing', true);
    }
    // Date range — owner-supplied `from`/`to` cap published_at on
    // both ends. Useful for "show me everything in this category
    // between Apr 1 and Apr 14". Bare YYYY-MM-DD strings work
    // because Postgres coerces.
    if (activeFilter.from) {
      q = q.gte('published_at', activeFilter.from);
    }
    if (activeFilter.to) {
      q = q.lte('published_at', activeFilter.to);
    }
    // Free-text — title ILIKE so the in-page search submits land on
    // /?q=foo and the home feed shows matching articles. Cheap
    // server-side fallback before any tsvector wiring lands.
    if (activeFilter.q) {
      const safe = activeFilter.q.replace(/[%_]/g, ' ').trim();
      if (safe) q = q.ilike('title', `%${safe}%`);
    }

    // Sort selection — `most_discussed` and `most_viewed` ride the
    // denormalized counters on articles (comment_count, view_count)
    // so they're a single column-order. `most_recent_comments` can't
    // be done in a single PostgREST .order() call because the sort
    // key (max(comments.created_at) per article) lives on a different
    // table; we run a small pre-query to get the article-ids in
    // recency order, then constrain + reorder the main feed below.
    // `newest_article` uses published_at, everything else falls back
    // to updated_at (the default home order).
    let recentCommentOrder: string[] | null = null;
    if (activeFilter.sort === 'most_recent_comments') {
      const { data: commentRows } = await service
        .from('comments')
        .select('article_id, created_at')
        .is('deleted_at', null)
        .eq('status', 'visible')
        .not('article_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const r of (commentRows ?? []) as Array<{
        article_id: string | null;
      }>) {
        const aid = r.article_id;
        if (!aid || seen.has(aid)) continue;
        seen.add(aid);
        ids.push(aid);
        if (ids.length >= 60) break;
      }
      recentCommentOrder = ids;
      if (ids.length > 0) {
        q = q.in('id', ids);
      } else {
        // No comments anywhere — return an empty feed rather than
        // silently falling back to updated_at order.
        q = q.in('id', ['00000000-0000-0000-0000-000000000000']);
      }
    } else if (activeFilter.sort === 'most_discussed') {
      q = q.order('comment_count', { ascending: false, nullsFirst: false });
    } else if (activeFilter.sort === 'most_viewed') {
      q = q.order('view_count', { ascending: false, nullsFirst: false });
    } else if (activeFilter.sort === 'newest_article') {
      q = q.order('published_at', { ascending: false });
    } else {
      q = q.order('updated_at', { ascending: false });
    }
    q = q.limit(60);

    const { data: feedRows } = await q;
    let feed = ((feedRows as import('./types').HomeStory[] | null) ?? []).filter(
      (a) => !!a.stories?.slug,
    );
    // Reorder by comment-recency when that sort is active (PostgREST
    // gave us the rows in arbitrary order since the .in() clause
    // doesn't preserve list order).
    if (recentCommentOrder) {
      const rank = new Map(recentCommentOrder.map((id, i) => [id, i] as const));
      feed = feed
        .filter((a) => rank.has(a.id))
        .sort((a, b) => (rank.get(a.id)! - rank.get(b.id)!));
    }

    // Walk the existing slots in position order. For every story_card
    // slot (hero + regular) and every square_row inner cell, replace
    // its items with the NEXT unique feed entry. Once the feed is
    // exhausted, remaining slots blank out — we don't cycle, so a
    // category with 3 articles doesn't repeat those 3 across 30 slots.
    let feedIdx = 0;
    const nextArticle = () => {
      if (feedIdx >= feed.length) return null;
      const a = feed[feedIdx];
      feedIdx += 1;
      return a;
    };
    const swappedSlots = layout.slots.map((s) => {
      if (s.kind === 'story_card') {
        const article = nextArticle();
        if (!article) return { ...s, items: [] };
        return {
          ...s,
          items: [
            {
              id: `filter-${s.id}`,
              position: 0,
              content_type: 'article' as const,
              article,
              ref_id: null,
              payload: {},
            },
          ],
        };
      }
      if (s.kind === 'square_row') {
        const cap = Array.isArray(s.items) ? s.items.length || 5 : 5;
        const newItems = Array.from({ length: cap }, (_, i) => {
          const article = nextArticle();
          return article
            ? {
                id: `filter-${s.id}-${i}`,
                position: i,
                content_type: 'article' as const,
                article,
                ref_id: null,
                payload: {},
              }
            : null;
        }).filter((it): it is NonNullable<typeof it> => it !== null);
        return { ...s, items: newItems };
      }
      return s;
    });
    filledLayout = { ...layout, slots: swappedSlots };
  }

  // Hero timeline + meta strip. The "How we got here" rail shows the
  // top-5 most relevant events; the meta strip below the dek shows
  // lifecycle status, total timeline + sources counts, relative
  // last-changed time, and (when today) the most recent event's body
  // as a "Changed today" note. All values are precomputed server-side
  // so the renderer stays purely presentational.
  const heroSlot = filledLayout.slots.find(
    (s) =>
      s.kind === 'story_card' &&
      (s.config as { variant?: string } | null)?.variant === 'hero',
  );
  const heroArticle = heroSlot?.items[0]?.article ?? null;
  const heroStoryId = heroArticle?.story_id ?? null;
  const heroArticleId = heroArticle?.id ?? null;

  let heroTimeline:
    | import('./slots/_shared').HeroTimelineEvent[]
    | undefined;
  let heroMeta: import('./slots/_shared').HeroMeta | undefined;

  if (heroStoryId) {
    type TlRow = {
      id: string;
      event_label: string | null;
      event_date: string | null;
      event_body: string | null;
    };
    const [tlRes, tlCountRes, srcCountRes, storyRes, latestRes] =
      await Promise.all([
        service
          .from('timelines')
          .select('id, event_label, event_date, event_body')
          .eq('story_id', heroStoryId)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('event_date', { ascending: false })
          .limit(5),
        service
          .from('timelines')
          .select('id', { count: 'exact', head: true })
          .eq('story_id', heroStoryId),
        heroArticleId
          ? service
              .from('article_sources')
              .select('id', { count: 'exact', head: true })
              .eq('article_id', heroArticleId)
          : Promise.resolve({ count: 0 } as { count: number | null }),
        service
          .from('stories')
          .select('lifecycle_status, updated_at')
          .eq('id', heroStoryId)
          .maybeSingle<{ lifecycle_status: string | null; updated_at: string | null }>(),
        // Separate "most recent event" lookup. Can't reuse tlRes because
        // that sorts by sort_order asc (mock-grid display order), which
        // returns the oldest event first — not the freshest.
        service
          .from('timelines')
          .select('event_date, event_body')
          .eq('story_id', heroStoryId)
          .not('event_date', 'is', null)
          .order('event_date', { ascending: false })
          .limit(1)
          .maybeSingle<{ event_date: string | null; event_body: string | null }>(),
      ]);

    const tlRaw = ((tlRes.data ?? []) as TlRow[]);
    const todayKey = new Date().toISOString().slice(0, 10);
    const isToday = (iso: string | null) =>
      !!iso && iso.slice(0, 10) === todayKey;

    heroTimeline = tlRaw.map((r) => ({
      id: r.id,
      event_label: r.event_label,
      event_date: r.event_date,
      event_body: r.event_body,
      isToday: isToday(r.event_date),
    }));

    const lastTs =
      latestRes.data?.event_date ?? storyRes.data?.updated_at ?? null;
    const lifecycle = storyRes.data?.lifecycle_status ?? null;
    const lifecycleLabel =
      lifecycle && lifecycle !== 'closed' ? lifecycle.toUpperCase() : null;
    // "Changed today" body — only when the freshest event is dated today.
    const todaysChange = isToday(latestRes.data?.event_date ?? null)
      ? latestRes.data?.event_body ?? null
      : null;

    heroMeta = {
      lifecycleLabel,
      timelineCount: tlCountRes.count ?? tlRaw.length,
      sourcesCount: srcCountRes.count ?? 0,
      lastChangedRelative: lastTs ? relativeTimeBucket(lastTs) : null,
      lastChangedIso: lastTs ?? null,
      changeNote: todaysChange,
    };
  }

  // Time keys belong to chip; view keys cover sort + type (+ some chips
  // like new_24h that are conceptually views). Split them out so the
  // filter pill can render the SCOPE / VIEW / TIME summary cleanly.
  const TIME_CHIPS = new Set(['today', 'this_week', 'this_month']);
  const activeTime = activeFilter?.chip && TIME_CHIPS.has(activeFilter.chip)
    ? activeFilter.chip
    : undefined;
  const activeView =
    activeFilter?.sort ??
    activeFilter?.type ??
    (activeFilter?.chip && !TIME_CHIPS.has(activeFilter.chip)
      ? activeFilter.chip
      : undefined);

  return (
    <HomeLayout
      layout={filledLayout}
      categoryById={categoryById}
      trendingArticles={trendingArticles}
      heroTimeline={heroTimeline}
      heroMeta={heroMeta}
      activeTopic={activeFilter?.topic}
      activeView={activeView}
      activeTime={activeTime}
      fromDate={activeFilter?.from}
      toDate={activeFilter?.to}
      activeQ={activeFilter?.q}
    />
  );
}

// Bucketed relative-time formatter lives in ./_shared as
// `relativeTimeBucket` so HomeRoot (SSR) and RelativeTime (client) use
// the exact same ramp and the hero meta strip doesn't hydrate-flicker.
