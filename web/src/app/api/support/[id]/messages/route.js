// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function GET(request, { params }) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    // Verify user owns this ticket
    const { data: ticket } = await supabase.from('support_tickets')
      .select('id, user_id')
      .eq('id', params.id)
      .maybeSingle();

    if (!ticket || ticket.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data } = await supabase.from('ticket_messages')
      .select('*')
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: true });

    return NextResponse.json({ messages: data || [] });
  } catch (err) {
    if (err && err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const { body } = await request.json();

    if (!body?.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Verify ownership
    const { data: ticket } = await supabase.from('support_tickets')
      .select('id, user_id')
      .eq('id', params.id)
      .maybeSingle();

    if (!ticket || ticket.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data, error } = await supabase.from('ticket_messages').insert({
      ticket_id: params.id,
      sender_id: user.id,
      is_staff: false,
      body: body.trim(),
    }).select().single();

    // Update ticket status to open if it was resolved/closed
    await supabase.from('support_tickets')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .in('status', ['resolved', 'closed']);

    if (error) return safeErrorResponse(NextResponse, error, { route: 'support.id.messages', fallbackStatus: 500 });
    return NextResponse.json({ message: data });
  } catch (err) {
    if (err && err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
