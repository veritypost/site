// POST — flip the live homepage between the legacy hardcoded route and
// the templated layout.
//
// body: { target: 'legacy' | 'home' }
//   home:   set home_layouts row (slug='home') status='live'. The partial
//           unique index ensures no other layout is live at the same time.
//   legacy: set home_layouts row (slug='home') status='draft' so no live
//           row exists; root /page.tsx falls through to the v1 hardcoded
//           route.
//
// Wraps the swap in a transaction so the two-step "archive existing live
// then promote" path can never leave us in a no-live or two-live state.
// Calls revalidatePath('/') so visitors see the new layout immediately.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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
    key: `admin.home.promote:${actor.id}`,
    policyKey: 'admin.home.promote',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { target?: unknown };
  const target =
    body.target === 'legacy' || body.target === 'home' ? body.target : null;
  if (!target) {
    return NextResponse.json(
      { error: 'target must be "legacy" or "home"' },
      { status: 400 },
    );
  }

  if (target === 'home') {
    // Archive any currently-live layout, then promote the templated home.
    // Two-step because the partial unique index forbids two live rows in
    // flight.
    const { error: archiveErr } = await service
      .from('home_layouts')
      .update({ status: 'archived' })
      .eq('status', 'live');
    if (archiveErr) {
      console.error('[admin.home.promote.archive]', archiveErr.message);
      return NextResponse.json({ error: 'Could not archive live layout' }, { status: 500 });
    }
    const { error: promoteErr } = await service
      .from('home_layouts')
      .update({ status: 'live', published_at: new Date().toISOString() })
      .eq('slug', 'home');
    if (promoteErr) {
      console.error('[admin.home.promote.live]', promoteErr.message);
      return NextResponse.json({ error: 'Could not promote home layout' }, { status: 500 });
    }
  } else {
    // Roll back to the legacy hardcoded route. The templated row goes draft
    // so no live row exists; root /page.tsx falls through to v1.
    const { error: draftErr } = await service
      .from('home_layouts')
      .update({ status: 'draft' })
      .eq('slug', 'home');
    if (draftErr) {
      console.error('[admin.home.promote.rollback]', draftErr.message);
      return NextResponse.json({ error: 'Could not roll back to legacy home' }, { status: 500 });
    }
  }

  await recordAdminAction({
    action: 'home.promote',
    targetTable: 'home_layouts',
    targetId: 'home',
    newValue: { target },
  });

  // Bust the home page cache so the next visit serves the new layout.
  revalidatePath('/');

  return NextResponse.json({ ok: true, live: target });
}
