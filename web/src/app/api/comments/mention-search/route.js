import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { searchUsers } from '@/lib/search/searchUsers';
import { sanitizeIlikeTerm } from '@/lib/search/sanitize';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// GET /api/comments/mention-search?q=partial
// Returns up to 8 users whose username starts with q (case-insensitive).
// Gated on comments.mention.autocomplete. Used by the composer dropdown.
//
// Privacy: results exclude users who have blocked the searcher. The
// search core lives in @/lib/search/searchUsers; this handler stays a
// thin permission/rate-limit/error adapter.
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
  const raw = (searchParams.get('q') || '').trim().replace(/^@/, '');
  const q = sanitizeIlikeTerm(raw).trim();
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

  try {
    const { users } = await searchUsers({
      q,
      scope: 'mention',
      viewerId: user.id,
      limit: 8,
      supabase: service,
    });
    return NextResponse.json({ users }, { headers: NO_STORE });
  } catch (error) {
    console.error('[mention-search]', error);
    return NextResponse.json({ users: [] }, { headers: NO_STORE });
  }
}
