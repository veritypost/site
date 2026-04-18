import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const ALLOWED = ['name', 'advertiser_name', 'advertiser_contact', 'campaign_type', 'objective',
  'status', 'start_date', 'end_date', 'total_budget_cents', 'daily_budget_cents',
  'pricing_model', 'rate_cents', 'notes'];

export async function PATCH(request, { params }) {
  try { await requireRole('admin'); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  const service = createServiceClient();
  const { error } = await service.from('ad_campaigns').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  try { await requireRole('admin'); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const service = createServiceClient();
  const { error } = await service.from('ad_campaigns').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
