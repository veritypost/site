// T-005 — server route for admin/features create.
// Replaces direct `supabase.from('feature_flags').upsert(...)` from the client.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { KEY_SLUG_RE, KEY_SLUG_ERROR } from '@/lib/adminValidation';

type CreateBody = {
  key?: string;
  display_name?: string;
  description?: string | null;
  is_enabled?: boolean;
  rollout_percentage?: number;
  is_killswitch?: boolean;
  expires_at?: string | null;
  target_platforms?: unknown;
  target_min_app_version?: unknown;
  target_max_app_version?: unknown;
  target_min_os_version?: unknown;
  target_user_ids?: unknown;
  target_plan_tiers?: unknown;
  target_countries?: unknown;
  target_cohort_ids?: unknown;
  conditions?: unknown;
  variant?: unknown;
};

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.features.create');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.features.create:${actor.id}`,
    policyKey: 'admin.features.create',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key || !KEY_SLUG_RE.test(key)) {
    return NextResponse.json({ error: KEY_SLUG_ERROR }, { status: 400 });
  }
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!displayName) return NextResponse.json({ error: 'display_name required' }, { status: 400 });
  const rollout = Number(body.rollout_percentage ?? 0);
  if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100) {
    return NextResponse.json({ error: 'rollout_percentage must be 0–100' }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    key,
    display_name: displayName,
    description: typeof body.description === 'string' ? body.description || null : null,
    is_enabled: !!body.is_enabled,
    rollout_percentage: rollout,
    is_killswitch: !!body.is_killswitch,
    expires_at: body.expires_at || null,
  };
  for (const f of [
    'target_platforms',
    'target_min_app_version',
    'target_max_app_version',
    'target_min_os_version',
    'target_user_ids',
    'target_plan_tiers',
    'target_countries',
    'target_cohort_ids',
    'conditions',
    'variant',
  ] as const) {
    const v = body[f];
    if (v !== undefined && v !== null) row[f] = v;
  }

  const { data, error } = await service
    .from('feature_flags')
    // @ts-expect-error — runtime accepts upsert with partial shape.
    .upsert(row, { onConflict: 'key' })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[admin.features.create]', error?.message || 'no row');
    return NextResponse.json({ error: 'Could not create flag' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'feature.create',
    targetTable: 'feature_flags',
    targetId: data.id,
    newValue: { key: data.key, display_name: data.display_name, is_enabled: data.is_enabled },
  });

  return NextResponse.json({ ok: true, row: data });
}
