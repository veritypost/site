/**
 * Wave 4 — Stream D Run Feed UI
 *
 * DELETE /api/admin/newsroom/research/items/:id
 *
 * Operator clicks Discard on the result-screen table. Hard-deletes the
 * discovery_items row. Per spec § Promotion flow:
 *   "Discard is a hard delete; the 90-day cleanup is the safety net."
 *
 * If the item already has story_observations rows, those are removed
 * by the discovery_items ON DELETE CASCADE (FK at
 * fk_story_observations_discovery_item is SET NULL not CASCADE — but
 * we explicitly null the link before the delete to avoid FK error).
 *
 * Permission: admin.pipeline.run_ingest.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: existing, error: readErr } = await service
    .from('discovery_items')
    .select('id, raw_url')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) {
    console.error('[research.items.discard.read]', readErr.message);
    return NextResponse.json({ error: 'Could not load item' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Null observation FKs first — the FK is SET NULL but doing it
  // explicitly here keeps the discard idempotent against schema drift.
  await service
    .from('story_observations')
    .update({ discovery_item_id: null })
    .eq('discovery_item_id', params.id);

  const { error: delErr } = await service
    .from('discovery_items')
    .delete()
    .eq('id', params.id);
  if (delErr) {
    console.error('[research.items.discard.delete]', delErr.message);
    return NextResponse.json({ error: 'Could not discard item' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'research.item.discard',
    targetTable: 'discovery_items',
    targetId: params.id,
    oldValue: { url: existing.raw_url },
  });

  return NextResponse.json({ ok: true });
}
