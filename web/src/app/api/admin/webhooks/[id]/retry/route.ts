import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let actor: { id: string };
  try {
    actor = await requirePermission('admin.webhooks.retry');
  } catch (err) {
    return permissionError(err);
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.webhooks.retry:${actor.id}`,
    policyKey: 'admin.webhooks.retry',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { data: existing, error: fetchErr } = await service
    .from('webhook_log')
    .select('id, processing_status, retry_count')
    .eq('id', id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Webhook log entry not found' }, { status: 404 });
  }

  const prevStatus = existing.processing_status;
  const prevRetryCount = existing.retry_count ?? 0;

  // No backend retry worker reads `webhook_log.processing_status='retrying'`
  // (verified via grep across web/src). The button is operator-acknowledgement
  // only — flips the row to success so it stops surfacing as a live failure.
  // Audit row makes the manual override traceable.
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await service
    .from('webhook_log')
    .update({
      processing_status: 'success',
      retry_count: prevRetryCount + 1,
      processed_at: nowIso,
      processing_error: null,
    })
    .eq('id', id);
  if (updateErr) {
    return safeErrorResponse(NextResponse, updateErr, {
      route: 'admin.webhooks.retry',
      fallbackStatus: 500,
      fallbackMessage: 'Could not update webhook log',
    });
  }

  await recordAdminAction({
    action: 'webhooks.manual_resolve',
    targetTable: 'webhook_log',
    targetId: id,
    oldValue: { processing_status: prevStatus, retry_count: prevRetryCount },
    newValue: { processing_status: 'success', retry_count: prevRetryCount + 1, manual_resolved: true },
  });

  return NextResponse.json({ ok: true });
}
