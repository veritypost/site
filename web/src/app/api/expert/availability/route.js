// EXPERT_THREADS Wave 4a — POST /api/expert/availability
//
// Persists Pause + Quiet hours block from the Expert profile section.
// Calls the SECURITY DEFINER RPC `set_expert_availability` which itself
// asserts caller owns the application (or holds owner mode). The RPC also
// validates the day-array bounds [0,6].
//
// Wave 5 (iOS) — same endpoint also accepts the two iOS-EXCLUSIVE push
// opt-ins (notify_push_on_mention, notify_push_on_category_arrival). Both
// fields are optional; when present they're written via service-client
// UPDATE on the same expert_applications row (the RPC's signature stays
// unchanged so existing callers don't break). Web sends them as undefined
// and the row keeps its current values.
//
// Body: {
//   pause_until_indefinite: boolean,
//   vacation_until: string | null (ISO timestamp; null when "off" or "indefinite"),
//   quiet_hours_start: string | null ("HH:MM" or "HH:MM:SS"),
//   quiet_hours_end:   string | null,
//   quiet_hours_days:  number[] | null (0=Sun..6=Sat),
//   notify_push_on_mention?:           boolean (iOS only),
//   notify_push_on_category_arrival?:  boolean (iOS only)
// }
//
// Auth: bearer/cookie required. The RPC runs as auth.uid() so we use the
// caller-scoped Supabase client (cookies + bearer fallback handled by
// requireAuth/createClient pair).
//
// Kill-switch: settings persist regardless of `features.expert_threads_enabled`
// (per spec §10 Wave 4a — owner can pre-configure before launch).

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request) {
  // Caller-scoped client — set_expert_availability uses auth.uid() so the
  // RPC must see the user's JWT. Same client threads through requireAuth so
  // bearer tokens (iOS) and cookies (web) both resolve correctly.
  const supabase = createClient();
  let user;
  try {
    user = await requireAuth(supabase);
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  // Light per-user rate limit — guards against runaway client-side autosave.
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `expert.availability:${user.id}`,
    policyKey: 'expert_availability_save',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': '60', ...NO_STORE } }
    );
  }

  const b = await request.json().catch(() => ({}));

  // Resolve the caller's most recent expert application id. Mirrors the
  // existing vacation route's lookup pattern.
  const { data: appRows, error: appErr } = await service
    .from('expert_applications')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (appErr) {
    console.error('[expert.availability.lookup]', appErr.message);
    return NextResponse.json(
      { error: 'Could not load application.' },
      { status: 500, headers: NO_STORE }
    );
  }
  const appId = appRows?.[0]?.id;
  if (!appId) {
    return NextResponse.json(
      { error: 'No expert application found.' },
      { status: 404, headers: NO_STORE }
    );
  }

  // Input shape — convert nulls/strings into the exact types the RPC expects.
  const pauseIndef = b.pause_until_indefinite === true;
  const vacationUntil =
    typeof b.vacation_until === 'string' && b.vacation_until.length > 0
      ? b.vacation_until
      : null;

  if (vacationUntil !== null) {
    const ts = Date.parse(vacationUntil);
    if (isNaN(ts) || ts <= Date.now()) {
      return NextResponse.json(
        { error: 'vacation_until must be a future ISO timestamp or null.' },
        { status: 400, headers: NO_STORE }
      );
    }
  }

  // Off / indefinite / dated are mutually exclusive — reject the
  // ambiguous "indefinite + dated together" combo on the API edge.
  if (pauseIndef && vacationUntil !== null) {
    return NextResponse.json(
      { error: 'Pause cannot be both indefinite and dated.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const qhStart = normalizeTime(b.quiet_hours_start);
  const qhEnd = normalizeTime(b.quiet_hours_end);
  if (qhStart === undefined || qhEnd === undefined) {
    return NextResponse.json(
      { error: 'quiet_hours_start / _end must be "HH:MM" or null.' },
      { status: 400, headers: NO_STORE }
    );
  }
  // If either time is set, both must be set (otherwise the window is
  // undefined behaviour for `_is_in_quiet_hours`).
  if ((qhStart === null) !== (qhEnd === null)) {
    return NextResponse.json(
      { error: 'quiet_hours_start and quiet_hours_end must both be set or both null.' },
      { status: 400, headers: NO_STORE }
    );
  }

  let qhDays = null;
  if (Array.isArray(b.quiet_hours_days)) {
    if (
      b.quiet_hours_days.some(
        (d) => typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6
      )
    ) {
      return NextResponse.json(
        { error: 'quiet_hours_days entries must be integers in [0,6].' },
        { status: 400, headers: NO_STORE }
      );
    }
    qhDays = Array.from(new Set(b.quiet_hours_days)).sort((a, b) => a - b);
  } else if (b.quiet_hours_days !== null && b.quiet_hours_days !== undefined) {
    return NextResponse.json(
      { error: 'quiet_hours_days must be an array or null.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const { error: rpcErr } = await supabase.rpc('set_expert_availability', {
    p_expert_app_id: appId,
    p_pause_until_indefinite: pauseIndef,
    p_vacation_until: vacationUntil,
    p_qh_start: qhStart,
    p_qh_end: qhEnd,
    p_qh_days: qhDays,
  });

  if (rpcErr) {
    console.error('[expert.availability.rpc]', rpcErr?.message || rpcErr);
    return safeErrorResponse(NextResponse, rpcErr, {
      route: 'expert.availability',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  }

  // Wave 5 — iOS-EXCLUSIVE push opt-ins. Optional in the body; only update
  // when explicitly present (boolean). The RPC's signature is unchanged so
  // we write through the service client keyed on the resolved appId +
  // user_id (defense-in-depth — service role bypasses RLS, so we re-check
  // ownership in the WHERE clause).
  const pushPatch = {};
  if (typeof b.notify_push_on_mention === 'boolean') {
    pushPatch.notify_push_on_mention = b.notify_push_on_mention;
  }
  if (typeof b.notify_push_on_category_arrival === 'boolean') {
    pushPatch.notify_push_on_category_arrival = b.notify_push_on_category_arrival;
  }
  if (Object.keys(pushPatch).length > 0) {
    const { error: pushErr } = await service
      .from('expert_applications')
      .update(pushPatch)
      .eq('id', appId)
      .eq('user_id', user.id);
    if (pushErr) {
      console.error('[expert.availability.push_patch]', pushErr.message);
      // Pause/QH already persisted via RPC — surface the partial-failure
      // explicitly so the client can retry just the push fields.
      return NextResponse.json(
        { error: 'Could not save push preferences.' },
        { status: 500, headers: NO_STORE }
      );
    }
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

// Accept "HH:MM" or "HH:MM:SS"; pass through as "HH:MM:SS" for Postgres `time`.
// Returns:
//   string  — normalized time
//   null    — explicit null (caller cleared the field)
//   undefined — malformed input (caller will 400)
function normalizeTime(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] ? Number(m[3]) : 0;
  if (h > 23 || mm > 59 || ss > 59) return undefined;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(mm)}:${pad(ss)}`;
}
