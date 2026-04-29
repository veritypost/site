import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// GET /api/account/sessions — list own active sessions
export async function GET() {
  let user;
  try {
    user = await requirePermission('settings.account.login_activity.view');
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('sessions')
    .select('id, user_agent, ip_address, last_active_at, created_at, is_current')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('last_active_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[account.sessions.get]', error.message);
    return NextResponse.json({ error: 'Could not load sessions.' }, { status: 500, headers: NO_STORE });
  }

  const sessions = (data ?? []).map((s) => ({
    id: s.id,
    user_agent: s.user_agent,
    ip: s.ip_address,
    last_seen_at: s.last_active_at,
    created_at: s.created_at,
    is_current: s.is_current,
  }));

  return NextResponse.json({ sessions }, { headers: NO_STORE });
}

// DELETE /api/account/sessions — revoke all other (non-current) sessions
export async function DELETE() {
  let user;
  try {
    user = await requirePermission('settings.account.sessions.revoke_all_other');
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `account.sessions.revoke_all:${user.id}`,
    policyKey: 'account_sessions_revoke_all',
    max: 5,
    windowSec: 300,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': '300', ...NO_STORE } }
    );
  }

  const { error } = await service
    .from('sessions')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoke_reason: 'user_revoked',
    })
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('is_current', false);

  if (error) {
    console.error('[account.sessions.revoke_all]', error.message);
    return NextResponse.json({ error: 'Could not revoke sessions.' }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
