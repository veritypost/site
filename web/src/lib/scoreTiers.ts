// Score-tier helper — DB-backed replacement for the formerly-hardcoded
// TIER_META/TIERS constants in profile/page.tsx and admin/users/page.tsx.
//
// Prior code hardcoded six tiers with the keys
//   newcomer / reader / contributor / trusted / distinguished / luminary
// at thresholds 0/100/500/2000/5000/10000 — none of which matched the
// live `score_tiers` table, whose names are
//   newcomer / reader / informed / analyst / scholar / luminary
// at min_score 0/100/300/600/1000/1500. A user at score=300 was
// "contributor" in the UI but "informed" in the DB — two sources of
// truth drifting in opposite directions.
//
// This helper reads the single DB source and provides a 60s in-memory
// cache so the tier lookup (run on every row render in admin/users)
// doesn't hit the DB more than once per minute.
//
// Tracked as T-001 in TASKS.md.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ScoreTier {
  name: string;
  display_name: string;
  color_hex: string;
  min_score: number;
  max_score: number | null;
  sort_order: number;
}

let _cache: ScoreTier[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000;

export async function getScoreTiers(supabase: SupabaseClient): Promise<ScoreTier[]> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;
  const { data } = await supabase
    .from('score_tiers')
    .select('name, display_name, color_hex, min_score, max_score, sort_order')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  _cache = (data as ScoreTier[] | null) || [];
  _cacheTime = Date.now();
  return _cache;
}

// Resolve a user's score to their current tier. Expects `tiers` in
// ascending sort_order (which is how `getScoreTiers` returns them).
// Returns null only when the tiers list is empty (e.g. DB load failed
// or score_tiers is seeded empty) — callers should fall back to neutral
// styling rather than crashing.
export function tierFor(score: number | null | undefined, tiers: ScoreTier[]): ScoreTier | null {
  if (!tiers.length) return null;
  const n = Number(score) || 0;
  let picked: ScoreTier = tiers[0];
  for (const t of tiers) {
    if (n >= t.min_score) picked = t;
  }
  return picked;
}

// Next tier by sort_order. Returns null when `current` is the top tier
// or is absent from the list (caller should render "top tier reached").
export function nextTier(current: ScoreTier | null, tiers: ScoreTier[]): ScoreTier | null {
  if (!current || !tiers.length) return null;
  const idx = tiers.findIndex((t) => t.name === current.name);
  if (idx < 0 || idx >= tiers.length - 1) return null;
  return tiers[idx + 1];
}

export function clearScoreTiersCache(): void {
  _cache = null;
  _cacheTime = 0;
}
