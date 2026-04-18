import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/data-requests?status=pending
// Lists data_requests joined with the requesting user's identity info
// so the admin reviewer can verify identity before approving the export.
export async function GET(request) {
  try { await requireRole('editor'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';

  const service = createServiceClient();
  const { data, error } = await service
    .from('data_requests')
    .select('*, users!fk_data_requests_user_id(id, username, email, email_verified, created_at, avatar_color)')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ requests: data || [] });
}
