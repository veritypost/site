// T-005 — server route for admin/subscriptions extend-grace action.
// Replaces direct `supabase.from('subscriptions').update({grace_period_ends_at})`.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

type Body = { days?: number };

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const subId = params?.id;
  if (!subId) return NextResponse.json({ error: 'subscription id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.billing.override_plan');
  } catch (err) {
    return permissionError(err);
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const days = Number(body.days);
  if (!Number.isFinite(days) || days <= 0 || days > 90) {
    return NextResponse.json({ error: 'days must be 1–90' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: sub } = await service
    .from('subscriptions')
    .select('id, user_id, grace_period_ends_at, status')
    .eq('id', subId)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: 'subscription not found' }, { status: 404 });

  if (sub.user_id) {
    const rankErr = await requireAdminOutranks(sub.user_id, actor.id);
    if (rankErr) return rankErr;
  }

  const base = sub.grace_period_ends_at ? new Date(sub.grace_period_ends_at) : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  const nextIso = next.toISOString();

  const { error } = await service
    .from('subscriptions')
    .update({ grace_period_ends_at: nextIso })
    .eq('id', subId);
  if (error) {
    console.error('[admin.subs.extend-grace]', error.message);
    return NextResponse.json({ error: 'Could not extend grace' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'subscription.extend_grace',
    targetTable: 'subscriptions',
    targetId: subId,
    oldValue: { grace_period_ends_at: sub.grace_period_ends_at },
    newValue: { grace_period_ends_at: nextIso, days },
  });

  return NextResponse.json({ ok: true, grace_period_ends_at: nextIso });
}
