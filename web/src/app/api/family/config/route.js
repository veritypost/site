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
const DEFAULTS = {
  max_kids: { verity_family: 2, verity_family_xl: 4 },
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

  // max_kids: read from plans.metadata->>'max_kids' for the family tiers
  // when present. Falls back to DEFAULTS when the metadata key isn't set.
  const maxKids = { ...DEFAULTS.max_kids };
  try {
    const { data: plans } = await service
      .from('plans')
      .select('tier, metadata')
      .in('tier', ['verity_family', 'verity_family_xl']);
    for (const p of plans || []) {
      const fromMeta = p.metadata?.max_kids;
      const n = typeof fromMeta === 'number' ? fromMeta : Number(fromMeta);
      if (Number.isFinite(n) && n > 0) maxKids[p.tier] = n;
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
