import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/admin/moderation/reports?status=pending&supervisor=true
export async function GET(request) {
  try { await requireRole('moderator'); }
  catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const supervisorOnly = url.searchParams.get('supervisor') === 'true';

  const service = createServiceClient();
  let q = service
    .from('reports')
    .select('*, reporter:users!reports_reporter_id_fkey(id, username, avatar_color)')
    .eq('status', status)
    // D22: supervisor-flagged reports jump the queue.
    .order('is_supervisor_flag', { ascending: false })
    .order('created_at', { ascending: false });
  if (supervisorOnly) q = q.eq('is_supervisor_flag', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ reports: data || [] });
}
