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
  const lastVisitRaw = cookies().get('vp_last_home_visit_at')?.value;
  let lastVisitMs: number | null = null;
  if (lastVisitRaw) {
    const t = Date.parse(lastVisitRaw);
    if (Number.isFinite(t)) lastVisitMs = t;
  }

  // T109 — read-state for signed-in viewers. We pull the 200 most-recent
  // reading_log rows for this user from the last 30 days and use that set
  // to dim cards already read. Anon viewers have no reading_log; the
  // chained .then() turns auth.getUser() into a single thenable that
  // either yields the read-set or resolves to an empty payload, so the
  // whole flow stays parallel with the article + category fetches and
  // doesn't add a serial round-trip for signed-in viewers vs anon.
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const readLogPromise: Promise<{ data: Array<{ article_id: string }> | null }> = supabase.auth
    .getUser()
    .then(({ data }) => {
      const u = data.user;
      if (!u) return { data: null };
      return supabase
        .from('reading_log')
        .select('article_id')
        .eq('user_id', u.id)
        .gte('created_at', thirtyDaysAgoIso)
        .order('created_at', { ascending: false })
        .limit(200)
        .then((r) => ({
          data: (r.data as Array<{ article_id: string }> | null) ?? null,
        }));
    });

  const [storiesRes, breakingRes, catsRes, readLogRes, topStoriesRes] = await Promise.all([
    supabase
      .from('articles')
      .select(SELECT_COLS)
      .eq('status', 'published')
      .gte('published_at', today.startUtc)
      .order('published_at', { ascending: false })
      .limit(12),
    supabase
      .from('articles')
      .select(SELECT_COLS)
      .eq('status', 'published')
      .eq('is_breaking', true)
      .gte('published_at', today.startUtc)
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
    readLogPromise,
    supabase
      .from('top_stories')
      .select('position, articles(id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at)')
      .order('position'),
  ]);

  const readArticleIds = new Set<string>();
  const readRows = (readLogRes.data as Array<{ article_id: string | null }> | null) || [];
  for (const row of readRows) {
    if (row?.article_id) readArticleIds.add(row.article_id);
  }

  // Top Stories: if any pinned slots exist, they become the display list.
  // Falls back to the published_at DESC date query when empty.
  const topRows = (topStoriesRes.data as TopStoryRow[] | null) || [];
  const topArticles = topRows
    .filter((r) => r.articles != null)
    .map((r) => r.articles as HomeStory);

  // If the primary date-query errored AND top_stories is also empty, surface
  // a retry banner. If top_stories has rows, we can still render the page.
  const fetchFailed = topArticles.length === 0 && !!storiesRes.error;
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

  // T109 — edition progress counter reflects whichever set is displayed.
  const readTodayCount = displayedStories.filter((s) => readArticleIds.has(s.id)).length;
  const totalToday = displayedStories.length;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* Breaking strip — narrow, above masthead. Only renders when an
          active breaking-flagged article exists today AND the viewer has
          the permission. The permission check is client-only (the perms
          cache lives in the browser), so the strip is rendered through a
          small client island that hydrates the perms before showing. */}
      {breaking && <HomeBreakingStrip story={breaking} />}

      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '32px 20px 64px',
        }}
      >
        {/* T110 — disclose editorial timezone. The newsroom day is anchored
            to America/New_York; readers in other zones should know what
            "today" means here. Subtle masthead line, not a banner. */}
        <div style={{ marginBottom: 24, lineHeight: 1.3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div
              style={{
                fontFamily: serifStack,
                fontSize: 13,
                color: C.dim,
                fontWeight: 500,
              }}
            >
              {today.humanDate}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Today&rsquo;s edition (Eastern Time)
            </div>
          </div>
          {totalToday > 0 && (
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>
              {readTodayCount} of {totalToday} read today
            </div>
          )}
        </div>

        {fetchFailed && <HomeFetchFailed />}

        {!fetchFailed && hero && (
          <Hero
            story={hero}
            category={hero.category_id ? categoryById[hero.category_id] : undefined}
            isNew={isNewStory(hero)}
            isRead={readArticleIds.has(hero.id)}
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
                  isRead={readArticleIds.has(story.id)}
                />
              </Fragment>
            ))}
          </section>
        )}

        {!fetchFailed && hero && <HomeFooter />}

        {!fetchFailed && stories.length > 0 && (
          <div
            style={{
              paddingTop: 48,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              That&rsquo;s today&rsquo;s edition.
            </p>
            <p style={{ fontSize: 14, color: C.muted, margin: '8px 0 0' }}>
              <Link href="/browse" style={{ color: C.muted, textDecoration: 'underline' }}>
                Browse past editions &rarr;
              </Link>
            </p>
          </div>
        )}
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

// T109 — small "Read" tag for cards the signed-in viewer has already
// opened. Lower contrast than the "New" pill — read-state is reference
// information, not a call to attention.
function ReadTag() {
  return (
    <span
      aria-label="Already read"
      style={{
        display: 'inline-block',
        color: C.muted,
        fontFamily: serifStack,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '2px 6px',
        border: `1px solid ${C.rule}`,
        borderRadius: 2,
        lineHeight: 1.2,
        verticalAlign: 'middle',
      }}
    >
      Read
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
  isRead,
}: {
  story: HomeStory;
  category: CategoryRow | undefined;
  isNew: boolean;
  isRead: boolean;
}) {
  const bg = heroBg(category);
  // T109 — soften the hero title when the user has read it. The hero sits
  // on a dark band, so we drop title opacity rather than swap to grey
  // (which would clash with the band color).
  const heroTitleColor = isRead ? 'rgba(255,255,255,0.72)' : '#ffffff';
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
            {(category || isNew || isRead || story.stories?.lifecycle_status) && (
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
                {isRead && (
                  <span
                    aria-label="Already read"
                    style={{
                      display: 'inline-block',
                      color: 'rgba(255,255,255,0.65)',
                      fontFamily: serifStack,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      border: '1px solid rgba(255,255,255,0.30)',
                      borderRadius: 2,
                      lineHeight: 1.2,
                    }}
                  >
                    Read
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
  isRead,
}: {
  story: HomeStory;
  category: CategoryRow | undefined;
  isNew: boolean;
  isRead: boolean;
}) {
  // T109 — read titles dim to #666 (vs #111 default). #666 measures
  // 5.74:1 against white, passing WCAG AA for normal text. Excerpt tone
  // is intentionally left alone — it's already C.soft (#444), and dimming
  // it further would hurt scannability for sighted users with the article
  // reopened.
  const titleColor = isRead ? '#666666' : C.text;
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
          {isRead && <ReadTag />}
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
