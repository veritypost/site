import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const { category, subject, description } = await request.json();

    if (!category || !subject || !description) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Generate ticket number
    const ticketNumber = 'VP-' + Date.now().toString(36).toUpperCase();

    const { data, error } = await supabase.from('support_tickets').insert({
      ticket_number: ticketNumber,
      user_id: user.id,
      email: user.email,
      category,
      subject,
      description,
      status: 'open',
      priority: 'medium',
      source: 'in_app',
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ticket: data });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// GET handler to list user's tickets
export async function GET() {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data } = await supabase.from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ tickets: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
