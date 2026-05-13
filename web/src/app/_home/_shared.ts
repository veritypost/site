// Shared home tokens + helpers (HomeStory projection, HOME_COLORS,
// HOME_SERIF_STACK, HOME_EDITORIAL_TZ, timeShort). Imported by Sidebar,
// SectionsMenu, types, and the slot _shared module. `slots/_shared.tsx`
// wraps these for slot-side consumption (CardCtx, StoryLink, MetaLine).

import type { Tables } from '@/types/database-helpers';

export type HomeStory = Pick<
  Tables<'articles'>,
  'id' | 'title' | 'excerpt' | 'category_id' | 'is_breaking' | 'is_developing' | 'published_at'
> & {
  stories: { slug: string | null; lifecycle_status: string | null } | null;
};

export const HOME_COLORS = {
  bg: 'var(--p-bg)',
  text: 'var(--p-ink)',
  soft: 'var(--p-ink-soft)',
  dim: 'var(--p-ink-dim)',
  muted: 'var(--p-ink-muted)',
  rule: 'var(--p-border)',
};

export const HOME_SERIF_STACK = "var(--font-source-serif), Georgia, 'Times New Roman', serif";

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
