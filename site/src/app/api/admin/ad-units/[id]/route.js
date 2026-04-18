import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const ALLOWED = ['name', 'advertiser_name', 'ad_network', 'ad_network_unit_id', 'ad_format',
  'placement_id', 'campaign_id', 'creative_url', 'creative_html', 'click_url',
  'alt_text', 'cta_text', 'targeting_categories', 'frequency_cap_per_user',
  'frequency_cap_per_session', 'start_date', 'end_date', 'weight',
  'approval_status', 'is_active'];

export async function PATCH(request, { params }) {
  let user;
  try { user = await requireRole('admin'); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  if (b.approval_status === 'approved') update.approved_by = user.id;
  const service = createServiceClient();
  const { error } = await service.from('ad_units').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  try { await requireRole('admin'); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const service = createServiceClient();
  const { error } = await service.from('ad_units').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
