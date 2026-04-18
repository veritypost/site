import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/expert/applications?status=pending
export async function GET(request) {
  try { await requireRole('editor'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';

  const service = createServiceClient();
  const { data, error } = await service
    .from('expert_applications')
    .select('*, users!fk_expert_applications_user_id(id, username, email, avatar_color), expert_application_categories(categories(id, name))')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ applications: data || [] });
}
