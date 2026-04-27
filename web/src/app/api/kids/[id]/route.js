// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

async function ownKid(service, userId, kidId) {
  // Only treat kids that are is_active=true as owned. Soft-deleted
  // (is_active=false) rows must not be PATCHable or re-DELETE-able.
  const { data } = await service
    .from('kid_profiles')
    .select('id, parent_user_id, is_active')
    .eq('id', kidId)
    .maybeSingle();
  if (!data || data.parent_user_id !== userId || data.is_active === false) return null;
  return data;
}

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requirePermission('kids.profile.update');
  } catch (err) {
    {
      console.error('[kids.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
  }

  const service = createServiceClient();
  if (!(await ownKid(service, user.id, params.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const b = await request.json().catch(() => ({}));
  // Phase 2 of AI + Plan Change Implementation: date_of_birth is locked
  // post-creation. Corrections route through the request form (Phase 4
  // builds /api/kids/[id]/dob-correction). DOB stays editable only via
  // the admin RPC `admin_apply_dob_correction` which sets a session var
  // to bypass the immutability trigger.
  const allowed = ['display_name', 'avatar_color', 'max_daily_minutes', 'reading_level'];
  const update = {};
  for (const k of allowed) if (b[k] !== undefined) update[k] = b[k];
  // If a client still posts date_of_birth, return a clear 400 instead of
  // silently dropping the field.
  if (b.date_of_birth !== undefined) {
    return NextResponse.json(
      {
        error:
          'date_of_birth is locked after profile creation. Submit a correction request if you entered the wrong date.',
        code: 'dob_locked',
      },
      { status: 400 }
    );
  }
  if (b.paused !== undefined) {
    update.paused_at = b.paused ? new Date().toISOString() : null;
  }
  if (b.global_leaderboard_opt_in !== undefined) {
    update.global_leaderboard_opt_in = !!b.global_leaderboard_opt_in;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await service.from('kid_profiles').update(update).eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'kids.id', fallbackStatus: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  let user;
  try {
    user = await requirePermission('kids.profile.delete');
  } catch (err) {
    {
      console.error('[kids.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
  }

  // Require explicit ?confirm=1 so an accidental DELETE fetch can't wipe a
  // kid profile. Client passes confirm=1 after the user OKs the modal.
  const url = new URL(request.url);
  if (url.searchParams.get('confirm') !== '1') {
    return NextResponse.json({ error: 'Confirmation required' }, { status: 400 });
  }

  const service = createServiceClient();
  if (!(await ownKid(service, user.id, params.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Soft-delete: flip is_active so reading history, streaks, and achievements
  // are preserved. A later cron can hard-purge after a retention window.
  const { error } = await service
    .from('kid_profiles')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) {
    console.error('[kids.delete]', error);
    return NextResponse.json({ error: 'Could not delete kid profile' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, soft_deleted: true });
}
