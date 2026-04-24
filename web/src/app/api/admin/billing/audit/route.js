// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/admin/billing/audit
//
// Round A (C-06) — /admin/subscriptions/page.tsx used to insert directly
// into `audit_log` from the authenticated client. Round A revokes that
// grant; this service-role endpoint preserves the existing fire-and-
// forget pattern used by the billing admin UI.
//
// Body: { action: string, target_type: string, target_id: string, metadata?: object }
// Auth: caller must hold admin.billing.audit (falls back to admin.billing.view).
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.billing.view');
  } catch (err) {
    if (err.status) {
      console.error('[admin.billing.audit.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const { action, target_type, target_id, metadata } = body || {};
  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }
  if (!target_type || typeof target_type !== 'string') {
    return NextResponse.json({ error: 'target_type required' }, { status: 400 });
  }
  if (!target_id || typeof target_id !== 'string') {
    return NextResponse.json({ error: 'target_id required' }, { status: 400 });
  }

  const service = createServiceClient();
  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action,
      target_type,
      target_id,
      metadata: metadata ?? null,
    });
  } catch {
    // best-effort — matches the admin UI's prior fire-and-forget semantics.
  }

  return NextResponse.json({ ok: true });
}
