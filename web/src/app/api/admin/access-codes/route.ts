import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, withDestructiveAction, recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';
import { generateWordCode } from '@/lib/wordCode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  code?: string;
  description?: string | null;
  grants_plan_id?: string | null;
  grants_role_id?: string | null;
  max_uses?: number | null;
  expires_at?: string | null;
  is_active?: boolean;
};

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.access_codes.create');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.access_codes.mutate:${actor.id}`,
    policyKey: 'admin.access_codes.mutate',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;

  const rawCode = typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';
  const code = rawCode || generateWordCode();

  const maxUses = body.max_uses === undefined || body.max_uses === null
    ? null
    : Number(body.max_uses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 0)) {
    return NextResponse.json(
      { error: 'max_uses must be a non-negative integer or null' },
      { status: 400 }
    );
  }

  const row = {
    code,
    description: typeof body.description === 'string' ? body.description.trim() || null : null,
    type: 'referral' as const,
    tier: 'owner' as const,
    owner_user_id: actor.id,
    grants_plan_id: body.grants_plan_id || null,
    grants_role_id: body.grants_role_id || null,
    max_uses: maxUses,
    expires_at: (() => {
      if (typeof body.expires_at !== 'string' || !body.expires_at) return null;
      const d = new Date(body.expires_at);
      if (Number.isNaN(d.getTime())) return undefined;
      return d.toISOString();
    })(),
    is_active: body.is_active !== false,
  };

  if (row.expires_at === undefined) {
    return NextResponse.json({ error: 'expires_at is not a valid date' }, { status: 400 });
  }

  if (row.grants_role_id) {
    const { data: targetRole } = await service
      .from('roles').select('hierarchy_level').eq('id', row.grants_role_id).single();
    if (!targetRole) {
      return NextResponse.json({ error: 'grants_role_id does not exist' }, { status: 400 });
    }
    const { data: actorRoles } = await service
      .from('user_roles').select('roles!fk_user_roles_role_id(hierarchy_level)').eq('user_id', actor.id);
    const actorMaxLevel = (actorRoles ?? []).reduce((max, r) => {
      const rel = (r as { roles: { hierarchy_level: number } | { hierarchy_level: number }[] | null }).roles;
      const lvl = Array.isArray(rel) ? (rel[0]?.hierarchy_level ?? 0) : (rel?.hierarchy_level ?? 0);
      return lvl > max ? lvl : max;
    }, 0);
    if ((targetRole as { hierarchy_level: number }).hierarchy_level >= actorMaxLevel) {
      return NextResponse.json(
        { error: 'Cannot mint a code that grants a role at or above your own rank' },
        { status: 403 }
      );
    }
  }

  const data = await withDestructiveAction(
    async () => await service.from('access_codes').insert(row).select().single(),
    async (res) => {
      if (res.error || !res.data) return;
      await recordAdminAction({
        action: 'access_code.create',
        targetTable: 'access_codes',
        targetId: (res.data as { id: string }).id,
        newValue: { code: (res.data as { code: string }).code },
      });
    }
  );

  if (data.error) {
    return safeErrorResponse(NextResponse, data.error, {
      route: 'admin.access_codes.create',
      fallbackStatus: 400,
    });
  }

  return NextResponse.json({ ok: true, data: data.data });
}
