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

// Hand-curated front page per Future Projects/09_HOME_FEED_REBUILD.md.
// 1 hero + up to 7 supporting, dated, page ends. No category pills, no
// search, no ads, no algorithmic feed, no infinite scroll on this surface.
//
// Hero selection: one row in `articles` per editorial day flagged
// `hero_pick_for_date = today` (in editorial TZ). When no row is flagged,
// the most-recent published article fills the slot. The boolean is a
// Phase-1 proxy for the front_page_state table — see schema/144.

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
//   isoDate    — "YYYY-MM-DD" matching `hero_pick_for_date` shape
//   startUtc   — ISO timestamp for midnight ETZ today, in UTC
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
  'id, title, slug, excerpt, category_id, is_breaking, published_at, hero_pick_for_date';

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

  const [storiesRes, breakingRes, catsRes] = await Promise.all([
    supabase
      .from('articles')
      .select(SELECT_COLS)
      .eq('status', 'published')
      .gte('published_at', today.startUtc)
      .order('published_at', { ascending: false })
      .limit(20),
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
  ]);

  // If the primary fetch errored we don't know whether today is empty or
  // the request failed — surface a retry banner instead of an empty-state
  // UI which would silently lie. The breaking + categories queries are
  // decorative; only the stories failure flips this.
  const fetchFailed = !!storiesRes.error;
  if (storiesRes.error) {
    console.error('[home.fetch.stories]', storiesRes.error.message);
  }

  const raw = (storiesRes.data as HomeStory[] | null) || [];
  // Sort hero-pick first, then most-recent. Done in app code because
  // PostgREST doesn't expose a cheap way to express "match a date and
  // sort that group first" in a single .order().
  const stories = [...raw].sort((a, b) => {
    const aHero = a.hero_pick_for_date === today.isoDate ? 1 : 0;
    const bHero = b.hero_pick_for_date === today.isoDate ? 1 : 0;
    if (aHero !== bHero) return bHero - aHero;
    const aT = a.published_at ? new Date(a.published_at).getTime() : 0;
    const bT = b.published_at ? new Date(b.published_at).getTime() : 0;
    return bT - aT;
  });

  const breaking = ((breakingRes.data as HomeStory[] | null) || [])[0] || null;

  const catRows = (catsRes.data as CategoryRow[] | null) || [];
  const categoryById: Record<string, CategoryRow> = {};
  catRows.forEach((c) => {
    categoryById[c.id] = c;
  });

  const hero = stories[0] || null;
  const supporting = stories.slice(1);

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
        <div style={{ marginBottom: 24, lineHeight: 1.3 }}>
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

        {fetchFailed && <HomeFetchFailed />}

        {!fetchFailed && hero && (
          <Hero
            story={hero}
            category={hero.category_id ? categoryById[hero.category_id] : undefined}
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
                />
              </Fragment>
            ))}
          </section>
        )}

        {!fetchFailed && hero && <HomeFooter />}
      </main>
    </div>
  );
}

// ============================================================================
// Components (server-renderable — no hooks, no client APIs)
// ============================================================================

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

function Hero({ story, category }: { story: HomeStory; category: CategoryRow | undefined }) {
  const bg = heroBg(category);
  return (
    <article style={{ marginBottom: 32 }}>
      <Link
        href={`/story/${story.slug}`}
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
            {category && (
              <div style={{ marginBottom: 16 }}>
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
                color: '#ffffff',
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
}: {
  story: HomeStory;
  category: CategoryRow | undefined;
}) {
  return (
    <article style={{ padding: '24px 0' }}>
      <Link
        href={`/story/${story.slug}`}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'block',
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <Eyebrow category={category} />
        </div>
        <h3
          style={{
            fontFamily: serifStack,
            fontSize: 22,
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
