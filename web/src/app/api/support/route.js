// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { createClient, createClientFromToken } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { NextResponse } from 'next/server';

// Round 7 follow-up — iOS (SettingsView, ProfileView) POSTs here with a
// Bearer token; without bearer-bound client the create_support_ticket
// RPC fails because the cookie-resolved client is anon. Mirror
// /api/stories/read's route-local pattern.
function bearerToken(request) {
  const h = request.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

export async function POST(request) {
  try {
    const token = bearerToken(request);
    const supabase = token ? createClientFromToken(token) : await createClient();
    const user = await requireAuth(supabase);
    const { category, subject, description } = await request.json();

    if (!category || !subject || !description) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Round 7 Bug 2 -- atomic ticket create via create_support_ticket RPC.
    // Previously we ran two sequential `.insert()` calls (support_tickets
    // header, then ticket_messages body). If the second insert failed
    // (transient PG error, constraint violation on body, network blip)
    // the header row was already committed and surfaced as a naked row
    // in the staff queue with no message. The RPC wraps both inserts in
    // a single plpgsql transaction so a failure rolls both back. Ticket
    // number is also generated server-side inside the RPC (single source
    // of truth; tight uniqueness window). `support_tickets` has no
    // `description` column -- message body lives in `ticket_messages`.
    // `priority` defaults to 'normal' on the table so we don't pass one.
    const { data: ticket, error: rpcErr } = await supabase.rpc('create_support_ticket', {
      p_category: category,
      p_subject: subject,
      p_body: description,
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    return NextResponse.json({ ticket });
  } catch (err) {
    if (err && err.status) {
      console.error('[support.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// GET handler to list user's tickets
export async function GET(request) {
  try {
    const token = bearerToken(request);
    const supabase = token ? createClientFromToken(token) : await createClient();
    const user = await requireAuth(supabase);

    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ tickets: data || [] });
  } catch (err) {
    if (err && err.status) {
      console.error('[support.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
