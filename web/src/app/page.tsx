// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-23
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
import { createClient } from '../lib/supabase/server';
import type { Tables } from '@/types/database-helpers';
import {
  HOME_COLORS as C,
  HOME_SERIF_STACK as serifStack,
  HOME_EDITORIAL_TZ as EDITORIAL_TZ,
  timeShort,
  type HomeStory,
} from './_homeShared';
import HomeBreakingStrip from './_HomeBreakingStrip';
import HomeFooter from './_HomeFooter';
import HomeFetchFailed from './_HomeFetchFailed';
import HomeVisitTimestamp from './_HomeVisitTimestamp';
import HomeFirstLoginMoment from './_HomeFirstLoginMoment';

// Hand-curated front page per Future Projects/09_HOME_FEED_REBUILD.md.
// 1 hero + up to 11 supporting, dated, page ends. No category pills, no
// search, no ads, no algorithmic feed, no infinite scroll on this surface.
//
// Edition model: shows only articles published today (editorial TZ),
// capped at 12. The first article in published_at DESC order becomes the
// hero; the rest are supporting cards. The page is finite — readers can
// finish it. A "That's today's edition." end state closes the feed.

// Story projection the home feed renders lives in `_homeShared.ts` so the
// client islands can import the same shape without pulling this server
// component into the client bundle.
type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug' | 'color_hex'>;

// All editorial timing happens in America/New_York. Owner is east-coast;
// the front page is "today's stories" relative to the newsroom, not the
// reader. The constant is re-exported via _homeShared so the strip and
// footer can use the same TZ when formatting.

// The home is wall-free by design — the registration-wall gate fires
// inside `web/src/app/story/[slug]/page.tsx` per article view, not on
// browse. Anonymous readers can see the masthead + today's published
// stories without trial spend. The wall protects the *content*, not the index.

// Today's editorial date, DST-aware. Returns:
//   isoDate    — "YYYY-MM-DD" in editorial TZ (for future use)
//   startUtc   — ISO timestamp for midnight ETZ today, in UTC (used to filter edition)
//   humanDate  — "Thursday, April 23, 2026" for the masthead
function editorialToday(): { isoDate: string; startUtc: string; humanDate: string } {
  const now = new Date();

  const isoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: EDITORIAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const offsetStr = new Intl.DateTimeFormat('en', {
    timeZone: EDITORIAL_TZ,
    timeZoneName: 'longOffset',
  }).format(now);
  const offMatch = /GMT([+-]\d{2}):?(\d{2})/.exec(offsetStr);
  const offHours = offMatch ? Number(offMatch[1]) : -5;
  const offMinutes = offMatch ? Number(offMatch[2]) * (offHours < 0 ? -1 : 1) : 0;

  const [y, m, d] = isoDate.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d, -offHours, -offMinutes, 0)).toISOString();

  const humanDate = new Intl.DateTimeFormat('en-US', {
    timeZone: EDITORIAL_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);

  return { isoDate, startUtc, humanDate };
}

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
// detection heuristic. Today's-stories data is freshness-critical.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = createClient();
  const today = editorialToday();

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
  let lastVisitMs: number | null = null;
  let fetchThrew = false;

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

    [storiesRes, breakingRes, catsRes, topStoriesRes, userMetaRes] = await Promise.all([
      supabase
        .from('articles')
        .select(SELECT_COLS)
        .eq('status', 'published')
        .eq('browse_only', false)
        .order('published_at', { ascending: false })
        .limit(50),
      supabase
        .from('articles')
        .select(SELECT_COLS)
        .eq('status', 'published')
        .eq('is_breaking', true)
        .eq('browse_only', false)
        .order('published_at', { ascending: false })
        .limit(1),
      supabase
        .from('categories')
        .select('id, name, slug, color_hex')
        .eq('is_active', true)
        .order('sort_order', {
          ascending: true,
          nullsFirst: false,
        }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('top_stories')
        .select('position, articles(id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at)')
        .order('position'),
      userMetaPromise,
    ]);
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

  // Top Stories: if any pinned slots exist, they become the display list.
  // Falls back to the published_at DESC date query when empty.
  const topRows = (topStoriesRes.data as TopStoryRow[] | null) || [];
  const topArticles = topRows
    .filter((r) => r.articles != null)
    .map((r) => r.articles as HomeStory);

  // If the primary date-query errored AND top_stories is also empty, surface
  // a retry banner. If top_stories has rows, we can still render the page.
  const fetchFailed = (topArticles.length === 0 && !!storiesRes.error) || fetchThrew;
  if (storiesRes.error) {
    console.error('[home.fetch.stories]', storiesRes.error.message);
  }

  const dateSorted = [...((storiesRes.data as HomeStory[] | null) || [])].sort((a, b) => {
    const aT = a.published_at ? new Date(a.published_at).getTime() : 0;
    const bT = b.published_at ? new Date(b.published_at).getTime() : 0;
    return bT - aT;
  });

  const displayedStories = topArticles.length > 0 ? topArticles : dateSorted;

  const breaking = ((breakingRes.data as HomeStory[] | null) || [])[0] || null;

  const catRows = (catsRes.data as CategoryRow[] | null) || [];
  const categoryById: Record<string, CategoryRow> = {};
  catRows.forEach((c) => {
    categoryById[c.id] = c;
  });

  const hero = displayedStories[0] || null;
  const supporting = displayedStories.slice(1);

  // T91 — "New since last visit" predicate. If we have no prior cookie
  // value, isNew is always false (first-time visitor sees no badges).
  const isNewStory = (story: HomeStory): boolean => {
    if (lastVisitMs == null) return false;
    if (!story.published_at) return false;
    const t = Date.parse(story.published_at);
    return Number.isFinite(t) && t > lastVisitMs;
  };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* First-login attribution moment — position:fixed overlay, fades in/out
          automatically. No-ops for signed-out and returning users. */}
      <HomeFirstLoginMoment />

      {/* Breaking strip — narrow, above masthead. Only renders when an
          active breaking-flagged article exists today AND the viewer has
          the permission. The permission check is client-only (the perms
          cache lives in the browser), so the strip is rendered through a
          small client island that hydrates the perms before showing. */}
      {breaking && showBreaking && <HomeBreakingStrip story={breaking} />}

      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '32px 20px 64px',
        }}
      >
        {fetchFailed && <HomeFetchFailed />}

        {!fetchFailed && (
          <p
            style={{
              margin: '0 0 24px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              color: C.muted,
              fontFamily: serifStack,
            }}
          >
            {today.humanDate}
          </p>
        )}

        {!fetchFailed && hero && (
          <Hero
            story={hero}
            category={hero.category_id ? categoryById[hero.category_id] : undefined}
            isNew={isNewStory(hero)}
          />
        )}

        {!fetchFailed && supporting.length > 0 && (
          <section aria-label="Supporting stories" style={{ marginTop: 56 }}>
            {supporting.map((story, idx) => (
              <Fragment key={story.id}>
                {idx > 0 && <hr style={hairlineStyle} />}
                <SupportingCard
                  story={story}
                  category={story.category_id ? categoryById[story.category_id] : undefined}
                  isNew={isNewStory(story)}
                />
              </Fragment>
            ))}
          </section>
        )}

        {!fetchFailed && hero && <HomeFooter />}

      </main>

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
        background: '#111111',
        color: '#ffffff',
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
          : isBreaking ? '#dc2626' : '#d97706',
        color: dark
          ? isBreaking ? 'rgba(255,255,255,0.9)' : '#fcd34d'
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
      <Link
        href={story.stories?.slug ? `/${story.stories.slug}` : '#'}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        {/* Full-bleed band — escapes the 720px column using the standard
            viewport-breakout technique for centered constrained layouts.
            position:relative + left:50% + marginLeft:-50vw + width:100vw. */}
        <div
          style={{
            background: bg,
            position: 'relative',
            left: '50%',
            right: '50%',
            marginLeft: '-50vw',
            marginRight: '-50vw',
            width: '100vw',
            padding: '48px 0 40px',
          }}
        >
          {/* Inner column mirrors the 720px reading column */}
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>
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
                      color: 'rgba(255,255,255,0.65)',
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
                fontSize: 40,
                fontWeight: 700,
                lineHeight: 1.1,
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
                  fontSize: 19,
                  lineHeight: 1.45,
                  color: 'rgba(255,255,255,0.80)',
                  margin: '16px 0 0',
                  fontWeight: 400,
                }}
              >
                {story.excerpt}
              </p>
            )}
            <p
              style={{
                margin: '20px 0 0',
                fontSize: 13,
                color: 'rgba(255,255,255,0.55)',
                fontWeight: 500,
                letterSpacing: '0.01em',
              }}
            >
              {timeShort(story.published_at)}
            </p>
          </div>
        </div>
      </Link>
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
      <Link
        href={story.stories?.slug ? `/${story.stories.slug}` : '#'}
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
            }}
          >
            {story.excerpt}
          </p>
        )}
        <MetaLine story={story} />
      </Link>
    </article>
  );
}

const hairlineStyle: CSSProperties = {
  border: 0,
  borderTop: `1px solid ${C.rule}`,
  margin: 0,
};
