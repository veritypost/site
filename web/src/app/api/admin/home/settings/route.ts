// POST — flip the sitewide v2 ads master switch. When ads_enabled=false,
// every ad slot on /home renders nothing (the _adProbe short-circuits).
// Targets the v2 layout by slug to match how sibling endpoints scope
// their writes (promote, items, slots). Revalidates '/' so visitors see
// the new state on next paint.
//
// body: { ads_enabled: boolean }
// returns: { ads_enabled }

import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.home.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.home.settings:${actor.id}`,
    policyKey: 'admin.home.settings',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    ads_enabled?: unknown;
  };
  if (typeof body.ads_enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'ads_enabled must be a boolean' },
      { status: 400 },
    );
  }
  const ads_enabled = body.ads_enabled;

  const { error } = await service
    .from('home_layouts')
    // updated_at is bumped by the home_layouts_updated_at trigger.
    .update({ ads_enabled })
    .eq('slug', 'home');
  if (error) {
    console.error('[admin.home.settings]', error.message);
    return NextResponse.json(
      { error: 'Could not update layout settings' },
      { status: 500 },
    );
  }

  await recordAdminAction({
    action: 'home.settings',
    targetTable: 'home_layouts',
    targetId: 'home',
    newValue: { ads_enabled },
  });

  // Bust the home page cache so the next visit reflects the flip.
  revalidatePath('/');
  revalidateTag('home-layout');

  return NextResponse.json({ ads_enabled });
}
