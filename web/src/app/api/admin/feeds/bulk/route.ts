// Admin feeds bulk endpoint — pause / resume / delete multiple feeds in one shot.
// Permission gate: admin.feeds.manage.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const MAX_IDS = 200;

type BulkBody = {
  ids?: unknown;
  op?: unknown;
};

export async function PATCH(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.feeds.bulk:${actor.id}`,
    policyKey: 'admin.feeds.bulk',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as BulkBody;

  // Validate ids.
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }
  if (body.ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `ids must contain at most ${MAX_IDS} items` },
      { status: 400 }
    );
  }
  if (body.ids.some((id) => typeof id !== 'string' || !id.trim())) {
    return NextResponse.json({ error: 'each id must be a non-empty string' }, { status: 400 });
  }
  const ids = body.ids as string[];

  // Validate op.
  if (body.op !== 'pause' && body.op !== 'resume' && body.op !== 'delete') {
    return NextResponse.json({ error: 'op must be pause | resume | delete' }, { status: 400 });
  }
  const op = body.op;

  if (op === 'pause' || op === 'resume') {
    const isActive = op === 'resume';
    const { data, error } = await service
      .from('feeds')
      .update({ is_active: isActive })
      .in('id', ids)
      .select('id');

    if (error) {
      console.error(`[admin.feeds.bulk] ${op} failed:`, error.message);
      return NextResponse.json({ error: `Could not ${op} feeds` }, { status: 500 });
    }

    const affected = data?.length ?? 0;

    await recordAdminAction({
      action: `feed.bulk.${op}`,
      targetTable: 'feeds',
      newValue: { ids, is_active: isActive, affected },
    });

    return NextResponse.json({ ok: true, affected });
  }

  // op === 'delete'
  // Capture prior state for audit before soft-deleting.
  const { data: prior } = await service
    .from('feeds')
    .select('id, name, url')
    .in('id', ids);

  // Soft-delete: rows stay for provenance; cascade FKs remain as safety net but
  // are not exercised through this path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: softDeleted, error } = await (service as any)
    .from('feeds')
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,  // also pause so ingest stops polling immediately
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)
    .select('id');

  if (error) {
    console.error('[admin.feeds.bulk] delete failed:', error.message);
    return NextResponse.json({ error: 'Could not delete feeds' }, { status: 500 });
  }

  const affected = softDeleted?.length ?? 0;

  await recordAdminAction({
    action: 'feed.bulk.delete',
    targetTable: 'feeds',
    oldValue: prior ?? ids,
    newValue: { ids, affected },
  });

  return NextResponse.json({ ok: true, affected });
}
