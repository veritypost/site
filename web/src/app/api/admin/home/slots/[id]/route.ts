// PATCH — update a slot's display knobs (span / config). Slot kind
// stays immutable in v1 of the editor; changing kinds means changing
// what content the slot renders, which is rarely what an editor wants
// at runtime. Add a separate flow if/when needed.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_SPANS = [3, 4, 6, 8, 12] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try {
    actor = await requirePermission('admin.home.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.home.mutate:${actor.id}`,
    policyKey: 'admin.home.mutate',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be uuid' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    span?: unknown;
    config?: unknown;
  };

  const update: { span?: number; config?: never } = {};
  if (body.span !== undefined) {
    if (
      typeof body.span !== 'number' ||
      !(ALLOWED_SPANS as readonly number[]).includes(body.span)
    ) {
      return NextResponse.json(
        { error: `span must be one of ${ALLOWED_SPANS.join(', ')}` },
        { status: 400 },
      );
    }
    update.span = body.span;
  }
  if (body.config !== undefined) {
    if (
      !body.config ||
      typeof body.config !== 'object' ||
      Array.isArray(body.config)
    ) {
      return NextResponse.json({ error: 'config must be an object' }, { status: 400 });
    }
    // Validate config.capacity if present: positive integer, 1..30.
    // Other config keys (label, numbered, timestamps, …) pass through
    // unchecked — the renderers tolerate missing/unexpected values.
    // 30 is the hard cap mirrored in the admin UI stepper and in the
    // public slot renderers.
    const cfg = body.config as Record<string, unknown>;
    if (cfg.capacity !== undefined) {
      const cap = cfg.capacity;
      if (
        typeof cap !== 'number' ||
        !Number.isInteger(cap) ||
        cap < 1 ||
        cap > 30
      ) {
        return NextResponse.json(
          { error: 'config.capacity must be an integer between 1 and 30' },
          { status: 400 },
        );
      }
    }
    update.config = body.config as never;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { error } = await service.from('home_slots').update(update).eq('id', id);
  if (error) {
    console.error('[admin.home.slots.patch]', error.message);
    return NextResponse.json({ error: 'Could not update slot' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'home.slot.update',
    targetTable: 'home_slots',
    targetId: id,
    newValue: update,
  });

  return NextResponse.json({ ok: true });
}
