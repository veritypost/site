// Home v2 — hand-shaped editorial layout, grid-locked, theme-aware.
//
// Architecture
//   • A 12-column grid drives every row. Hero is 8/4. Today-large is 6/6.
//     Today-smaller is 4/4/4. Mobile collapses to a single column.
//   • Spacing comes from a single 4px scale: 4 / 8 / 12 / 16 / 24 / 32 /
//     48 / 64. No ad-hoc values.
//   • Colors come from `var(--p-*)` tokens, so the page flips with the
//     site's light/dark theme switch (data-theme on <html>).
//   • The hero overlay is the only element that breaks the grid — its
//     text padding is tuned to align visually with the page gutter
//     beneath it, so the headline's left edge lines up with the
//     cards below.
//
// What's deliberately not here
//   • No slot system render path (slots/* stays as code, unused).
//   • No breaking strip, no expert rail at zero state, no
//     summary/key-takeaways boxes, no popups.
//
// Reads from `top_stories` first; falls back to recent published
// articles to fill any gaps. NavWrapper continues to render the
// global chrome above this page.

import Link from 'next/link';
import { createServiceClient } from '../../lib/supabase/server';
import type { Tables } from '@/types/database-helpers';
import type { HomeStory } from '../_homeShared';

type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

// Local extension — `HomeStory` in `_homeShared.ts` belongs to v1 and
// doesn't carry the cover-image columns. Selecting + typing them here
// keeps v1's shared type untouched.
type HomeStoryV2 = HomeStory & {
  cover_image_url: string | null;
  cover_image_alt: string | null;
};

// Type stacks. The serif is the page's voice; sans is for chrome only.
const SERIF =
  '"Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif';
const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

// Category sigils. Saturated mid-tones that read in both light and dark
// themes; used for the small color square next to the eyebrow label
// and as a fallback hero background when an article ships without a
// cover image.
const CATEGORY_PALETTE: Record<string, string> = {
  politics: '#7A2D3A',
  congress: '#7A2D3A',
  business: '#1F4E79',
  markets: '#1F4E79',
  'personal-finance': '#1F4E79',
  technology: '#2D4F3A',
  tech: '#2D4F3A',
  ai: '#2D4F3A',
  science: '#5B3F7A',
  space: '#5B3F7A',
  health: '#A85A2B',
  'public-health': '#A85A2B',
  culture: '#5B4A2B',
  movies: '#5B4A2B',
  world: '#5B3F7A',
  asia: '#5B3F7A',
};

const ARTICLE_SELECT =
  'id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at, cover_image_url, cover_image_alt';

type TopStoryRow = { position: number; articles: HomeStoryV2 | null };

export const dynamic = 'force-dynamic';

function categoryColor(slug: string | null | undefined): string {
  if (!slug) return '#3f3f46';
  return CATEGORY_PALETTE[slug] || '#3f3f46';
}

function articleHref(s: HomeStoryV2): string {
  const slug = s.stories?.slug;
  return slug ? `/${slug}` : '#';
}

function CategoryEyebrow({
  slug,
  name,
  light = false,
}: {
  slug: string | null;
  name: string;
  light?: boolean;
}) {
  const color = light ? '#ffffff' : categoryColor(slug);
  return (
    <div
      style={{
        fontFamily: SANS,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        opacity: light ? 0.92 : 1,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          background: light ? '#ffffff' : categoryColor(slug),
          display: 'inline-block',
        }}
      />
      {name}
    </div>
  );
}

function HeroLead({
  story,
  category,
}: {
  story: HomeStoryV2;
  category: CategoryRow | undefined;
}) {
  const accent = categoryColor(category?.slug ?? null);
  const catName = category?.name || 'News';
  return (
    <article className="vp-v2-hero">
      <Link
        href={articleHref(story)}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div className="vp-v2-hero-frame" style={{ backgroundColor: accent }}>
          {story.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="vp-v2-hero-img"
              src={story.cover_image_url}
              alt={story.cover_image_alt || ''}
            />
          ) : (
            <div className="vp-v2-hero-hatch" />
          )}
          <div className="vp-v2-hero-scrim" />
          <div className="vp-v2-hero-text">
            <CategoryEyebrow
              slug={category?.slug ?? null}
              name={catName}
              light
            />
            <h2
              style={{
                fontFamily: SERIF,
                fontSize: 'clamp(22px, 3vw, 40px)',
                lineHeight: 1.06,
                fontWeight: 600,
                letterSpacing: '-0.022em',
                color: '#ffffff',
                margin: '12px 0 0',
              }}
            >
              {story.title}
            </h2>
            {story.excerpt && (
              <p
                style={{
                  fontFamily: SERIF,
                  fontSize: 'clamp(13px, 1.1vw, 16px)',
                  lineHeight: 1.45,
                  color: 'rgba(255,255,255,0.92)',
                  margin: '12px 0 0',
                }}
              >
                {story.excerpt}
              </p>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

function SecondaryItem({
  story,
  category,
  isFirst,
}: {
  story: HomeStoryV2;
  category: CategoryRow | undefined;
  isFirst: boolean;
}) {
  return (
    <article
      className={isFirst ? 'vp-v2-secondary-item vp-v2-secondary-first' : 'vp-v2-secondary-item'}
    >
      <CategoryEyebrow slug={category?.slug ?? null} name={category?.name || 'News'} />
      <Link
        href={articleHref(story)}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <h3
          style={{
            fontFamily: SERIF,
            fontSize: 19,
            lineHeight: 1.2,
            fontWeight: 600,
            letterSpacing: '-0.012em',
            color: 'var(--p-ink)',
            margin: '8px 0 0',
          }}
        >
          {story.title}
        </h3>
        {story.excerpt && (
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--p-ink-muted)',
              margin: '8px 0 0',
            }}
          >
            {story.excerpt}
          </p>
        )}
      </Link>
    </article>
  );
}

function TodayLarger({
  story,
  category,
}: {
  story: HomeStoryV2;
  category: CategoryRow | undefined;
}) {
  return (
    <article className="vp-v2-today-card">
      <Link
        href={articleHref(story)}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div
          className="vp-v2-card-frame"
          style={{ backgroundColor: categoryColor(category?.slug ?? null) }}
        >
          {story.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="vp-v2-card-img"
              src={story.cover_image_url}
              alt={story.cover_image_alt || ''}
            />
          ) : (
            <div className="vp-v2-hero-hatch" />
          )}
        </div>
        <div className="vp-v2-card-text">
          <CategoryEyebrow
            slug={category?.slug ?? null}
            name={category?.name || 'News'}
          />
          <h3
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(20px, 2vw, 26px)',
              lineHeight: 1.2,
              fontWeight: 600,
              letterSpacing: '-0.012em',
              color: 'var(--p-ink)',
              margin: '8px 0 0',
            }}
          >
            {story.title}
          </h3>
          {story.excerpt && (
            <p
              style={{
                fontFamily: SERIF,
                fontSize: 15,
                lineHeight: 1.5,
                color: 'var(--p-ink-muted)',
                margin: '8px 0 0',
              }}
            >
              {story.excerpt}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}

function TodaySmaller({
  story,
  category,
}: {
  story: HomeStoryV2;
  category: CategoryRow | undefined;
}) {
  return (
    <article className="vp-v2-today-card">
      <Link
        href={articleHref(story)}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <CategoryEyebrow
          slug={category?.slug ?? null}
          name={category?.name || 'News'}
        />
        <h3
          style={{
            fontFamily: SERIF,
            fontSize: 18,
            lineHeight: 1.25,
            fontWeight: 600,
            letterSpacing: '-0.012em',
            color: 'var(--p-ink)',
            margin: '8px 0 0',
          }}
        >
          {story.title}
        </h3>
        {story.excerpt && (
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--p-ink-muted)',
              margin: '8px 0 0',
            }}
          >
            {story.excerpt}
          </p>
        )}
      </Link>
    </article>
  );
}

export default async function HomeV2Page({
  previewSlug: _previewSlug,
}: {
  previewSlug?: string;
} = {}) {
  const service = createServiceClient();

  const [topStoriesRes, recentRes, catsRes] = await Promise.all([
    service
      .from('top_stories')
      .select(
        `position, articles!top_stories_article_id_fkey(${ARTICLE_SELECT})`,
      )
      .order('position', { ascending: true })
      .limit(10),
    service
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(20),
    service
      .from('categories')
      .select('id, name, slug, color_hex, parent_id, sort_order')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false }),
  ]);

  const topRows =
    ((topStoriesRes.data as TopStoryRow[] | null) || [])
      .map((r) => r.articles)
      .filter((a): a is HomeStoryV2 => !!a) ?? [];
  const recentRows = (recentRes.data as HomeStoryV2[] | null) || [];

  const seen = new Set<string>();
  const curated: HomeStoryV2[] = [];
  for (const a of [...topRows, ...recentRows]) {
    if (a && !seen.has(a.id)) {
      seen.add(a.id);
      curated.push(a);
    }
  }

  const cats = (catsRes.data as CategoryRow[] | null) || [];
  const categoryById: Record<string, CategoryRow> = {};
  cats.forEach((c) => {
    categoryById[c.id] = c;
  });

  const hero = curated[0] || null;
  const secondary = curated.slice(1, 3);
  const todayLarger = curated.slice(3, 5);
  const todaySmaller = curated.slice(5, 8);

  if (!hero) {
    return (
      <div className="vp-v2-root">
        <p
          style={{
            fontFamily: SERIF,
            fontStyle: 'italic',
            color: 'var(--p-ink-muted)',
            textAlign: 'center',
            padding: '64px 24px',
          }}
        >
          Nothing here yet.
        </p>
        <Vp2Styles />
      </div>
    );
  }

  const heroCat = hero.category_id ? categoryById[hero.category_id] : undefined;

  return (
    <div className="vp-v2-root">
      <h1 className="vp-v2-sr-only">Verity Post</h1>

      <div className="vp-v2-shell">
        {/* Hero zone — 8 + 4 grid. */}
        <section className="vp-v2-hero-grid">
          <div className="vp-v2-hero-col">
            <HeroLead story={hero} category={heroCat} />
          </div>
          {secondary.length > 0 && (
            <aside className="vp-v2-secondary-col">
              {secondary.map((s, i) => {
                const cat = s.category_id
                  ? categoryById[s.category_id]
                  : undefined;
                return (
                  <SecondaryItem
                    key={s.id}
                    story={s}
                    category={cat}
                    isFirst={i === 0}
                  />
                );
              })}
            </aside>
          )}
        </section>

        {(todayLarger.length > 0 || todaySmaller.length > 0) && (
          <section className="vp-v2-today">
            <div className="vp-v2-rule-strong" />

            {todayLarger.length > 0 && (
              <div className="vp-v2-row vp-v2-row-2">
                {todayLarger.map((s) => {
                  const cat = s.category_id
                    ? categoryById[s.category_id]
                    : undefined;
                  return <TodayLarger key={s.id} story={s} category={cat} />;
                })}
              </div>
            )}

            {todayLarger.length > 0 && todaySmaller.length > 0 && (
              <div className="vp-v2-rule" />
            )}

            {todaySmaller.length > 0 && (
              <div className="vp-v2-row vp-v2-row-3">
                {todaySmaller.map((s) => {
                  const cat = s.category_id
                    ? categoryById[s.category_id]
                    : undefined;
                  return <TodaySmaller key={s.id} story={s} category={cat} />;
                })}
              </div>
            )}
          </section>
        )}
      </div>

      <Vp2Styles />
    </div>
  );
}

// All v2 styles in one place. Inline so v1's `globals.css` stays
// untouched. Uses `var(--p-*)` tokens so the page flips with the site's
// theme switch.
function Vp2Styles() {
  const css = `
    .vp-v2-root {
      background: var(--p-bg);
      color: var(--p-ink-soft);
      min-height: 100vh;
      font-family: ${SANS};
    }
    .vp-v2-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: nowrap;
      border: 0;
    }
    .vp-v2-shell {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 16px 96px;
    }
    @media (min-width: 720px) {
      .vp-v2-shell { padding: 48px 24px 96px; }
    }

    /* 12-column grid for the hero zone. */
    .vp-v2-hero-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 0;
      column-gap: 24px;
      row-gap: 32px;
    }
    .vp-v2-hero-col { grid-column: 1 / -1; }
    .vp-v2-secondary-col { grid-column: 1 / -1; display: flex; flex-direction: column; }
    @media (min-width: 900px) {
      .vp-v2-hero-col { grid-column: 1 / span 8; }
      .vp-v2-secondary-col {
        grid-column: 9 / -1;
        border-left: 1px solid var(--p-border);
        padding-left: 24px;
      }
    }

    /* Hero image frame. */
    .vp-v2-hero-frame {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
    }
    .vp-v2-hero-img {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .vp-v2-hero-hatch {
      position: absolute; inset: 0;
      background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,0.06) 6px 7px);
    }
    .vp-v2-hero-scrim {
      position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0) 60%);
      pointer-events: none;
    }
    .vp-v2-hero-text {
      position: absolute;
      left: 0;
      bottom: 0;
      padding: 16px;
      color: #ffffff;
      max-width: calc(100% - 16px);
    }
    @media (min-width: 720px) {
      .vp-v2-hero-text { padding: 24px; max-width: calc(100% - 24px); }
    }
    @media (min-width: 900px) {
      .vp-v2-hero-text { padding: 32px; max-width: 50%; }
    }

    /* Secondary stack. Hairlines from the divider token. */
    .vp-v2-secondary-item {
      padding: 24px 0;
      border-top: 1px solid var(--p-divider);
    }
    .vp-v2-secondary-item:last-child { padding-bottom: 0; }
    @media (min-width: 900px) {
      .vp-v2-secondary-first {
        padding-top: 0;
        border-top: 0;
      }
    }

    /* Today rows. */
    .vp-v2-today { margin-top: 64px; }
    .vp-v2-rule-strong { height: 2px; background: var(--p-ink); }
    .vp-v2-rule { height: 1px; background: var(--p-divider); margin: 32px 0; }

    .vp-v2-row {
      display: grid;
      gap: 32px;
      padding-top: 32px;
    }
    .vp-v2-row-2 { grid-template-columns: 1fr; }
    .vp-v2-row-3 { grid-template-columns: 1fr; }
    @media (min-width: 720px) {
      .vp-v2-row-2 { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 900px) {
      .vp-v2-row-3 { grid-template-columns: repeat(3, 1fr); }
    }

    /* Today card frames. */
    .vp-v2-card-frame {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 10;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .vp-v2-card-img {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .vp-v2-card-text {}

    /* Reset link tap highlight in dark mode for a more print feel. */
    .vp-v2-root a { -webkit-tap-highlight-color: transparent; }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
