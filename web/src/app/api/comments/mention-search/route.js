import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// GET /api/comments/mention-search?q=partial
// Returns up to 8 users whose username starts with q (case-insensitive).
// Gated on comments.mention.autocomplete. Used by the composer dropdown.
export async function GET(request) {
  let user;
  try {
    user = await requirePermission('comments.mention.autocomplete');
  } catch (err) {
    if (err.status) {
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().replace(/^@/, '');
  if (q.length === 0) {
    return NextResponse.json({ users: [] }, { headers: NO_STORE });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `mention-search:${user.id}`,
    policyKey: 'mention_search',
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
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_color, is_verified_public_figure, is_expert')
    .ilike('username', `${q}%`)
    .neq('id', user.id)
    .limit(8);

  if (error) {
    console.error('[mention-search]', error);
    return NextResponse.json({ users: [] }, { headers: NO_STORE });
  }

  return NextResponse.json({ users: data || [] }, { headers: NO_STORE });
}
