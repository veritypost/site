// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/apns';

// Admin-only ad-hoc push send. Use for testing token delivery or
// administrative one-off messages. For user-facing broadcasts, create a
// notification row (e.g. via send_breaking_news) — the send-push cron
// dispatches it automatically.
//
// Body: { user_id, title, body?, action_url?, metadata? }
// Returns: { delivered, failed, invalidated, attempted }

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    await requirePermission('admin.push.send_test');
  } catch (err) {
    if (err.status) {
      console.error('[push.send.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { user_id, title, body: text, action_url, metadata } = body || {};
  if (!user_id || !title) {
    return NextResponse.json({ error: 'user_id + title required' }, { status: 400 });
  }

  if (!process.env.APNS_AUTH_KEY) {
    return NextResponse.json({ error: 'APNS_AUTH_KEY not configured' }, { status: 503 });
  }

  const service = createServiceClient();
  try {
    const result = await sendPushToUser(service, user_id, {
      title,
      body: text,
      url: action_url,
      metadata,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    {
      console.error('[push.send.error]', err?.message || err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
}
