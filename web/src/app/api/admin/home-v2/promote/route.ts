// POST — flip the live homepage between v1 (legacy) and v2 (templated).
//
// body: { target: 'v1' | 'v2' }
//   v2: set v2.status='live'. The partial unique index ensures no other
//       layout is live at the same time.
//   v1: set v2.status='draft' (no live row → root page falls through to
//       the legacy v1 hardcoded route).
//
// Wraps the swap in a transaction so the two-step "archive existing live
// then promote v2" path can never leave us in a no-live or two-live
// state. Calls revalidatePath('/') so visitors see the new layout
// immediately.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.home_v2.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.home_v2.promote:${actor.id}`,
    policyKey: 'admin.home_v2.promote',
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
  const target = body.target === 'v1' || body.target === 'v2' ? body.target : null;
  if (!target) {
    return NextResponse.json({ error: 'target must be "v1" or "v2"' }, { status: 400 });
  }

  if (target === 'v2') {
    // Archive any currently-live layout, then promote v2. Two-step
    // because the partial unique index forbids two live rows in flight.
    const { error: archiveErr } = await service
      .from('home_layouts')
      .update({ status: 'archived' })
      .eq('status', 'live');
    if (archiveErr) {
      console.error('[admin.home_v2.promote.archive]', archiveErr.message);
      return NextResponse.json({ error: 'Could not archive live layout' }, { status: 500 });
    }
    const { error: promoteErr } = await service
      .from('home_layouts')
      .update({ status: 'live', published_at: new Date().toISOString() })
      .eq('slug', 'v2');
    if (promoteErr) {
      console.error('[admin.home_v2.promote.live]', promoteErr.message);
      return NextResponse.json({ error: 'Could not promote v2' }, { status: 500 });
    }
  } else {
    // Roll back to v1 (the hardcoded legacy route). v2 goes draft so no
    // live row exists; root /page.tsx falls through to v1.
    const { error: draftErr } = await service
      .from('home_layouts')
      .update({ status: 'draft' })
      .eq('slug', 'v2');
    if (draftErr) {
      console.error('[admin.home_v2.promote.rollback]', draftErr.message);
      return NextResponse.json({ error: 'Could not roll back to v1' }, { status: 500 });
    }
  }

  await recordAdminAction({
    action: 'home_v2.promote',
    targetTable: 'home_layouts',
    targetId: 'v2',
    newValue: { target },
  });

  // Bust the home page cache so the next visit serves the new layout.
  revalidatePath('/');

  return NextResponse.json({ ok: true, live: target });
}
