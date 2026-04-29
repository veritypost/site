import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// POST /api/expert/vacation
// Body: { vacation_until: string | null }
// Toggles vacation mode on the user's approved expert application.
// null clears it; a future ISO timestamp activates it.
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('expert.application.view_own');
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `expert.vacation:${user.id}`,
    policyKey: 'expert_vacation_toggle',
    max: 10,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': '3600', ...NO_STORE } }
    );
  }

  const b = await request.json().catch(() => ({}));
  const vacationUntil = b.vacation_until ?? null;

  if (vacationUntil !== null) {
    const ts = Date.parse(vacationUntil);
    if (isNaN(ts) || ts <= Date.now()) {
      return NextResponse.json(
        { error: 'vacation_until must be a future ISO timestamp or null.' },
        { status: 400, headers: NO_STORE }
      );
    }
  }

  const { data, error } = await service
    .from('expert_applications')
    .update({ vacation_until: vacationUntil })
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .select('id');

  if (error) {
    console.error('[expert.vacation]', error.message);
    return NextResponse.json({ error: 'Could not update vacation.' }, { status: 500, headers: NO_STORE });
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: 'No approved expert application found.' },
      { status: 404, headers: NO_STORE }
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
