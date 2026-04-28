/**
 * Session A — slug-collision helper.
 *
 * Decision 20 (AI-today.md): system-side first-save silently appends
 * `-2`, `-3`, ... until free; manual edits 409 instead. This helper
 * implements the system-side branch — used by the standalone-generate
 * path and any persist callsite where the model's first-pick slug
 * collides with an existing article.
 *
 * RLS-safe: the caller passes whatever Supabase client they already
 * have (service for backend, anon for any future client-side use).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_PROBES = 200;

export async function findFreeSlug(
  supabase: SupabaseClient,
  candidate: string
): Promise<string> {
  const base = (candidate ?? '').trim();
  if (!base) throw new Error('[slug-collide] candidate slug is empty');

  // Probe the candidate, then -2, -3, … until a row is missing. We pull a
  // single page covering the candidate plus its numeric-suffix siblings so
  // we only round-trip once for the common case. In the rare collision
  // storm we fall back to per-suffix probes capped at MAX_PROBES.
  const { data: prefixRows, error: prefixErr } = await supabase
    .from('articles')
    .select('slug')
    .or(`slug.eq.${base},slug.like.${base}-%`)
    .limit(MAX_PROBES);

  if (prefixErr) {
    throw new Error(`[slug-collide] articles probe failed: ${prefixErr.message}`);
  }

  const taken = new Set<string>((prefixRows ?? []).map((r) => String(r.slug)));
  if (!taken.has(base)) return base;
  for (let i = 2; i <= MAX_PROBES; i++) {
    const probe = `${base}-${i}`;
    if (!taken.has(probe)) return probe;
  }

  throw new Error(`[slug-collide] could not find a free slug for "${base}" within ${MAX_PROBES} probes`);
}
