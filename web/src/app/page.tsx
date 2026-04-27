// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-23
'use client';
import { useState, useEffect, useMemo, Fragment, CSSProperties } from 'react';
import Link from 'next/link';
import { createClient } from '../lib/supabase/client';
import { useAuth } from './NavWrapper';
import { usePageViewTrack } from '@/lib/useTrack';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

// Hand-curated front page per Future Projects/09_HOME_FEED_REBUILD.md.
// 1 hero + up to 7 supporting, dated, page ends. No category pills, no
// search, no ads, no algorithmic feed, no infinite scroll on this surface.
//
// Hero selection: one row in `articles` per editorial day flagged
// `hero_pick_for_date = today` (in editorial TZ). When no row is flagged,
// the most-recent published article fills the slot. The boolean is a
// Phase-1 proxy for the front_page_state table — see schema/144.

const C = {
  bg: '#ffffff',
  text: '#111111',
  soft: '#444444',
  dim: '#666666',
  muted: '#999999',
  rule: '#e5e5e5',
  accent: '#111111',
} as const;

// All editorial timing happens in America/New_York. Owner is east-coast;
// the front page is "today's stories" relative to the newsroom, not the
// reader. Same constant used in the masthead label and the SQL filter.
const EDITORIAL_TZ = 'America/New_York';

// Story projection the home feed renders. Subset of `articles` plus the
// hero-pick column added by schema/144.
type HomeStory = Pick<
  Tables<'articles'>,
  'id' | 'title' | 'slug' | 'excerpt' | 'category_id' | 'is_breaking' | 'published_at'
> & {
  hero_pick_for_date: string | null;
};

type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug' | 'color_hex'>;

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

function timeShort(dateIso: string | null): string {
  if (!dateIso) return '';
  const d = new Date(dateIso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EDITORIAL_TZ,
    month: 'short',
    day: 'numeric',
  }).format(d);
}

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
// Page
// ============================================================================

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
  const { loggedIn } = useAuth() as { loggedIn: boolean };

  usePageViewTrack('home');

  const today = useMemo(() => editorialToday(), []);

  const [stories, setStories] = useState<HomeStory[]>([]);
  const [categoryById, setCategoryById] = useState<Record<string, CategoryRow>>({});
  const [breaking, setBreaking] = useState<HomeStory | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  // Distinct from "no articles today" — set when the fetch itself failed
  // (RLS, network, 5xx). Without this branch, every fetch failure renders
  // as the empty-state EmptyDay, which silently lies. Per user-journey
  // audit 2026-04-23.
  const [loadFailed, setLoadFailed] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const [canBreakingBanner, setCanBreakingBanner] = useState<boolean>(false);
  const [canBreakingBannerPaid, setCanBreakingBannerPaid] = useState<boolean>(false);

  // Permission hydrate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      if (cancelled) return;
      setCanBreakingBanner(hasPermission('home.breaking_banner.view'));
      setCanBreakingBannerPaid(hasPermission('home.breaking_banner.view.paid'));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Data fetch — today's published articles, hero-flagged first,
  // plus an active breaking story (any time today, may overlap).
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setLoadFailed(false);

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

      if (cancelled) return;

      // If the primary fetch errored we don't know whether today is empty
      // or the request failed — surface a retry banner instead of the
      // empty-state UI which would silently lie. The breaking + categories
      // queries are decorative; only the stories failure flips this.
      if (storiesRes.error) {
        console.error('[home.fetch.stories]', storiesRes.error.message);
        setStories([]);
        setBreaking(null);
        setCategoryById({});
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      const raw = (storiesRes.data as HomeStory[] | null) || [];
      // Sort hero-pick first, then most-recent. Done client-side because
      // PostgREST doesn't expose a cheap way to express "match a date and
      // sort that group first" in a single .order().
      const ranked = [...raw].sort((a, b) => {
        const aHero = a.hero_pick_for_date === today.isoDate ? 1 : 0;
        const bHero = b.hero_pick_for_date === today.isoDate ? 1 : 0;
        if (aHero !== bHero) return bHero - aHero;
        const aT = a.published_at ? new Date(a.published_at).getTime() : 0;
        const bT = b.published_at ? new Date(b.published_at).getTime() : 0;
        return bT - aT;
      });
      setStories(ranked);

      const breakingRow = ((breakingRes.data as HomeStory[] | null) || [])[0] || null;
      setBreaking(breakingRow);

      const catRows = (catsRes.data as CategoryRow[] | null) || [];
      const map: Record<string, CategoryRow> = {};
      catRows.forEach((c) => {
        map[c.id] = c;
      });
      setCategoryById(map);

      setLoading(false);
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [supabase, today.isoDate, today.startUtc, reloadKey]);

  const hero = stories[0] || null;
  const supporting = stories.slice(1);

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* Breaking strip — narrow, above masthead. Only renders when an
          active breaking-flagged article exists today AND the viewer has
          the permission. Per spec: rate-limited, Senior Editor only. */}
      {breaking && canBreakingBanner && (
        <BreakingStrip story={breaking} showMeta={canBreakingBannerPaid} />
      )}

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

        {loading && <FrontPageSkeleton />}

        {!loading && loadFailed && <FetchFailed onRetry={() => setReloadKey((k) => k + 1)} />}

        {!loading && hero && (
          <Hero
            story={hero}
            category={hero.category_id ? categoryById[hero.category_id] : undefined}
          />
        )}

        {!loading && supporting.length > 0 && (
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

        {!loading && hero && <EndOfFrontPage loggedIn={loggedIn} />}
      </main>
    </div>
  );
}

// ============================================================================
// Components
// ============================================================================

const serifStack = "Georgia, 'Times New Roman', 'Source Serif 4', serif";

function BreakingStrip({ story, showMeta }: { story: HomeStory; showMeta: boolean }) {
  return (
    <Link
      href={`/story/${story.slug}`}
      aria-label={`Breaking news: ${story.title}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--breaking)',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          // Vertical padding bumped to 12 so the strip clears the 44pt
          // touch-target accessibility floor on small screens.
          padding: '12px 20px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: '0.12em',
            background: 'rgba(0, 0, 0, 0.22)',
            padding: '2px 8px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}
        >
          BREAKING
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {story.title}
        </span>
        {showMeta && story.published_at && (
          <span
            style={{
              fontSize: 11,
              opacity: 0.85,
              whiteSpace: 'nowrap',
            }}
          >
            {timeShort(story.published_at)}
          </span>
        )}
      </div>
    </Link>
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

// Anon viewers who reach the bottom of the front page are warm leads — surface
// the product pitch + sign-up CTA. Logged-in viewers see the browse link they
// already have permission for. Per OwnersAudit Home Task 2.
function EndOfFrontPage({ loggedIn }: { loggedIn: boolean }) {
  return (
    <footer
      style={{
        marginTop: 64,
        paddingTop: 28,
        borderTop: `1px solid ${C.rule}`,
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontFamily: serifStack,
          fontStyle: 'italic',
          fontSize: 14,
          color: C.dim,
          margin: 0,
        }}
      >
        That&rsquo;s today&rsquo;s front page.
      </p>
      {loggedIn ? (
        <p style={{ margin: '12px 0 0' }}>
          <Link
            href="/browse"
            style={{
              fontFamily: serifStack,
              fontSize: 16,
              color: C.accent,
              textDecoration: 'underline',
              textUnderlineOffset: 4,
              fontWeight: 500,
            }}
          >
            Browse all categories &rarr;
          </Link>
        </p>
      ) : (
        <>
          <p
            style={{
              fontFamily: serifStack,
              fontSize: 15,
              color: C.soft,
              margin: '16px 0 0',
              lineHeight: 1.5,
            }}
          >
            Create a free account to unlock comments and track your reading streak.
          </p>
          <p style={{ margin: '12px 0 0' }}>
            <Link
              href="/signup"
              style={{
                fontFamily: serifStack,
                fontSize: 16,
                color: C.accent,
                textDecoration: 'underline',
                textUnderlineOffset: 4,
                fontWeight: 500,
              }}
            >
              Create free account &rarr;
            </Link>
          </p>
        </>
      )}
    </footer>
  );
}

function FrontPageSkeleton() {
  return (
    <div aria-hidden="true">
      <style>{`@keyframes vp-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>
      {/* Hero block — mirrors the full-bleed dark band */}
      <div
        style={{
          background: HERO_DEFAULT_BG,
          position: 'relative',
          left: '50%',
          right: '50%',
          marginLeft: '-50vw',
          marginRight: '-50vw',
          width: '100vw',
          padding: '48px 0 40px',
          marginBottom: 32,
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>
          <div
            style={{
              height: 11,
              width: 90,
              background: 'rgba(255,255,255,0.18)',
              borderRadius: 2,
              marginBottom: 20,
              animation: 'vp-pulse 1.6s ease-in-out infinite',
            }}
          />
          <div
            style={{
              height: 36,
              width: '88%',
              background: 'rgba(255,255,255,0.14)',
              borderRadius: 4,
              marginBottom: 12,
              animation: 'vp-pulse 1.6s ease-in-out infinite',
            }}
          />
          <div
            style={{
              height: 36,
              width: '62%',
              background: 'rgba(255,255,255,0.14)',
              borderRadius: 4,
              marginBottom: 24,
              animation: 'vp-pulse 1.6s ease-in-out infinite',
            }}
          />
          <div
            style={{
              height: 17,
              width: '90%',
              background: 'rgba(255,255,255,0.10)',
              borderRadius: 3,
              marginBottom: 8,
              animation: 'vp-pulse 1.6s ease-in-out infinite',
            }}
          />
          <div
            style={{
              height: 17,
              width: '70%',
              background: 'rgba(255,255,255,0.10)',
              borderRadius: 3,
              animation: 'vp-pulse 1.6s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      {/* Supporting cards */}
      <section style={{ marginTop: 56 }}>
        {[0, 1, 2, 3].map((i) => (
          <Fragment key={i}>
            {i > 0 && <hr style={hairlineStyle} />}
            <div style={{ padding: '24px 0' }}>
              <div
                style={{
                  height: 11,
                  width: 80,
                  background: C.rule,
                  borderRadius: 2,
                  marginBottom: 12,
                  animation: 'vp-pulse 1.6s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  height: 22,
                  width: '85%',
                  background: C.rule,
                  borderRadius: 3,
                  marginBottom: 10,
                  animation: 'vp-pulse 1.6s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  height: 14,
                  width: '70%',
                  background: C.rule,
                  borderRadius: 3,
                  marginBottom: 8,
                  animation: 'vp-pulse 1.6s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  height: 12,
                  width: 60,
                  background: C.rule,
                  borderRadius: 2,
                  marginTop: 12,
                  animation: 'vp-pulse 1.6s ease-in-out infinite',
                }}
              />
            </div>
          </Fragment>
        ))}
      </section>
    </div>
  );
}

// Distinct from EmptyDay — fires when the fetch itself errored. Without
// this branch, RLS / network / 5xx errors silently render as "no stories
// today", which lies to the reader. Retry rebuilds the data fetch.
function FetchFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      aria-label="Couldn't load today's front page"
      style={{ textAlign: 'center', padding: '64px 0' }}
    >
      <p
        style={{
          fontFamily: serifStack,
          fontStyle: 'italic',
          fontSize: 16,
          color: C.dim,
          margin: 0,
        }}
      >
        Couldn&rsquo;t reach the newsroom.
      </p>
      <p style={{ margin: '20px 0 0' }}>
        <button
          type="button"
          onClick={onRetry}
          style={{
            fontFamily: serifStack,
            fontSize: 15,
            color: C.accent,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 4,
            fontWeight: 500,
          }}
        >
          Try again &rarr;
        </button>
      </p>
    </section>
  );
}
