// PATCH /api/ads/impression/:id — update viewability fields on an existing impression.
// Body: { is_viewable: boolean, viewable_seconds: number, session_id?: string }
//
// Called client-side by Ad.jsx IntersectionObserver after 1+ second of 50%+
// visibility. Fire-and-forget; failures are logged but not surfaced to the user.
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;

  const { id } = params;
  if (!id || !UUID_RX.test(id)) {
    return NextResponse.json({ error: 'Invalid impression id' }, { status: 400 });
  }

  const b = await request.json().catch(() => ({}));
  const isViewable = typeof b.is_viewable === 'boolean' ? b.is_viewable : null;
  const viewableSecs =
    typeof b.viewable_seconds === 'number' && Number.isFinite(b.viewable_seconds)
      ? Math.max(0, Math.min(b.viewable_seconds, 3600)) // cap at 1h
      : null;
  const callerSessionId = typeof b.session_id === 'string' ? b.session_id : null;

  if (isViewable === null) {
    return NextResponse.json({ error: 'is_viewable required' }, { status: 400 });
  }

  // Ownership check — prevent any caller from patching impressions they don't own.
  // Fail closed (403) on any DB error so we don't accidentally allow writes.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const service = createServiceClient();

  try {
    const { data: impression, error: lookupErr } = await service
      .from('ad_impressions')
      .select('user_id, session_id')
      .eq('id', id)
      .maybeSingle();

    if (lookupErr || !impression) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (impression.user_id !== null) {
      // Authenticated impression — require the caller to be that user.
      if (!user || user.id !== impression.user_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      // Anon impression — require the caller to supply the matching session_id.
      if (!callerSessionId || callerSessionId !== impression.session_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  } catch {
    // Fail closed on unexpected errors.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const ip = await getClientIp();
  const rl = await checkRateLimit(service, {
    key: `ads_viewability:ip:${ip}`,
    policyKey: 'ads_impression',
    max: 300,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const updates = { is_viewable: isViewable };
  if (viewableSecs !== null) updates.viewable_seconds = viewableSecs;

  const { error } = await service
    .from('ad_impressions')
    .update(updates)
    .eq('id', id);

  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'ads/impression/[id]',
      fallbackStatus: 400,
    });
  }

  return NextResponse.json({ ok: true });
}
