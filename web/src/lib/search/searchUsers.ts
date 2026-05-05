import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { applyBlockFilter } from './applyBlockFilter';

// Shared user-search core used by:
//   - /api/comments/mention-search  (scope: 'mention')
//   - /api/messages/search          (scope: 'dm')
//
// Permission gating + rate limiting stay in the route handlers — this
// lib is pure data-access. Admin scope is intentionally NOT supported:
// adding it would be a privilege-escalation footgun and there is no
// caller for it today.
//
// Both scopes apply the privacy filter: users who have blocked the
// searcher are excluded from results. The block filter is implemented
// as a two-trip anti-join via `applyBlockFilter` — see that file's
// header for why.

export type SearchUserScope = 'mention' | 'dm';

export interface SearchUsersArgs {
  q: string;
  scope: SearchUserScope;
  viewerId: string;
  /** DM scope only. Ignored for mention scope. 'all' (or undefined) means no role filter. */
  roleFilter?: string;
  limit: number;
  supabase: SupabaseClient<Database>;
}

export interface MentionUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  is_verified_public_figure: boolean | null;
  is_expert: boolean | null;
}

export interface DmUser {
  id: string;
  username: string | null;
  avatar_color: string | null;
  verity_score: number | null;
  is_expert: boolean | null;
}

export interface SearchUsersResult {
  users: MentionUser[] | DmUser[];
}

export async function searchUsers(args: SearchUsersArgs): Promise<SearchUsersResult> {
  const { q, scope, viewerId, roleFilter, limit, supabase } = args;

  // Caller is expected to have already trimmed/sanitized `q` to match
  // its historical behavior (mention strips a leading `@`; DM strips
  // PostgREST delimiters + underscore wildcard). We do not re-sanitize
  // here so that each route's existing semantics are preserved
  // byte-for-byte.
  if (!q) return { users: [] };

  const blocked = await applyBlockFilter(viewerId, supabase);

  if (scope === 'mention') {
    let builder = supabase
      .from('users')
      .select(
        'id, username, display_name, avatar_url, avatar_color, is_verified_public_figure, is_expert'
      )
      .ilike('username', `${q}%`)
      .neq('id', viewerId)
      .limit(limit);

    if (blocked.size > 0) {
      // .not('id','in', `(uuid1,uuid2)`) — the parenthesized list form
      // is what PostgREST expects. Skipped entirely for empty sets
      // because passing `()` would be a syntax error and `[]` would
      // silently match nothing-or-everything depending on the client.
      builder = builder.not('id', 'in', `(${Array.from(blocked).join(',')})`);
    }

    const { data, error } = await builder;
    if (error) throw error;
    return { users: (data as MentionUser[]) || [] };
  }

  // scope === 'dm'
  let builder = supabase
    .from('users')
    .select('id, username, avatar_color, verity_score, is_expert, user_roles!inner(roles!inner(name))')
    .ilike('username', `%${q}%`)
    .neq('id', viewerId)
    .limit(limit);

  if (roleFilter && roleFilter !== 'all') {
    builder = builder.eq('user_roles.roles.name', roleFilter);
  }

  if (blocked.size > 0) {
    builder = builder.not('id', 'in', `(${Array.from(blocked).join(',')})`);
  }

  const { data, error } = await builder;
  if (error) throw error;

  // Drop the joined `user_roles` payload; the route's response shape
  // only exposes the user-flat fields.
  const users: DmUser[] = (data || []).map((u: any) => ({
    id: u.id,
    username: u.username,
    avatar_color: u.avatar_color,
    verity_score: u.verity_score,
    is_expert: u.is_expert,
  }));

  return { users };
}
