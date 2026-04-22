// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/data-requests/[id]/reject
// Rejects a data request. Status moves to 'rejected'; reason is appended
// to notes with admin id + timestamp. Does NOT mark identity verified,
// so the export cron will never pick the row up.
//
// F-093: `notes` is rendered in the admin dashboard; a prior reviewer
// could have planted HTML in their rejection reason that fired in the
// next admin's browser. Escape the stored text before concatenation.
function escapeForNote(raw) {
  return String(raw)
    .slice(0, 2000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.users.data_requests.process');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { rejection_reason } = await request.json().catch(() => ({}));
  if (!rejection_reason || !String(rejection_reason).trim()) {
    return NextResponse.json({ error: 'rejection_reason required' }, { status: 400 });
  }
  const trimmed = String(rejection_reason).trim();
  if (trimmed.length > 2000) {
    return NextResponse.json(
      { error: 'rejection_reason too long (max 2000 chars)' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await service
    .from('data_requests')
    .update({
      status: 'rejected',
      notes: `Rejected by admin ${user.id} at ${now}: ${escapeForNote(trimmed)}`,
      processed_by: user.id,
      updated_at: now,
    })
    .eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin/data-requests/reject',
      fallbackStatus: 400,
    });

  // T-023 — GDPR-touching action; needs audit trail.
  try {
    await service.from('audit_log').insert({
      actor_id: user.id,
      actor_type: 'user',
      action: 'data_request.reject',
      target_type: 'data_request',
      target_id: params.id,
      metadata: { reason: trimmed.slice(0, 200) },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
