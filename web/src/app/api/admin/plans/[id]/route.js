// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

// PATCH /api/admin/plans/[id]   — update a plan row
//
// Round A (C-05) — authenticated UPDATE on plans is revoked. The admin
// plans UI patches pricing / visibility / copy via this endpoint.
const ALLOWED_FIELDS = new Set([
  'price_cents',
  'billing_period',
  'trial_days',
  'is_visible',
  'sort_order',
  'description',
  'display_name',
  'name',
  'is_active',
]);

export async function PATCH(request, { params }) {
  let actor;
  try {
    actor = await requirePermission('admin.plans.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.plans.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'plan id required' }, { status: 400 });

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.plans.update:${actor.id}`,
    policyKey: 'admin.plans.update',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const patch = {};
  for (const k of Object.keys(body || {})) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = body[k];
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'no updatable fields in body' }, { status: 400 });
  }

  const { error } = await service.from('plans').update(patch).eq('id', id);
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.plans.id', fallbackStatus: 400 });

  await recordAdminAction({
    action: 'plan.update',
    targetTable: 'plan',
    targetId: id,
    newValue: patch,
  });

  return NextResponse.json({ ok: true });
}
