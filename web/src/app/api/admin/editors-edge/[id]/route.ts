// /api/admin/editors-edge/[id] — DELETE soft-remove an Editor's Edge pick.
//
// Same canonical admin-mutation order as the POST handler:
//   1. requirePermission('admin.curate.editors_edge')
//   2. createServiceClient()
//   3. checkRateLimit — 10/min for destructives (per shared convention)
//   4. fetch + validate the existing row (must not already be removed)
//   5. UPDATE editors_edge_picks SET removed_at = NOW()
//   6. recordAdminAction('editors_edge.remove')
//   7. revalidatePath('/directory') + revalidatePath('/admin/editors-edge')

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let actor;
  try {
    actor = await requirePermission('admin.curate.editors_edge');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.editors_edge.remove:${actor.id}`,
    policyKey: 'admin.editors_edge.remove',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });
  }

  // editors_edge_picks isn't in the generated Database type yet (migration
  // applied at runtime). Cast through the service client to read/write the
  // row without breaking the build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = service as any;

  const { data: existing, error: readErr } = await svc
    .from('editors_edge_picks')
    .select('id, article_id, category_id, subcategory_id, slot, valid_from, valid_to, removed_at')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    console.error('[admin.editors_edge.remove] read failed:', readErr.message);
    return NextResponse.json({ error: 'Could not load pick' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Pick not found' }, { status: 404 });
  }
  if ((existing as { removed_at: string | null }).removed_at !== null) {
    return NextResponse.json({ error: 'Pick is already removed' }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await svc
    .from('editors_edge_picks')
    .update({ removed_at: nowIso })
    .eq('id', id)
    .is('removed_at', null);
  if (updErr) {
    console.error('[admin.editors_edge.remove]', updErr.message);
    return NextResponse.json({ error: "Could not remove Editor's Edge pick" }, { status: 500 });
  }

  await recordAdminAction({
    action: 'editors_edge.remove',
    targetTable: 'editors_edge_picks',
    targetId: id,
    oldValue: existing,
    newValue: { removed_at: nowIso },
  });

  try {
    revalidatePath('/directory');
    revalidatePath('/admin/editors-edge');
  } catch (revalErr) {
    console.warn('[admin.editors_edge.remove] revalidate failed:', revalErr);
  }

  return NextResponse.json({ ok: true });
}
