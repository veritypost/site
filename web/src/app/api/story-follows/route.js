// Owner cleanup item 12 (2026-05-08) — story-level Follow.
// One row per (user, story) in `story_follows`. Existence drives the
// Following list; `last_seen_at` vs the story's newest article drives
// the unread dot. Notifications + Realtime fan out from the
// `articles_fanout_story_follow_notifications` trigger on articles INSERT.
//
// POST /api/story-follows — toggle follow (idempotent). Body: { story_id }.
//   Resp: 200 { following: boolean, follow_id: uuid|null } | 401/403 | 429
//
// GET /api/story-follows — list the caller's follows joined to `stories`,
//   each row decorated with `unread: boolean` (true iff the story has an
//   article with published_at > follow.last_seen_at). Most-recently-followed
//   first.
//   Resp: 200 { rows: [{ story: { id, slug, title, lifecycle_status,
//                                  published_at },
//                        last_seen_at,
//                        latest_article: { id, slug, title, published_at } | null,
//                        unread: boolean }] }
//
// DELETE /api/story-follows?story_id=… — explicit unfollow (alternative to
//   POST toggle). Convenience for callers that want a non-toggling shape.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request) {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: err?.status === 401 ? 401 : 401, headers: NO_STORE }
    );
  }

  const { story_id } = await request.json().catch(() => ({}));
  if (!story_id || typeof story_id !== 'string') {
    return NextResponse.json(
      { error: 'story_id required' },
      { status: 400, headers: NO_STORE }
    );
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `story-follows:${user.id}`,
    policyKey: 'story-follows',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) },
      }
    );
  }

  const { data, error } = await service.rpc('toggle_story_follow', {
    p_story_id: story_id,
  });
  if (error) {
    console.error('[story-follows.POST]', error);
    return NextResponse.json(
      { error: 'Could not toggle follow' },
      { status: 400, headers: NO_STORE }
    );
  }
  // RPC returns a single-row result set; normalize.
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json(
    {
      following: !!row?.following,
      follow_id: row?.follow_id ?? null,
    },
    { headers: NO_STORE }
  );
}

export async function GET(_request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401, headers: NO_STORE }
    );
  }

  const service = createServiceClient();

  // 1) Pull the user's follows + the joined story row.
  const { data: follows, error: followsErr } = await service
    .from('story_follows')
    .select(
      'story_id, last_seen_at, stories(id, slug, title, lifecycle_status, published_at)'
    )
    .eq('user_id', user.id)
    .order('followed_at', { ascending: false });
  if (followsErr) {
    console.error('[story-follows.GET]', followsErr);
    return NextResponse.json(
      { error: 'Could not load follows' },
      { status: 500, headers: NO_STORE }
    );
  }

  const followed = (follows || []).filter(
    (r) => r.stories && r.stories.id && r.story_id
  );
  const storyIds = followed.map((r) => r.story_id);

  // 2) For each story, find the most-recent published article. One bulk
  //    query covers all of them — Supabase doesn't have per-row aggregates
  //    in the JS client, so we fetch published articles for these stories
  //    ordered desc and reduce client-side.
  let latestByStory = new Map();
  if (storyIds.length > 0) {
    const { data: articles } = await service
      .from('articles')
      .select('id, story_id, title, published_at')
      .in('story_id', storyIds)
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(storyIds.length * 5); // generous; first row per story is what we need
    for (const a of articles || []) {
      if (!latestByStory.has(a.story_id)) latestByStory.set(a.story_id, a);
    }
  }

  // 3) Stitch together. unread = latest article's published_at >
  //    follow.last_seen_at (for stories that have any published article).
  const rows = followed.map((r) => {
    const latest = latestByStory.get(r.story_id) || null;
    const lastSeenMs = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
    const latestMs = latest?.published_at
      ? new Date(latest.published_at).getTime()
      : 0;
    return {
      story: r.stories,
      last_seen_at: r.last_seen_at,
      latest_article: latest
        ? {
            id: latest.id,
            title: latest.title,
            published_at: latest.published_at,
          }
        : null,
      unread: latestMs > lastSeenMs,
    };
  });

  return NextResponse.json({ rows }, { headers: NO_STORE });
}

// PATCH /api/story-follows — mark a followed story as seen (clears the
// unread dot). Body: { story_id }. No-op if not following.
export async function PATCH(request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401, headers: NO_STORE }
    );
  }
  const { story_id } = await request.json().catch(() => ({}));
  if (!story_id || typeof story_id !== 'string') {
    return NextResponse.json(
      { error: 'story_id required' },
      { status: 400, headers: NO_STORE }
    );
  }
  const service = createServiceClient();
  const { error } = await service
    .from('story_follows')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('story_id', story_id);
  if (error) {
    console.error('[story-follows.PATCH]', error);
    return NextResponse.json(
      { error: 'Could not mark seen' },
      { status: 400, headers: NO_STORE }
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401, headers: NO_STORE }
    );
  }
  const { searchParams } = new URL(request.url);
  const storyId = searchParams.get('story_id');
  if (!storyId) {
    return NextResponse.json(
      { error: 'story_id required' },
      { status: 400, headers: NO_STORE }
    );
  }

  const service = createServiceClient();
  const { error } = await service
    .from('story_follows')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);
  if (error) {
    console.error('[story-follows.DELETE]', error);
    return NextResponse.json(
      { error: 'Could not unfollow' },
      { status: 400, headers: NO_STORE }
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
