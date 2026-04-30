import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// GET /api/account/login-activity — last 50 login events for the authed user.
// Wraps the get_own_login_activity RPC which reads auth.uid() internally.
export async function GET() {
  try {
    await requirePermission('settings.account.login_activity.view');
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_own_login_activity', { p_limit: 50 });
  if (error) {
    console.error('[account.login-activity.get]', error.message);
    return NextResponse.json({ error: 'Could not load login activity.' }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ entries: data ?? [] }, { headers: NO_STORE });
}
