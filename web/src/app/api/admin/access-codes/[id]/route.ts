import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, withDestructiveAction, recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body =
  | { field: 'active'; value: boolean }
  | { field: 'expiry'; value: string | null };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let actor;
  try {
    actor = await requirePermission('admin.access_codes.revoke');
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
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await service
    .from('access_codes')
    .select('id, code, is_active, expires_at')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (body.field === 'active') {
    const next = !!body.value;
    const cur = existing as { id: string; code: string; is_active: boolean };

    const result = await withDestructiveAction(
      async () =>
        await service
          .from('access_codes')
          .update({ is_active: next })
          .eq('id', id)
          .select()
          .single(),
      async (res) => {
        if (res.error) return;
        await recordAdminAction({
          action: 'access_code.toggle',
          targetTable: 'access_codes',
          targetId: id,
          oldValue: { is_active: cur.is_active, code: cur.code },
          newValue: { is_active: next, code: cur.code },
        });
      }
    );

    if (result.error) {
      return safeErrorResponse(NextResponse, result.error, {
        route: 'admin.access_codes.toggle',
        fallbackStatus: 500,
      });
    }
    return NextResponse.json({ ok: true, data: result.data });
  }

  if (body.field === 'expiry') {
    let iso: string | null = null;
    if (typeof body.value === 'string' && body.value) {
      const d = new Date(body.value);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'value is not a valid date' }, { status: 400 });
      }
      iso = d.toISOString();
    }
    const cur = existing as { id: string; expires_at: string | null };

    const result = await withDestructiveAction(
      async () =>
        await service
          .from('access_codes')
          .update({ expires_at: iso })
          .eq('id', id)
          .select()
          .single(),
      async (res) => {
        if (res.error) return;
        await recordAdminAction({
          action: 'access_code.update_expiry',
          targetTable: 'access_codes',
          targetId: id,
          oldValue: { expires_at: cur.expires_at },
          newValue: { expires_at: iso },
        });
      }
    );

    if (result.error) {
      return safeErrorResponse(NextResponse, result.error, {
        route: 'admin.access_codes.update_expiry',
        fallbackStatus: 500,
      });
    }
    return NextResponse.json({ ok: true, data: result.data });
  }

  return NextResponse.json(
    { error: 'field must be "active" or "expiry"' },
    { status: 400 }
  );
}
