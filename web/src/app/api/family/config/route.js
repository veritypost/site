// Ext-J.4 — family-config endpoint. iOS FamilyViews previously
// hardcoded maxKids per tier, the COPPA consent version string, and
// the readingLevels list. Each of those now lives in DB / settings,
// fetched once on FamilyDashboardView mount, and falls back to the
// hardcoded defaults if the network is unavailable (so the app keeps
// working offline post-install).
//
// Auth: requires the parent auth session — the values themselves are
// not sensitive (max-kids per tier is public-facing pricing info,
// reading levels are content-tagging metadata, consent version is
// publicly auditable), but gating behind requirePermission keeps the
// surface consistent with the rest of /api/family/*.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';

// Hardcoded fallbacks — match the values FamilyViews.swift used pre-
// extraction. Both surfaces use these if their respective lookups fail.
//
// Phase 2 of AI + Plan Change Implementation locked these values:
//   - verity_family includes 1 kid; up to 4 kids total via per-kid add-on
//   - verity_family_xl is retired permanently (per-kid model replaces it)
//   - extra_kid_price_cents is the per-additional-kid monthly add-on
const DEFAULTS = {
  max_kids: { verity_family: 4 },
  included_kids: { verity_family: 1 },
  max_total_seats: { verity_family: 6 },
  extra_kid_price_cents: { verity_family: 499 },
  coppa_consent_version: '2026-04-15-v1',
  reading_levels: [
    { value: 'pre-reader', label: 'Pre-reader' },
    { value: 'early', label: 'Early reader' },
    { value: 'middle', label: 'Middle grades' },
    { value: 'advanced', label: 'Advanced' },
  ],
};

export async function GET() {
  try {
    await requirePermission('kids.parent.view');
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  // max_kids / included_kids / max_total_seats / extra_kid_price_cents:
  // read from plans.metadata for the verity_family tier. Falls back to
  // DEFAULTS when missing.
  const maxKids = { ...DEFAULTS.max_kids };
  const includedKids = { ...DEFAULTS.included_kids };
  const maxTotalSeats = { ...DEFAULTS.max_total_seats };
  const extraKidPriceCents = { ...DEFAULTS.extra_kid_price_cents };
  try {
    const { data: plans } = await service
      .from('plans')
      .select('tier, metadata')
      .eq('tier', 'verity_family')
      .eq('is_active', true);
    for (const p of plans || []) {
      const m = p.metadata || {};
      const max = typeof m.max_kids === 'number' ? m.max_kids : Number(m.max_kids);
      const inc = typeof m.included_kids === 'number' ? m.included_kids : Number(m.included_kids);
      const seats =
        typeof m.max_total_seats === 'number' ? m.max_total_seats : Number(m.max_total_seats);
      const price =
        typeof m.extra_kid_price_cents === 'number'
          ? m.extra_kid_price_cents
          : Number(m.extra_kid_price_cents);
      if (Number.isFinite(max) && max > 0) maxKids[p.tier] = max;
      if (Number.isFinite(inc) && inc >= 0) includedKids[p.tier] = inc;
      if (Number.isFinite(seats) && seats > 0) maxTotalSeats[p.tier] = seats;
      if (Number.isFinite(price) && price >= 0) extraKidPriceCents[p.tier] = price;
    }
  } catch (err) {
    console.error('[family.config] plans fetch failed:', err?.message || err);
  }

  // COPPA consent version + reading levels: settings table.
  let coppaConsentVersion = DEFAULTS.coppa_consent_version;
  let readingLevels = DEFAULTS.reading_levels;
  try {
    const settings = await getSettings(service);
    if (typeof settings['coppa.consent_version'] === 'string') {
      coppaConsentVersion = settings['coppa.consent_version'];
    }
    const rl = settings['kids.reading_levels'];
    if (Array.isArray(rl) && rl.length > 0) {
      // Accept either [{value, label}] or [string]; normalize to objects.
      readingLevels = rl
        .map((entry) => {
          if (typeof entry === 'string') return { value: entry, label: entry };
          if (entry && typeof entry === 'object' && entry.value) return entry;
          return null;
        })
        .filter(Boolean);
      if (readingLevels.length === 0) readingLevels = DEFAULTS.reading_levels;
    }
  } catch (err) {
    console.error('[family.config] settings fetch failed:', err?.message || err);
  }

  return NextResponse.json(
    {
      max_kids: maxKids,
      included_kids: includedKids,
      max_total_seats: maxTotalSeats,
      extra_kid_price_cents: extraKidPriceCents,
      coppa_consent_version: coppaConsentVersion,
      reading_levels: readingLevels,
    },
    {
      // Short edge cache — values change rarely; iOS clients can refetch
      // on each FamilyDashboardView mount without thundering the API.
      headers: { 'Cache-Control': 'private, max-age=60, s-maxage=60' },
    }
  );
}
