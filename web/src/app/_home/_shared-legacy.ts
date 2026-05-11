// Legacy shared helpers + types carried over from the retired
// hand-curated home. Still imported by `Sidebar.tsx`, `SectionsMenu.tsx`,
// and several slot renderers (`_home/types.ts`, `_home/slots/_shared.tsx`,
// `SecondaryPair`, `ListRail`, `WideStrip`). Kept here under the `-legacy`
// suffix to signal that the contents should eventually be merged into
// proper homes (`_home/slots/_shared.tsx` already exists separately);
// this file is here for compatibility, not as the canonical place for
// these utilities.

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
  accent: 'var(--p-ink)',
};

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
