// @migrated-to-permissions 2026-04-22
// @apple-guideline-1.2 2026-04-22 — list endpoint for the iOS Settings →
// Blocked Accounts screen. Web reads `blocked_users` directly via RLS, but the
// iOS settings UI prefers a single REST call (avoids surfacing the join shape
// to the Swift decoder).
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[users.blocked.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    console.error('[users-blocked:GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `users-blocked-list:${user.id}`,
    policyKey: 'users_block',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { data, error } = await service
    .from('blocked_users')
    .select(
      'id, created_at, reason, blocked:users!fk_blocked_users_blocked_id(id, username, avatar_color)'
    )
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[users-blocked:GET]', error);
    return NextResponse.json({ error: 'Could not load blocks' }, { status: 500 });
  }

  // Flatten to the shape the iOS client expects: [{ id, blocked_id,
  // username, avatar_color, created_at }]. Keeps the Swift Decodable simple.
  const rows = (data || []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    reason: r.reason,
    blocked_id: r.blocked?.id ?? null,
    username: r.blocked?.username ?? null,
    avatar_color: r.blocked?.avatar_color ?? null,
  }));

  return NextResponse.json({ blocks: rows });
}
