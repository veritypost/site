/**
 * Editorial sensitivity tags applied to articles. Mirrors the blocking set
 * inside the serve_ad Postgres function. Adding a tag here is necessary
 * but NOT sufficient — to make a tag actually block ads, also extend the
 * ARRAY[...] literal in the serve_ad RPC (see
 * supabase/migrations/20260511130000_article_ad_eligibility.sql).
 */
export type SensitivityTag = {
  readonly id: string;
  readonly label: string;
  readonly blocking: boolean;
};

export const SENSITIVITY_TAGS = [
  { id: 'tragedy',           label: 'Tragedy / mass casualty',          blocking: true },
  { id: 'breaking_casualty', label: 'Active disaster (ongoing casualties)', blocking: true },
  { id: 'suicide_coverage',  label: 'Suicide coverage',                 blocking: true },
  { id: 'cw_sa',             label: 'CW: Sexual assault',               blocking: true },
  { id: 'cw_violence',       label: 'CW: Graphic violence',             blocking: true },
  { id: 'obit',              label: 'Obituary / memorial',              blocking: true },
] as const satisfies readonly SensitivityTag[];

export const KNOWN_SENSITIVITY_TAG_IDS: ReadonlySet<string> = new Set(
  SENSITIVITY_TAGS.map((t) => t.id),
);

export const BLOCKING_SENSITIVITY_TAG_IDS: ReadonlySet<string> = new Set(
  SENSITIVITY_TAGS.filter((t) => t.blocking).map((t) => t.id),
);

/**
 * Filter a user-supplied tag array down to known ids. Drops unknowns
 * silently; caller can log them if needed. Deduplicates.
 */
export function sanitizeSensitivityTags(raw: unknown): {
  tags: string[];
  dropped: string[];
} {
  if (!Array.isArray(raw)) return { tags: [], dropped: [] };
  const tags: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') {
      dropped.push(String(item));
      continue;
    }
    if (!KNOWN_SENSITIVITY_TAG_IDS.has(item)) {
      dropped.push(item);
      continue;
    }
    if (seen.has(item)) continue;
    seen.add(item);
    tags.push(item);
  }
  return { tags, dropped };
}
