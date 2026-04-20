// T-005 — server route for admin/subscriptions refund-decision action.
// Replaces direct `supabase.from('invoices').update({metadata}).eq('id')`
// write (DB-only decision marker; Stripe refund issued separately).
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type Decision = 'approved' | 'denied' | 'partial';
const ALLOWED = new Set<Decision>(['approved', 'denied', 'partial']);

type Body = { invoice_id?: string; decision?: Decision };

export async function POST(request: Request) {
  let actor;
  try { actor = await requirePermission('admin.billing.refund'); }
  catch (err) { return permissionError(err); }
  void actor;

  const body = (await request.json().catch(() => ({}))) as Body;
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : '';
  const decision = body.decision as Decision | undefined;
  if (!invoiceId || !decision || !ALLOWED.has(decision)) {
    return NextResponse.json({ error: 'invoice_id and decision (approved|denied|partial) required' }, { status: 400 });
  }

  const statusMarker = decision === 'approved' ? 'approved_pending_stripe'
    : decision === 'denied' ? 'rejected'
    : decision;

  const service = createServiceClient();
  const { data: current } = await service
    .from('invoices')
    .select('id, metadata')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const nextMetadata = {
    ...((current.metadata as Record<string, unknown>) || {}),
    refund_status: statusMarker,
    refund_decided_at: new Date().toISOString(),
  };

  const { error } = await service
    .from('invoices')
    .update({ metadata: nextMetadata })
    .eq('id', invoiceId);
  if (error) {
    console.error('[admin.billing.refund-decision]', error.message);
    return NextResponse.json({ error: 'Could not save decision' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'billing.refund_decision_db_only',
    targetTable: 'invoices',
    targetId: invoiceId,
    oldValue: { refund_status: (current.metadata as Record<string, unknown>)?.refund_status },
    newValue: { refund_status: statusMarker, decision },
  });

  return NextResponse.json({ ok: true, refund_status: statusMarker });
}
