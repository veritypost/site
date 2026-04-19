// Round D H-11 — public contact intake.
//
// Anon-friendly sibling of /api/support. The authed route calls the
// `create_support_ticket` RPC, but that RPC requires a non-null user id
// (raises "user id required") and is granted only to authenticated +
// service_role. Anon callers cannot satisfy it, so this route performs
// a direct insert via the service client, generating the ticket_number
// the same way the RPC does so both paths feed the staff queue in the
// same shape.
//
// Per-IP rate limit (5 submissions / hour) keeps the mailbox sane
// without blocking a user who mis-sent one ticket and needs to retry.
// Truncated IPs are stored in metadata for abuse correlation only
// (F-139 GDPR posture — never the full v4).

import { NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { truncateIpV4 } from '@/lib/apiErrors';

export async function POST(request) {
  const ip = await getClientIp();
  const service = createServiceClient();

  const rl = await checkRateLimit(service, {
    key: `support_public:ip:${ip}`,
    max: 5,
    windowSec: 3600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many submissions. Try again later.' },
      { status: 429 },
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const category = typeof body?.category === 'string' ? body.category.slice(0, 40) : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 200) : '';
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 4000) : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';

  if (!category || !subject || !description || !email || !email.includes('@')) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // If the caller happens to be signed in, attribute the ticket to
  // their user id. Otherwise leave user_id null (anon intake).
  let userId = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {}

  // Same ticket_number shape as the RPC in
  // 070_create_support_ticket_rpc_2026_04_18.sql so both intake paths
  // are indistinguishable to the staff queue.
  const ticketNumber = `VP-${Math.floor(Date.now()).toString(16).toUpperCase()}`;
  const truncatedIp = truncateIpV4(ip);

  const { data: ticket, error: ticketErr } = await service
    .from('support_tickets')
    .insert({
      ticket_number: ticketNumber,
      user_id: userId,
      email,
      category,
      subject,
      status: 'open',
      source: 'web_public',
      metadata: { ip_truncated: truncatedIp, public_intake: true },
    })
    .select('id, ticket_number')
    .single();

  if (ticketErr) {
    console.error('[api/support/public] ticket insert failed:', ticketErr.message);
    return NextResponse.json({ error: 'Could not submit. Try again later.' }, { status: 500 });
  }

  const { error: msgErr } = await service
    .from('ticket_messages')
    .insert({
      ticket_id: ticket.id,
      sender_id: userId,
      is_staff: false,
      body: description,
    });

  if (msgErr) {
    // Header landed but body didn't. Best-effort rollback so the staff
    // queue doesn't see a naked row. Matches Round 7 Bug 2 reasoning
    // for the authed path (which uses an atomic RPC instead).
    await service.from('support_tickets').delete().eq('id', ticket.id);
    console.error('[api/support/public] message insert failed:', msgErr.message);
    return NextResponse.json({ error: 'Could not submit. Try again later.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticket_number: ticket.ticket_number });
}
