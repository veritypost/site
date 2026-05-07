//
// T215 — server-rendered front page. Three pieces of data (today's
// stories, today's breaking row, active categories) are fetched on the
// server with the cookie-bearing supabase client, so the masthead +
// hero + supporting cards stream as HTML on the first byte. Anonymous
// LCP no longer waits on a client-side useEffect chain.
//
// Client interactivity is isolated to three small islands rendered
// inside this server tree:
//   _HomeBreakingStrip   — gates the breaking strip behind permission
//                          checks (home.breaking_banner.view + .paid)
//   _HomeFooter          — auth-aware end-of-page CTA, fires the
//                          page_view track event on mount
//   _HomeFetchFailed     — tiny retry button (router.refresh()) shown
//                          when the server fetch errored
//
// The page stays cookie-aware (RLS + auth) so signed-in viewers still
// see their permission-gated chrome and any future per-user filtering
// works out of the box. Next.js automatically marks this route dynamic
// because `cookies()` is read inside the supabase server client.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { Fragment, type CSSProperties } from 'react';
import { createClient, createServiceClient } from '../lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import type { Tables } from '@/types/database-helpers';
import {
  HOME_COLORS as C,
  HOME_SERIF_STACK as serifStack,
  timeShort,
  type HomeStory,
} from './_homeShared';
import HomeBreakingStrip from './_HomeBreakingStrip';
import HomeFooter from './_HomeFooter';
import HomeFetchFailed from './_HomeFetchFailed';
import HomeVisitTimestamp from './_HomeVisitTimestamp';
import HomeSidebar from './_HomeSidebar';
import Ad from '@/components/Ad';

// Curated front page — top_stories is the source of truth. Owner pins
// articles by position; any-age curation, no editorial-day cutoff.
// Falls back to date-DESC published articles when no pins set.

// Story projection the home feed renders lives in `_homeShared.ts` so the
// client islands can import the same shape without pulling this server
// component into the client bundle.
type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'>;

// The home is wall-free by design — the registration-wall gate fires
// inside `web/src/app/story/[slug]/page.tsx` per article view, not on
// browse. Anonymous readers can see the masthead + published stories
// without trial spend. The wall protects the *content*, not the index.

const SELECT_COLS =
  'id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at';

type TopStoryRow = { position: number; articles: HomeStory | null };

// Category accent palette. color_hex in DB is null for all live rows (2026-04-26);
// this map provides a per-slug fallback until editorial populates the column.
// Keys are category slugs; values are dark editorial background hex colors.
const CATEGORY_PALETTE: Record<string, string> = {
  politics: '#1e3a5f',
  congress: '#1e3a5f',
  space: '#1a1a2e',
  science: '#0f3d2e',
  ai: '#1a1a2e',
  markets: '#1b2a1b',
  'personal-finance': '#1b2a1b',
  jobs: '#1b2a1b',
  weather: '#1a3050',
  'public-health': '#3d1a1a',
  nfl: '#1a2a3d',
  movies: '#2a1a2a',
  asia: '#2a1a1a',
  animals: '#1a2a1a',
  'kids-science': '#0f3d2e',
  'kids-animals': '#1a2a1a',
};
const HERO_DEFAULT_BG = '#1a1a1a'; // dark editorial fallback for uncategorized hero

function heroBg(category: CategoryRow | undefined): string {
  if (category?.color_hex) return category.color_hex;
  if (category?.slug && CATEGORY_PALETTE[category.slug]) return CATEGORY_PALETTE[category.slug];
  return HERO_DEFAULT_BG;
}

// ============================================================================
// Page (server component)
// ============================================================================

// `cookies()` lives inside `createClient()`, which already opts this route
// into dynamic rendering — but pinning it here documents the intent and
// guards against an accidental static export if Next changes its
// detection heuristic. Curated feed data is live.
export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: { cat?: string; sub?: string };
}) {
  const supabase = createClient();
  // Public catalog reads (top_stories, published articles, categories) bypass
  // RLS via the service client so anon visitors see the same curated feed as
  // signed-in users — same pattern as `web/src/app/[slug]/page.tsx`. The
  // cookie-aware `supabase` client is still used for `auth.getUser()` and the
  // signed-in user's metadata row below.
  const service = createServiceClient();

  // T91 — last-visit cookie. Stories published after this timestamp get
  // a "New" pill on the next render. Cookie is written by the
  // <HomeVisitTimestamp /> client island after first paint (cookies set
  // from a server component's render pass throw in App Router). On the
  // first ever visit there's no cookie, so we render no "New" tags and
  // just let the island plant the cookie for next time.

  // Declare mutable holders outside the try block so post-fetch code can
  // reference them even when a network/client throw short-circuits the fetch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let storiesRes: { data: any; error: any } = { data: null, error: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let breakingRes: { data: any; error: any } = { data: null, error: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let catsRes: { data: any; error: any } = { data: null, error: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let topStoriesRes: { data: any; error: any } = { data: null, error: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userMetaRes: { data: any; error: any } = { data: null, error: null };
  // Wave E — populated subcategory ids (subs with at least one published,
  // non-deleted article directly assigned). Anonymous + non-admin viewers
  // see ONLY these subs in the sidebar; admins always see every sub.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let populatedSubsRes: { data: any; error: any } = { data: null, error: null };
  let viewerIsAdmin = false;
  let lastVisitMs: number | null = null;
  let fetchThrew = false;

  // Fetch categories first so we can resolve the ?cat=/&sub= slugs to IDs
  // before issuing the filtered articles fetch. The categories list is
  // small and already cached in practice.
  const earlyCatsRes = await service
    .from('categories')
    .select('id, name, slug, color_hex, parent_id, sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false });
  const earlyCatRows = (earlyCatsRes.data as CategoryRow[] | null) || [];
  const activeCat =
    searchParams?.cat
      ? earlyCatRows.find((c) => c.slug === searchParams.cat && c.parent_id === null) ?? null
      : null;
  const activeSub =
    activeCat && searchParams?.sub
      ? earlyCatRows.find((c) => c.slug === searchParams.sub && c.parent_id === activeCat.id) ?? null
      : null;

  try {
    const lastVisitRaw = cookies().get('vp_last_home_visit_at')?.value;
    if (lastVisitRaw) {
      const t = Date.parse(lastVisitRaw);
      if (Number.isFinite(t)) lastVisitMs = t;
    }

    // Fetch signed-in user's feed preferences. Isolated in an IIFE so a
    // failure here never cascades into a full-page fetch error.
    const userMetaPromise = (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) return { data: null, error: null };
        const r = await supabase
          .from('users')
          .select('metadata')
          .eq('id', authData.user.id)
          .single();
        return { data: r.data as { metadata: unknown } | null, error: null };
      } catch {
        return { data: null, error: null };
      }
    })();

    // Build the stories query, layering category filters on when present.
    let storiesQuery = service
      .from('articles')
      .select(SELECT_COLS)
      .eq('status', 'published')
      .eq('browse_only', false)
      .not('stories.slug', 'is', null);
    if (activeCat) storiesQuery = storiesQuery.eq('category_id', activeCat.id);
    if (activeSub) storiesQuery = storiesQuery.eq('subcategory_id', activeSub.id);
    storiesQuery = storiesQuery.order('published_at', { ascending: false }).limit(12);

    // Wave E — admin-aware sidebar. `hasPermissionServer` resolves its own
    // cookie-scoped client and returns false fast for anonymous (no DB hit
    // for null user). Run in parallel with the rest of the home fetch.
    const adminPromise = hasPermissionServer('admin.owner_mode').catch(() => false);

    // Wave E — article-count aggregation (Option A). Live count, not a
    // maintained column; trigger-free per owner direction (article_count on
    // categories is dead). One extra round trip, milliseconds.
    const populatedSubsPromise = service
      .from('articles')
      .select('subcategory_id')
      .not('subcategory_id', 'is', null)
      .is('deleted_at', null)
      .eq('status', 'published');

    let viewerIsAdminTmp: boolean;
    [storiesRes, breakingRes, catsRes, topStoriesRes, userMetaRes, viewerIsAdminTmp, populatedSubsRes] = await Promise.all([
      storiesQuery,
      service
        .from('articles')
        .select(SELECT_COLS)
        .eq('status', 'published')
        .eq('is_breaking', true)
        .eq('browse_only', false)
        .not('stories.slug', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1),
      Promise.resolve(earlyCatsRes),
      service
        .from('top_stories')
        .select('position, articles!top_stories_article_id_fkey(id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at)')
        .order('position'),
      userMetaPromise,
      adminPromise,
      populatedSubsPromise,
    ]);
    viewerIsAdmin = !!viewerIsAdminTmp;
  } catch (e) {
    console.error('[home.fetch]', e);
    fetchThrew = true;
  }

  // users.metadata.feed.showBreaking — lets signed-in users suppress the
  // breaking strip. Other flags (showTrending, showRecommended, hideLowCred,
  // display) require consumer components that don't exist yet.
  const rawFeedMeta = (() => {
    const m = (userMetaRes.data as { metadata: unknown } | null)?.metadata;
    if (typeof m === 'object' && m !== null && 'feed' in m) {
      return (m as { feed?: Record<string, unknown> }).feed;
    }
    return undefined;
  })();
  const showBreaking = (rawFeedMeta?.showBreaking ?? true) as boolean;

  const topRows = (topStoriesRes.data as TopStoryRow[] | null) || [];
  // Filter null-resolving article joins (RLS-denied / deleted / unpublished)
  const topArticles = topRows
    .filter((r) => r.articles != null && r.articles.stories?.slug != null)
    .map((r) => r.articles as HomeStory);
  const hasPins = topRows.length > 0;
  const brokenPinCount = topRows.length - topArticles.length;

  // fetchFailed: only when both pins AND date-sort are unavailable, or when fetch threw.
  // A transient storiesRes.error MUST NOT hide otherwise-working pinned stories.
  const fetchFailed = (topArticles.length === 0 && !hasPins && !!storiesRes.error) || fetchThrew;
  if (storiesRes.error) {
    console.error('[home.fetch.stories]', storiesRes.error.message);
  }
  if (topStoriesRes.error) {
    console.error('[home.fetch.top_stories]', topStoriesRes.error.message);
  }

  const dateSorted = [...((storiesRes.data as HomeStory[] | null) || [])].sort((a, b) => {
    const aT = a.published_at ? new Date(a.published_at).getTime() : 0;
    const bT = b.published_at ? new Date(b.published_at).getTime() : 0;
    return bT - aT;
  });

  // DECISION #028: when pins exist, render whatever resolved (N-1 on broken pins).
  // Only fall back to date-sort when NO pins are set (empty top_stories).
  // Only fall back to recentFallback when both top_stories AND date-sort empty.
  // When filtered (?cat / ?sub), the empty state is the correct answer — do
  // NOT bleed unfiltered recents into a filtered view.
  const isFilteredView = !!activeCat || !!activeSub;
  let recentFallback: HomeStory[] = [];
  if (!isFilteredView && !hasPins && dateSorted.length === 0 && !fetchThrew) {
    const recentRes = await service
      .from('articles')
      .select(SELECT_COLS)
      .eq('status', 'published')
      .eq('browse_only', false)
      .not('stories.slug', 'is', null)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(12);
    if (recentRes.error) {
      console.error('[home.fetch.recent]', recentRes.error.message);
    } else {
      recentFallback = (recentRes.data as HomeStory[] | null) || [];
    }
  }

  const displayedStories = !isFilteredView && hasPins
    ? topArticles
    : (dateSorted.length > 0 ? dateSorted : recentFallback);

  const breaking = ((breakingRes.data as HomeStory[] | null) || [])[0] || null;

  const catRows = (catsRes.data as CategoryRow[] | null) || [];
  const categoryById: Record<string, CategoryRow> = {};
  catRows.forEach((c) => {
    categoryById[c.id] = c;
  });

  // Wave E — collapse the article rows into a populated-sub set. Sidebar
  // filters out subs whose id is not in this set when the viewer is not
  // admin. Parents always render regardless.
  const populatedSubIds = new Set<string>();
  const populatedRows = (populatedSubsRes.data as Array<{ subcategory_id: string | null }> | null) || [];
  for (const row of populatedRows) {
    if (row.subcategory_id) populatedSubIds.add(row.subcategory_id);
  }
  if (populatedSubsRes.error) {
    console.error('[home.fetch.populated_subs]', populatedSubsRes.error.message);
  }

  // Deduplicate by story id to prevent React key collisions if top_stories has duplicate positions
  const seenIds = new Set<string>();
  const dedupedStories = displayedStories.filter((s) => {
    if (seenIds.has(s.id)) return false;
    seenIds.add(s.id);
    return true;
  });
  const hero = dedupedStories[0] || null;
  const supporting = dedupedStories.slice(1);

  // T91 — "New since last visit" predicate. If we have no prior cookie
  // value, isNew is always false (first-time visitor sees no badges).
  const isNewStory = (story: HomeStory): boolean => {
    if (lastVisitMs == null) return false;
    if (!story.published_at) return false;
    const t = Date.parse(story.published_at);
    return Number.isFinite(t) && t > lastVisitMs;
  };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', overflowX: 'hidden' }}>
      <h1 style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
        borderWidth: 0,
      }}>Verity Post</h1>

      {/* Breaking strip — narrow, above masthead. Only renders when an
          active breaking-flagged article exists today AND the viewer has
          the permission. The permission check is client-only (the perms
          cache lives in the browser), so the strip is rendered through a
          small client island that hydrates the perms before showing. */}
      <HomeSidebar
        categories={catRows}
        activeCatSlug={activeCat?.slug ?? null}
        activeSubSlug={activeSub?.slug ?? null}
        viewerIsAdmin={viewerIsAdmin}
        populatedSubIds={Array.from(populatedSubIds)}
      />

      <div>
        <main
          style={{
            maxWidth: 880,
            margin: '0 auto',
            paddingTop: 32,
            paddingLeft: 20,
            paddingRight: 20,
            paddingBottom: 64,
          }}
        >
        {/* Brand tagline — pulled forward from /about. Renders only on the
            unfiltered home so it doesn't compete with a category header.
            Editorial italic, no heavy framing. */}
        {!activeCat && (
          <p
            style={{
              fontFamily: serifStack,
              fontStyle: 'italic',
              fontSize: 14,
              color: C.dim,
              textAlign: 'center',
              margin: '0 0 28px',
              letterSpacing: '0.01em',
            }}
          >
            Read. Prove it. Discuss.
          </p>
        )}
        {activeCat && (
          <header
            style={{
              marginBottom: 24,
              paddingBottom: 16,
              borderBottom: `1px solid ${C.rule}`,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.dim,
              }}
            >
              Section
            </p>
            <h2
              style={{
                fontFamily: serifStack,
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: '-0.015em',
                margin: '6px 0 0',
                color: C.text,
              }}
            >
              {activeCat.name}
            </h2>
            {activeSub && (
              <p
                style={{
                  fontFamily: serifStack,
                  fontSize: 16,
                  fontWeight: 500,
                  color: C.soft,
                  margin: '4px 0 0',
                }}
              >
                {activeSub.name}
              </p>
            )}
          </header>
        )}

        {breaking && showBreaking && <HomeBreakingStrip story={breaking} />}

        {fetchFailed && <HomeFetchFailed />}

        {/* TODO: HomeBrokenPinBanner — see DECISION #028 — admin banner for broken pins */}

        {!fetchFailed && !hero && (
          <p style={{
            fontFamily: serifStack,
            fontStyle: 'italic',
            fontSize: 16,
            color: C.dim,
            margin: '32px 0 0',
          }}>
            Nothing here yet.
          </p>
        )}

        {!fetchFailed && hero && (
          <Hero
            story={hero}
            category={hero.category_id ? categoryById[hero.category_id] : undefined}
            isNew={isNewStory(hero)}
          />
        )}

        {/* Second-tier 2-up row — gives the eye a visual carrot for
            "what to read next" right after the hero, instead of dropping
            straight into a vertical list. Only renders when there are at
            least 2 supporting stories to fill it. Collapses to a single
            column on narrow viewports. */}
        {!fetchFailed && supporting.length >= 2 && (
          <TwoUpRow
            stories={supporting.slice(0, 2)}
            categoryById={categoryById}
            isNewStory={isNewStory}
          />
        )}

        {/* home_top — after hero so editorial content leads; "Advertisement" label required per DECISION #050 */}
        <div style={{ textAlign: 'center', marginBottom: 8, marginTop: 24 }}>
          <div style={{ fontSize: 10, color: 'var(--dim, #5a5a5a)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Advertisement
          </div>
          <Ad placement="home_top" page="home" position="top" />
        </div>

        {!fetchFailed && supporting.length > 2 && (
          <section aria-label="Supporting stories" style={{ marginTop: 56 }}>
            {supporting.slice(2).map((story, idx) => (
              <Fragment key={story.id}>
                {idx > 0 && <div role="presentation" aria-hidden="true" style={hairlineStyle} />}
                {/* home_in_feed_1: between cards 4 and 5 (idx 3→4 boundary) */}
                {idx === 4 && (
                  <Ad placement="home_in_feed_1" page="home" position="in_feed_1" />
                )}
                {/* home_in_feed_2: between cards 8 and 9 (idx 7→8 boundary) */}
                {idx === 8 && (
                  <Ad placement="home_in_feed_2" page="home" position="in_feed_2" />
                )}
                <SupportingCard
                  story={story}
                  category={story.category_id ? categoryById[story.category_id] : undefined}
                  isNew={isNewStory(story)}
                />
              </Fragment>
            ))}
          </section>
        )}

        {/* home_below_fold: before footer */}
        <div style={{ textAlign: 'center', marginBottom: 8, marginTop: 24 }}>
          <div style={{ fontSize: 10, color: 'var(--dim, #5a5a5a)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Advertisement
          </div>
          {!fetchFailed && hero && <Ad placement="home_below_fold" page="home" position="below_fold" />}
        </div>

        {!fetchFailed && hero && <HomeFooter />}

        </main>
      </div>

      {/* T91 — refresh the last-visit cookie after first paint. Never
          renders any DOM; just owns the side-effect of writing the
          cookie so the next render can compute "since last visit". */}
      <HomeVisitTimestamp />
    </div>
  );
}

// ============================================================================
// Components (server-renderable — no hooks, no client APIs)
// ============================================================================

// T91 — small white-on-black "New" pill. Server-rendered (no JS), styled
// to match the masthead palette. Sits inline next to other meta so the
// supporting card's existing 24px vertical rhythm doesn't shift.
function NewPill() {
  return (
    <span
      aria-label="New since your last visit"
      style={{
        display: 'inline-block',
        background: 'var(--pill-new-bg, #111111)',
        color: 'var(--pill-new-text, #ffffff)',
        fontFamily: serifStack,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '2px 6px',
        borderRadius: 2,
        lineHeight: 1.2,
        verticalAlign: 'middle',
      }}
    >
      New
    </span>
  );
}

function LifecyclePill({ status, dark = false }: { status: string; dark?: boolean }) {
  if (status !== 'breaking' && status !== 'developing') return null;
  const isBreaking = status === 'breaking';
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        padding: '2px 6px',
        borderRadius: 2,
        lineHeight: 1.2,
        verticalAlign: 'middle',
        background: dark
          ? 'rgba(0,0,0,0.25)'
          : isBreaking ? 'var(--pill-breaking, #dc2626)' : 'var(--pill-developing, #d97706)',
        color: dark
          ? isBreaking ? 'rgba(255,255,255,0.9)' : 'var(--pill-developing-dark-text, #fcd34d)'
          : '#ffffff',
      }}
    >
      {isBreaking ? 'Breaking' : 'Developing'}
    </span>
  );
}

function Eyebrow({ category }: { category: CategoryRow | undefined }) {
  if (!category) return null;
  return (
    <span
      style={{
        fontFamily: serifStack,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: C.muted,
      }}
    >
      {category.name}
    </span>
  );
}

function MetaLine({ story }: { story: HomeStory }) {
  return (
    <p
      style={{
        margin: '12px 0 0',
        fontSize: 13,
        color: C.muted,
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}
    >
      {timeShort(story.published_at)}
    </p>
  );
}

function Hero({
  story,
  category,
  isNew,
}: {
  story: HomeStory;
  category: CategoryRow | undefined;
  isNew: boolean;
}) {
  const bg = heroBg(category);
  const heroTitleColor = '#ffffff';
  return (
    <article style={{ marginBottom: 32 }}>
      {story.stories?.slug ? (
        <Link href={`/${story.stories.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          {/* Hero band fills the main column edge-to-edge by negating
              <main>'s 20px paddingLeft/Right. On mobile (no sidebar) this
              still reads as full-bleed because <main> spans the viewport;
              on desktop it stays bounded to the main column so the inner
              text aligns with the surrounding cards. */}
          <div
            style={{
              background: bg,
              marginLeft: -20,
              marginRight: -20,
              padding: 'clamp(28px, 6vw, 48px) clamp(20px, 4vw, 24px) clamp(24px, 5vw, 40px)',
            }}
          >
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              {(category || isNew || story.stories?.lifecycle_status) && (
                <div
                  style={{
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  {story.stories?.lifecycle_status && (
                    <LifecyclePill status={story.stories.lifecycle_status} dark />
                  )}
                  {category && (
                    <span
                      style={{
                        fontFamily: serifStack,
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase' as const,
                        color: 'var(--hero-eyebrow, rgba(255,255,255,0.65))',
                      }}
                    >
                      {category.name}
                    </span>
                  )}
                  {isNew && (
                    <span
                      aria-label="New since your last visit"
                      style={{
                        display: 'inline-block',
                        background: '#ffffff',
                        color: '#111111',
                        fontFamily: serifStack,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: 2,
                        lineHeight: 1.2,
                      }}
                    >
                      New
                    </span>
                  )}
                </div>
              )}
              <h2
                style={{
                  fontFamily: serifStack,
                  fontSize: 'clamp(24px, 5vw, 40px)',
                  fontWeight: 700,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  margin: 0,
                  color: heroTitleColor,
                }}
              >
                {story.title}
              </h2>
              {story.excerpt && (
                <p
                  style={{
                    fontFamily: serifStack,
                    fontSize: 'clamp(15px, 3.4vw, 19px)',
                    lineHeight: 1.45,
                    color: 'var(--hero-excerpt, rgba(255,255,255,0.80))',
                    margin: '12px 0 0',
                    fontWeight: 400,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {story.excerpt}
                </p>
              )}
              <p
                style={{
                  margin: '20px 0 0',
                  fontSize: 13,
                  color: 'var(--hero-meta, rgba(255,255,255,0.55))',
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                }}
              >
                {timeShort(story.published_at)}
              </p>
            </div>
          </div>
        </Link>
      ) : (
        <div style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          {/* Hero band — bounded to <main>, see Hero (with-link) variant
              above for the rationale. */}
          <div
            style={{
              background: bg,
              marginLeft: -20,
              marginRight: -20,
              padding: 'clamp(28px, 6vw, 48px) clamp(20px, 4vw, 24px) clamp(24px, 5vw, 40px)',
            }}
          >
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              {(category || isNew || story.stories?.lifecycle_status) && (
                <div
                  style={{
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  {story.stories?.lifecycle_status && (
                    <LifecyclePill status={story.stories.lifecycle_status} dark />
                  )}
                  {category && (
                    <span
                      style={{
                        fontFamily: serifStack,
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase' as const,
                        color: 'var(--hero-eyebrow, rgba(255,255,255,0.65))',
                      }}
                    >
                      {category.name}
                    </span>
                  )}
                  {isNew && (
                    <span
                      aria-label="New since your last visit"
                      style={{
                        display: 'inline-block',
                        background: '#ffffff',
                        color: '#111111',
                        fontFamily: serifStack,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: 2,
                        lineHeight: 1.2,
                      }}
                    >
                      New
                    </span>
                  )}
                </div>
              )}
              <h2
                style={{
                  fontFamily: serifStack,
                  fontSize: 'clamp(24px, 5vw, 40px)',
                  fontWeight: 700,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  margin: 0,
                  color: heroTitleColor,
                }}
              >
                {story.title}
              </h2>
              {story.excerpt && (
                <p
                  style={{
                    fontFamily: serifStack,
                    fontSize: 'clamp(15px, 3.4vw, 19px)',
                    lineHeight: 1.45,
                    color: 'var(--hero-excerpt, rgba(255,255,255,0.80))',
                    margin: '12px 0 0',
                    fontWeight: 400,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {story.excerpt}
                </p>
              )}
              <p
                style={{
                  margin: '20px 0 0',
                  fontSize: 13,
                  color: 'var(--hero-meta, rgba(255,255,255,0.55))',
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                }}
              >
                {timeShort(story.published_at)}
              </p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// Second-tier row directly under the hero. Two stories, side-by-side on
// desktop, stacked on narrow viewports. Vertical hairline divider
// between cards mirrors the horizontal hairlines used further down so
// the page rhythm stays consistent. Uses pure CSS for the responsive
// collapse — server-rendered, no client island.
function TwoUpRow({
  stories,
  categoryById,
  isNewStory,
}: {
  stories: HomeStory[];
  categoryById: Record<string, CategoryRow>;
  isNewStory: (story: HomeStory) => boolean;
}) {
  if (stories.length < 2) return null;
  return (
    <section
      aria-label="Featured stories"
      style={{
        marginTop: 32,
        paddingTop: 28,
        borderTop: `1px solid ${C.rule}`,
      }}
    >
      <div className="vp-twoup-grid">
        {stories.slice(0, 2).map((story, idx) => (
          <div
            key={story.id}
            className={idx === 0 ? 'vp-twoup-cell vp-twoup-cell--first' : 'vp-twoup-cell'}
          >
            <TwoUpCard
              story={story}
              category={story.category_id ? categoryById[story.category_id] : undefined}
              isNew={isNewStory(story)}
            />
          </div>
        ))}
      </div>
      <style>{`
        .vp-twoup-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
        }
        .vp-twoup-cell {
          padding: 0 0 0 28px;
          border-left: 1px solid ${C.rule};
        }
        .vp-twoup-cell--first {
          padding: 0 28px 0 0;
          border-left: 0;
        }
        @media (max-width: 640px) {
          .vp-twoup-grid {
            grid-template-columns: 1fr;
            gap: 24px;
          }
          .vp-twoup-cell,
          .vp-twoup-cell--first {
            padding: 0;
            border-left: 0;
          }
          .vp-twoup-cell + .vp-twoup-cell {
            padding-top: 24px;
            border-top: 1px solid ${C.rule};
          }
        }
      `}</style>
    </section>
  );
}

function TwoUpCard({
  story,
  category,
  isNew,
}: {
  story: HomeStory;
  category: CategoryRow | undefined;
  isNew: boolean;
}) {
  const inner = (
    <>
      <div
        style={{
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {story.stories?.lifecycle_status && (
          <LifecyclePill status={story.stories.lifecycle_status} />
        )}
        <Eyebrow category={category} />
        {isNew && <NewPill />}
      </div>
      <h3
        style={{
          fontFamily: serifStack,
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: '-0.01em',
          margin: 0,
          color: C.text,
        }}
      >
        {story.title}
      </h3>
      {story.excerpt && (
        <p
          style={{
            fontFamily: serifStack,
            fontSize: 14,
            lineHeight: 1.5,
            color: C.soft,
            margin: '8px 0 0',
            fontWeight: 400,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            maxHeight: '3.15em',
          }}
        >
          {story.excerpt}
        </p>
      )}
      <MetaLine story={story} />
    </>
  );
  return (
    <article>
      {story.stories?.slug ? (
        <Link
          href={`/${story.stories.slug}`}
          aria-label={story.title}
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          {inner}
        </Link>
      ) : (
        <div style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          {inner}
        </div>
      )}
    </article>
  );
}

function SupportingCard({
  story,
  category,
  isNew,
}: {
  story: HomeStory;
  category: CategoryRow | undefined;
  isNew: boolean;
}) {
  const titleColor = C.text;
  return (
    <article style={{ padding: '24px 0' }}>
      {story.stories?.slug ? (
      <Link
        href={`/${story.stories.slug}`}
        aria-label={story.title}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'block',
        }}
      >
        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {story.stories?.lifecycle_status && (
            <LifecyclePill status={story.stories.lifecycle_status} />
          )}
          <Eyebrow category={category} />
          {isNew && <NewPill />}
        </div>
        <h3
          style={{
            fontFamily: serifStack,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            margin: 0,
            color: titleColor,
          }}
        >
          {story.title}
        </h3>
        {story.excerpt && (
          <p
            style={{
              fontFamily: serifStack,
              fontSize: 15,
              lineHeight: 1.5,
              color: C.soft,
              margin: '8px 0 0',
              fontWeight: 400,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              maxHeight: '3.15em', // ~2 lines at lineHeight:1.5 for Firefox
            }}
          >
            {story.excerpt}
          </p>
        )}
        <MetaLine story={story} />
      </Link>
      ) : (
      <div style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {story.stories?.lifecycle_status && (
            <LifecyclePill status={story.stories.lifecycle_status} />
          )}
          <Eyebrow category={category} />
          {isNew && <NewPill />}
        </div>
        <h3
          style={{
            fontFamily: serifStack,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            margin: 0,
            color: titleColor,
          }}
        >
          {story.title}
        </h3>
        {story.excerpt && (
          <p
            style={{
              fontFamily: serifStack,
              fontSize: 15,
              lineHeight: 1.5,
              color: C.soft,
              margin: '8px 0 0',
              fontWeight: 400,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              maxHeight: '3.15em', // ~2 lines at lineHeight:1.5 for Firefox
            }}
          >
            {story.excerpt}
          </p>
        )}
        <MetaLine story={story} />
      </div>
      )}
    </article>
  );
}

const hairlineStyle: CSSProperties = {
  border: 0,
  borderTop: `1px solid ${C.rule}`,
  margin: 0,
};
