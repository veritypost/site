import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try { await requireRole('admin'); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const service = createServiceClient();
  const { data, error } = await service.from('sponsors').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ sponsors: data || [] });
}

export async function POST(request) {
  try { await requireRole('admin'); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const b = await request.json().catch(() => ({}));
  if (!b.name || !b.slug) return NextResponse.json({ error: 'name + slug required' }, { status: 400 });
  const service = createServiceClient();
  const { data, error } = await service.from('sponsors').insert({
    name: b.name, slug: b.slug, description: b.description || null,
    logo_url: b.logo_url || null, website_url: b.website_url || null,
    contact_name: b.contact_name || null, contact_email: b.contact_email || null,
    billing_email: b.billing_email || null, contract_start: b.contract_start || null,
    contract_end: b.contract_end || null, is_active: true,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
