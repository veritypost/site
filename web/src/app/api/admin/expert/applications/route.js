// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/admin/expert/applications?status=pending
export async function GET(request) {
  try { await requirePermission('admin.expert.applications.view'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';

  const service = createServiceClient();
  const { data, error } = await service
    .from('expert_applications')
    .select('*, users!fk_expert_applications_user_id(id, username, email, avatar_color), expert_application_categories(categories(id, name))')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.expert.applications', fallbackStatus: 400 });
  return NextResponse.json({ applications: data || [] });
}
