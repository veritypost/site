// @migrated-to-permissions 2026-04-18
// @feature-verified messaging 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// Bug 82: DM search — single server round-trip with user_roles join so
// role-filtered searches return up to 20 real matches instead of filtering
// 20 random username matches in JS (which can paginate every role row off).
// Paid-only per D11; the page gate already blocks free users, this is belt.
export async function GET(request) {
  let user;
  try {
    user = await requirePermission('messages.search');
  } catch (err) {
    if (err.status) {
      console.error('[messages.search.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim();
  const roleFilter = url.searchParams.get('role') || 'all';
  if (!q) return NextResponse.json({ users: [] });

  const service = createServiceClient();

  // Strip PostgREST filter-delimiter chars so user input stays inside ilike.
  // F-088: also strip `_` — ilike treats underscore as a single-char
  // wildcard, so leaving it in lets users turn a search into a pattern
  // scan. Escaping would work too, but the search UX doesn't need
  // literal underscores to match (usernames are [a-z0-9] only).
  const safeQ = q.replace(/[,.%*()"\\_]/g, ' ').trim();
  if (!safeQ) return NextResponse.json({ users: [] });

  let builder = service
    .from('users')
    .select(
      'id, username, avatar_color, verity_score, is_expert, user_roles!inner(roles!inner(name))'
    )
    .ilike('username', `%${safeQ}%`)
    .neq('id', user.id)
    .limit(20);
  if (roleFilter !== 'all') {
    builder = builder.eq('user_roles.roles.name', roleFilter);
  }

  const { data, error } = await builder;
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'messages.search',
      fallbackStatus: 400,
    });

  return NextResponse.json({
    users: (data || []).map((u) => ({
      id: u.id,
      username: u.username,
      avatar_color: u.avatar_color,
      verity_score: u.verity_score,
      is_expert: u.is_expert,
    })),
  });
}
