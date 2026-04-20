// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/admin/data-requests?status=pending
// Lists data_requests joined with the requesting user's identity info
// so the admin reviewer can verify identity before approving the export.
export async function GET(request) {
  try { await requirePermission('admin.users.data_requests.view'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';

  const service = createServiceClient();
  const { data, error } = await service
    .from('data_requests')
    .select('*, users!fk_data_requests_user_id(id, username, email, email_verified, created_at, avatar_color)')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'admin.data_requests', fallbackStatus: 400 });
  return NextResponse.json({ requests: data || [] });
}
