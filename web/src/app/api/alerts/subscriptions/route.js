// S5-T25 — per-category subscription management API.
//
// Backs the iOS AlertsView "manage subscriptions" flag (currently false
// pending this surface). subscription_topics is the per-category
// attachment; the existing alert_preferences table stays as the per-
// alert-type channel/frequency toggle. Both feed into the publish-time
// fan-out trigger (S1 owns) which writes notifications rows; the send-
// push and send-emails crons honor alert_preferences for delivery.
//
// Contract:
//   GET  /api/alerts/subscriptions
//        → 200 { subscriptions: [{ category_id, category_slug,
//                                  category_name, created_at }] }
//        → 401 { error } | 503 when the schema isn't deployed yet.
//
//   POST /api/alerts/subscriptions   body { category_id }
//        → 200 { subscription: { category_id, created_at } }   (idempotent)
//        → 400 { error: 'invalid_category' }
//        → 401 / 429 / 503 (schema not deployed)
//
//   DELETE /api/alerts/subscriptions  body { category_id }
//        → 200 { ok: true }   (idempotent)
//        → 401 / 429 / 503
//
// Rate limits: GET 60/min, POST 30/min, DELETE 30/min — keyed per user.
//
// Dependency on S1: this surface requires the public.subscription_topics
// table and (for fan-out) the publish-time trigger on articles. Until
// S1 applies the migration, every method returns 503 with reason
// 'subscriptions_unavailable'. We test for the table via a dedicated
// .from() probe and translate the PostgREST 'relation does not exist'
// error code (PGRST205 / 42P01) into the 503 — never 500. That keeps
// the route safe to ship pre-S1 and live the moment the table lands.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function tableMissing(error) {
  if (!error) return false;
  // PostgREST surfaces a missing relation as PGRST205 ("relation does
  // not exist") or, depending on the version, PGRST202; pg's own code
  // is 42P01. Match all three so this is robust to PostgREST upgrades.
  if (error.code === '42P01') return true;
  if (typeof error.code === 'string' && error.code.startsWith('PGRST')) {
    return /does not exist/i.test(error.message || '');
  }
  return /relation .*subscription_topics.* does not exist/i.test(error.message || '');
}

function unavailable() {
  return NextResponse.json(
    { error: 'subscriptions_unavailable' },
    { status: 503, headers: NO_STORE }
  );
}

async function authed() {
  const user = await requireAuth();
  return user;
}

export async function GET() {
  let user;
  try {
    user = await authed();
  } catch (err) {
    if (err.status) {
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `alerts-subs:get:${user.id}`,
    policyKey: 'alerts_subs_get',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { data, error } = await service
    .from('subscription_topics')
    .select('category_id, created_at, categories(slug, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    if (tableMissing(error)) return unavailable();
    console.error('[alerts.subscriptions.GET]', error);
    return NextResponse.json(
      { error: 'Could not load subscriptions' },
      { status: 500, headers: NO_STORE }
    );
  }

  const subscriptions = (data || []).map((row) => ({
    category_id: row.category_id,
    category_slug: row.categories?.slug ?? null,
    category_name: row.categories?.name ?? null,
    created_at: row.created_at,
  }));
  return NextResponse.json({ subscriptions }, { headers: NO_STORE });
}

export async function POST(request) {
  let user;
  try {
    user = await authed();
  } catch (err) {
    if (err.status) {
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `alerts-subs:write:${user.id}`,
    policyKey: 'alerts_subs_write',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { category_id } = await request.json().catch(() => ({}));
  if (!category_id || typeof category_id !== 'string') {
    return NextResponse.json(
      { error: 'category_id required' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Validate the category exists + is_active. Avoids piping garbage
  // into subscription_topics; an FK on the table would catch it but
  // the explicit 400 + 'invalid_category' is a cleaner client signal.
  const { data: cat, error: catErr } = await service
    .from('categories')
    .select('id, is_active, deleted_at')
    .eq('id', category_id)
    .maybeSingle();
  if (catErr) {
    console.error('[alerts.subscriptions.POST.category]', catErr);
    return NextResponse.json(
      { error: 'Could not validate category' },
      { status: 500, headers: NO_STORE }
    );
  }
  if (!cat || !cat.is_active || cat.deleted_at) {
    return NextResponse.json(
      { error: 'invalid_category' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Idempotent UPSERT. The PK on subscription_topics is (user_id,
  // category_id); ON CONFLICT DO NOTHING keeps the original created_at
  // so a re-subscribe doesn't bump the timestamp. We then re-select to
  // return a stable row.
  const { error: insertErr } = await service
    .from('subscription_topics')
    .upsert(
      { user_id: user.id, category_id },
      { onConflict: 'user_id,category_id', ignoreDuplicates: true }
    );
  if (insertErr) {
    if (tableMissing(insertErr)) return unavailable();
    console.error('[alerts.subscriptions.POST.upsert]', insertErr);
    return NextResponse.json(
      { error: 'Could not save subscription' },
      { status: 500, headers: NO_STORE }
    );
  }

  const { data: row, error: rowErr } = await service
    .from('subscription_topics')
    .select('category_id, created_at')
    .eq('user_id', user.id)
    .eq('category_id', category_id)
    .maybeSingle();
  if (rowErr || !row) {
    if (rowErr && tableMissing(rowErr)) return unavailable();
    return NextResponse.json(
      { subscription: { category_id, created_at: null } },
      { headers: NO_STORE }
    );
  }
  return NextResponse.json({ subscription: row }, { headers: NO_STORE });
}

export async function DELETE(request) {
  let user;
  try {
    user = await authed();
  } catch (err) {
    if (err.status) {
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `alerts-subs:write:${user.id}`,
    policyKey: 'alerts_subs_write',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { category_id } = await request.json().catch(() => ({}));
  if (!category_id || typeof category_id !== 'string') {
    return NextResponse.json(
      { error: 'category_id required' },
      { status: 400, headers: NO_STORE }
    );
  }

  const { error } = await service
    .from('subscription_topics')
    .delete()
    .eq('user_id', user.id)
    .eq('category_id', category_id);
  if (error) {
    if (tableMissing(error)) return unavailable();
    console.error('[alerts.subscriptions.DELETE]', error);
    return NextResponse.json(
      { error: 'Could not unsubscribe' },
      { status: 500, headers: NO_STORE }
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
