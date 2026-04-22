// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/appeals — user files an appeal on one of their warnings.
// Body: { warning_id, text }
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('settings.appeals.open');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const service = createServiceClient();

  // Rate-limit: 10 appeal submissions per hour per user.
  const rate = await checkRateLimit(service, {
    key: `appeals:${user.id}`,
    policyKey: 'appeals',
    max: 10,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many appeals. Try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  const { warning_id, text } = await request.json().catch(() => ({}));
  if (!warning_id || !text)
    return NextResponse.json({ error: 'warning_id and text required' }, { status: 400 });
  const { error } = await service.rpc('submit_appeal', {
    p_user_id: user.id,
    p_warning_id: warning_id,
    p_text: text,
  });
  if (error) {
    console.error('[appeals.post]', error);
    return NextResponse.json({ error: 'Could not submit appeal' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
