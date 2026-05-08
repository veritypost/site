// Admin: reject an access_requests row.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = { reason?: string | null };

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.access_requests.deny');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.access_request.reject:${actor.id}`,
    policyKey: 'admin.access_request.reject',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.windowSec ?? 60) },
      }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

  const { data: prior } = await service
    .from('access_requests')
    .select('id, email, status')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  // Idempotency / accidental-double-click guard. The approve route
  // returns 409 if the request is already approved (route.ts:63-68);
  // mirror that here so a network retry or a fast double-click can't
  // silently flip an already-decided request to rejected.
  if (prior.status === 'rejected') {
    return NextResponse.json(
      { error: 'Already rejected', status: prior.status },
      { status: 409 }
    );
  }
  if (prior.status === 'approved') {
    return NextResponse.json(
      { error: 'Cannot reject an already-approved request', status: prior.status },
      { status: 409 }
    );
  }

  const { error } = await service
    .from('access_requests')
    .update({
      status: 'rejected',
      metadata: reason ? { rejection_reason: reason } : {},
    })
    .eq('id', id);
  if (error) {
    console.error('[admin.access_request.reject]', error.message);
    return NextResponse.json({ error: 'Could not reject' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'access_request.reject',
    targetTable: 'access_requests',
    targetId: id,
    oldValue: { status: prior.status },
    newValue: { status: 'rejected', reason },
  });

  return NextResponse.json({ ok: true });
}
