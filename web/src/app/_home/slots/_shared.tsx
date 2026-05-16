// Shared helpers + types for slot components. Pull in v1's color
// tokens and serif stack so the templated homepage reads as the same
// publication, just rearranged.

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  HOME_COLORS as C,
  HOME_SERIF_STACK as serifStack,
  timeShort,
} from '../_shared';
import type { Tables } from '@/types/database-helpers';
// The canonical HomeStory (with cover_image fields) lives in types.ts
// — re-export here so slot files can import everything they need from
// `./_shared`.
import type { HomeStory } from '../types';

export { C, serifStack };
export type { HomeStory };

export type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

// Wave 3: trending article projection. The `trending_stories_recent`
// view rows are coerced into HomeStory-shaped objects by HomeRoot so
// the list_rail renderer can reuse its existing StoryLink/categoryFor
// helpers without per-source branching.
export type TrendingArticle = HomeStory;

// Compact timeline event shape used by the hero card's "How we got
// here" rail. Mirrors the `timelines` table — only the fields the
// hero strip actually shows. `isToday` is precomputed server-side so
// the renderer can highlight today's entry without a date check
// during render.
export type HeroTimelineEvent = {
  id: string;
  event_label: string | null;
  event_date: string | null;
  event_body: string | null;
  isToday: boolean;
};

// Meta strip + change-note + footer copy for the hero card. All
// precomputed server-side so the StoryCard renderer stays a pure
// presentation layer.
export type HeroMeta = {
  lifecycleLabel: string | null; // e.g. "DEVELOPING" — null when not flagged
  timelineCount: number;
  sourcesCount: number;
  lastChangedRelative: string | null; // e.g. "18m ago"
  changeNote: string | null; // today's most-recent event_body, when dated today
};

export type CardCtx = {
  categoryById: Record<string, CategoryRow>;
  // Pre-fetched once by HomeRoot when at least one list_rail slot has
  // `config.source === 'trending'`. Undefined otherwise to avoid the
  // wasted query.
  trendingArticles?: TrendingArticle[];
  // Pre-fetched once by HomeRoot for the hero story_card slot (config.
  // variant='hero'). Rendered to the right of the hero headline + dek.
  heroTimeline?: HeroTimelineEvent[];
  heroMeta?: HeroMeta;
};

export function categoryFor(
  story: HomeStory,
  ctx: CardCtx,
): CategoryRow | undefined {
  return story.category_id ? ctx.categoryById[story.category_id] : undefined;
}

export function storyHref(story: HomeStory): string | null {
  // Canonical article URL is `/{slug}`. The legacy `/story/{slug}` shape
  // is kept alive as a 301 in next.config.js for old bookmarks + iOS
  // share URLs (iOS app still emits the legacy shape until the next
  // release — see Stage 2 follow-up).
  return story.stories?.slug ? `/${story.stories.slug}` : null;
}

export function Eyebrow({
  category,
  fallback,
}: {
  category?: CategoryRow;
  fallback?: string;
}) {
  const label = category?.name ?? fallback;
  if (!label) return null;
  return (
    <p
      style={{
        margin: 0,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: C.dim,
      }}
    >
      {label}
    </p>
  );
}

export function MetaLine({ story }: { story: HomeStory }) {
  const t = timeShort(story.published_at);
  if (!t) return null;
  return (
    <p
      style={{
        margin: '6px 0 0',
        fontSize: 12,
        color: C.dim,
      }}
    >
      {t}
    </p>
  );
}

export function StoryLink({
  story,
  children,
  className,
  style,
}: {
  story: HomeStory;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const href = storyHref(story);
  if (!href) return <>{children}</>;
  return (
    <Link
      href={href}
      className={className}
      data-testid="home-article-link"
      style={{
        color: 'inherit',
        textDecoration: 'none',
        display: 'block',
        ...style,
      }}
    >
      {children}
    </Link>
  );
}
