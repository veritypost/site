// Shared helpers + types used by the server-rendered `page.tsx` and the
// small client islands it composes (`_HomeBreakingStrip`, `_HomeFooter`,
// `_HomeFetchFailed`). Lives in its own file so the client islands can
// import from a non-`'use client'` module without dragging the server
// component into the client bundle (Next refuses that mix at compile time).

import type { Tables } from '@/types/database-helpers';

export type HomeStory = Pick<
  Tables<'articles'>,
  'id' | 'title' | 'excerpt' | 'category_id' | 'is_breaking' | 'published_at'
> & {
  stories: { slug: string } | null;
  hero_pick_for_date: string | null;
};

export const HOME_COLORS = {
  bg: '#ffffff',
  text: '#111111',
  soft: '#444444',
  dim: '#666666',
  muted: '#999999',
  rule: '#e5e5e5',
  accent: '#111111',
} as const;

export const HOME_SERIF_STACK = "Georgia, 'Times New Roman', 'Source Serif 4', serif";

export const HOME_EDITORIAL_TZ = 'America/New_York';

export function timeShort(dateIso: string | null): string {
  if (!dateIso) return '';
  const d = new Date(dateIso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: HOME_EDITORIAL_TZ,
    month: 'short',
    day: 'numeric',
  }).format(d);
}
