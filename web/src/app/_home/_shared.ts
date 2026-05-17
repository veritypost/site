// Shared home tokens + helpers (HomeStory projection, HOME_COLORS,
// HOME_SERIF_STACK, HOME_EDITORIAL_TZ, timeShort). Imported by Sidebar,
// SectionsMenu, types, and the slot _shared module. `slots/_shared.tsx`
// wraps these for slot-side consumption (CardCtx, StoryLink, MetaLine).

import type { Tables } from '@/types/database-helpers';

export type HomeStory = Pick<
  Tables<'articles'>,
  'id' | 'title' | 'excerpt' | 'category_id' | 'is_breaking' | 'is_developing' | 'published_at' | 'updated_at'
> & {
  stories: { slug: string | null; lifecycle_status: string | null } | null;
};

// v2 palette — burgundy editorial accent + warm tones. Values resolve
// from the centralized --vp-* token block in app/globals.css so the
// home, masthead, article, and comment surfaces all share one source
// of truth. Change a token in globals.css and every consumer follows.
export const HOME_COLORS = {
  bg: 'var(--vp-surface)',
  text: 'var(--vp-ink)',
  soft: 'var(--vp-text-muted)',
  dim: 'var(--vp-text-soft)',
  muted: 'var(--vp-text-muted)',
  rule: 'var(--vp-border)',
  accent: 'var(--vp-accent)',
  accentSoft: 'var(--vp-accent-soft)',
  accentDark: 'var(--vp-accent-dark)',
  borderSoft: 'var(--vp-border-soft)',
  surfaceSoft: 'var(--vp-surface-soft)',
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

// Shared bucketed relative-time formatter for the hero "Last changed Xm
// ago" strip. Used by HomeRoot (SSR) and the RelativeTime client
// component so the hydrated string matches the server-rendered copy
// exactly — otherwise React logs a hydration mismatch and the label
// flickers. Ramp: Xs / Xm / Xh / Xd / Xw / Xmo / Xy (editorial, not
// techy). `now` is parameterized so future tests can freeze time.
export function relativeTimeBucket(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
