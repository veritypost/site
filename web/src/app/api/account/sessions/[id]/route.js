import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// DELETE /api/account/sessions/[id] — revoke a single session the user owns
export async function DELETE(_request, { params }) {
  const sessionId = params?.id;
  if (!sessionId) {
    return NextResponse.json({ error: 'Session id required.' }, { status: 400, headers: NO_STORE });
  }

  let user;
  try {
    user = await requirePermission('settings.account.sessions.revoke');
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `account.sessions.revoke:${user.id}`,
    policyKey: 'account_sessions_revoke',
    max: 20,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': '60', ...NO_STORE } }
    );
  }

  // Only revoke sessions owned by this user that are not the current session.
  const { data, error } = await service
    .from('sessions')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoke_reason: 'user_revoked',
    })
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('is_current', false)
    .select('id');

  if (error) {
    console.error('[account.sessions.revoke]', error.message);
    return NextResponse.json({ error: 'Could not revoke session.' }, { status: 500, headers: NO_STORE });
  }

  if (!data || data.length === 0) {
    // Either the session doesn't exist, belongs to someone else, or is the current session.
    return NextResponse.json({ error: 'Session not found or cannot be revoked.' }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
