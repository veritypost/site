import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { PERM_DIRECTORY_EXPERT_DEPTH } from '@/lib/directory/permissions';
import type { ExpertCoverageResponse } from '@/lib/directory/types';

export const dynamic = 'force-dynamic';

// GET /api/directory/expert-coverage?story_id=<uuid>
//
// Premium reveal — UNLIKE /api/directory/articles which silently degrades,
// this endpoint throws 403 when the caller lacks directory.expert_depth.
// The client uses the 403 to swap the tooltip body for a paywall card.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const storyId = url.searchParams.get('story_id');
  if (!storyId) {
    return NextResponse.json({ error: 'story_id is required' }, { status: 400 });
  }

  const allowed = await hasPermissionServer(PERM_DIRECTORY_EXPERT_DEPTH);
  if (!allowed) {
    return NextResponse.json(
      { error: 'PERMISSION_DENIED:directory.expert_depth' },
      { status: 403 },
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('story_follows')
    .select(
      `user_id,
       users!inner(id, display_name, avatar_url, is_expert, expert_title, followers_count)`,
    )
    .eq('story_id', storyId)
    .eq('users.is_expert', true)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    user_id: string;
    users: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      is_expert: boolean | null;
      expert_title: string | null;
      followers_count: number | null;
    } | null;
  };

  const seen = new Set<string>();
  const experts = ((data || []) as Row[])
    .filter((r) => r.users && !seen.has(r.user_id) && seen.add(r.user_id))
    .map((r) => ({
      user_id: r.user_id,
      display_name: r.users!.display_name,
      avatar_url: r.users!.avatar_url,
      expert_title: r.users!.expert_title,
      follow_count: r.users!.followers_count,
    }));

  const body: ExpertCoverageResponse = {
    experts,
    total: experts.length,
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
