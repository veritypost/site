import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const ALLOWED = ['name', 'slug', 'description', 'logo_url', 'website_url',
  'contact_name', 'contact_email', 'billing_email',
  'contract_start', 'contract_end', 'is_active'];

export async function PATCH(request, { params }) {
  try { await requireRole('admin'); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  const service = createServiceClient();
  const { error } = await service.from('sponsors').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  try { await requireRole('admin'); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const service = createServiceClient();
  const { error } = await service.from('sponsors').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
