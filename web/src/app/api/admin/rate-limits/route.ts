// T-005 — server route for admin/system rate_limits upsert.
// Replaces direct `supabase.from('rate_limits').{update,upsert}(...)`
// from admin/system/page.tsx.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type Body = {
  id?: string | null;
  key?: string;
  display_name?: string;
  max_requests?: number;
  window_seconds?: number;
  scope?: 'user' | 'ip';
  is_active?: boolean;
};

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.rate_limits.configure');
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  const body = (await request.json().catch(() => ({}))) as Body;
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const payload = {
    key,
    display_name: typeof body.display_name === 'string' ? body.display_name : key,
    max_requests: typeof body.max_requests === 'number' ? body.max_requests : 0,
    window_seconds: typeof body.window_seconds === 'number' ? body.window_seconds : 60,
    scope: body.scope === 'ip' ? 'ip' : 'user',
    is_active: body.is_active !== false,
  };

  const service = createServiceClient();
  const { data: prior } = await service
    .from('rate_limits')
    .select('id, key, display_name, max_requests, window_seconds, scope, is_active')
    .eq('key', key)
    .maybeSingle();

  const { data, error } = await service
    .from('rate_limits')
    .upsert(payload, { onConflict: 'key' })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[admin.rate_limits.upsert]', error?.message);
    return NextResponse.json({ error: 'Could not save rate limit' }, { status: 500 });
  }

  await recordAdminAction({
    action: prior ? 'rate_limit.update' : 'rate_limit.create',
    targetTable: 'rate_limits',
    targetId: data.id,
    oldValue: prior,
    newValue: payload,
  });

  return NextResponse.json({ ok: true, id: data.id });
}
