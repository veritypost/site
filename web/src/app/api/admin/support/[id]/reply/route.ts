import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let actor: { id: string };
  try {
    actor = await requirePermission('admin.support.reply');
  } catch (err) {
    return permissionError(err);
  }

  const { id: ticketId } = await params;
  if (!ticketId) return NextResponse.json({ error: 'ticket id required' }, { status: 400 });

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.support.reply:${actor.id}`,
    policyKey: 'admin.support.reply',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const raw = await request.json().catch(() => ({}));
  const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
  if (!body) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  const { data: ticket, error: ticketErr } = await service
    .from('support_tickets')
    .select('id')
    .eq('id', ticketId)
    .single();
  if (ticketErr || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const { data: inserted, error: insertErr } = await service
    .from('ticket_messages')
    .insert({
      ticket_id: ticketId,
      sender_id: actor.id,
      body,
      is_staff: true,
    })
    .select()
    .single();
  if (insertErr || !inserted) {
    return safeErrorResponse(NextResponse, insertErr ?? new Error('no row returned'), {
      route: 'admin.support.reply',
      fallbackStatus: 500,
      fallbackMessage: 'Could not send reply',
    });
  }

  await service
    .from('support_tickets')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', ticketId);

  await recordAdminAction({
    action: 'support.reply',
    targetTable: 'ticket_messages',
    targetId: (inserted as { id: string }).id,
    newValue: { ticket_id: ticketId, sender_id: actor.id, ticket_status: 'pending' },
  });

  return NextResponse.json({ ok: true, message: inserted });
}
