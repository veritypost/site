// Shared helpers + types for v2 slot components. Pull in v1's color
// tokens and serif stack so the templated homepage reads as the same
// publication, just rearranged.

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  HOME_COLORS as C,
  HOME_SERIF_STACK as serifStack,
  timeShort,
} from '../../_homeShared';
import type { Tables } from '@/types/database-helpers';
// v2's canonical HomeStory (with cover_image fields) lives in types.ts
// — re-export here so slot files can import everything they need from
// `./_shared`.
import type { HomeStory } from '../types';

export { C, serifStack };
export type { HomeStory };

export type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

export type CardCtx = {
  categoryById: Record<string, CategoryRow>;
};

export function categoryFor(
  story: HomeStory,
  ctx: CardCtx,
): CategoryRow | undefined {
  return story.category_id ? ctx.categoryById[story.category_id] : undefined;
}

export function storyHref(story: HomeStory): string | null {
  return story.stories?.slug ? `/story/${story.stories.slug}` : null;
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
