// @migrated-to-permissions 2026-04-18
// @feature-verified article_reading 2026-04-18
import { createClient, createClientFromToken, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { scoreReadingComplete, checkAchievements } from '@/lib/scoring';
import { assertKidOwnership } from '@/lib/kids';
import { incrementField } from '@/lib/counters';
import { v2LiveGuard } from '@/lib/featureFlags';

// Round 7 — iOS bearer callers reach this route (StoryDetailView.swift).
// Bind `supabase` to the bearer token when one is present so both the
// auth gate (requirePermission) AND the downstream reading_log
// insert/update (which is RLS-scoped on auth.uid() = user_id) resolve
// against the iOS session. Cookie callers keep the existing path.
function bearerToken(request) {
  const h = request.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

export async function POST(request) {
  try {
    const blocked = await v2LiveGuard();
    if (blocked) return blocked;
    const token = bearerToken(request);
    const supabase = token ? createClientFromToken(token) : await createClient();

    const user = await requirePermission('article.read.log', supabase);

    const body = await request.json();
    const { articleId, readPercentage = null, timeSpentSeconds, completed, kidProfileId } = body;

    if (!articleId) {
      return NextResponse.json({ error: 'articleId is required' }, { status: 400 });
    }

    if (kidProfileId) {
      await assertKidOwnership(kidProfileId, { client: supabase, userId: user.id });

      const { data: article } = await supabase
        .from('articles')
        .select('is_kids_safe')
        .eq('id', articleId)
        .maybeSingle();

      if (article && !article.is_kids_safe) {
        return NextResponse.json(
          { error: 'This article is not available for kid profiles' },
          { status: 403 }
        );
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const query = supabase
      .from('reading_log')
      .select('id, read_percentage, time_spent_seconds, completed')
      .eq('article_id', articleId)
      .gte('created_at', today + 'T00:00:00Z')
      .order('created_at', { ascending: false })
      .limit(1);

    if (kidProfileId) {
      query.eq('kid_profile_id', kidProfileId);
    } else {
      query.eq('user_id', user.id);
    }

    const { data: existing } = await query.maybeSingle();

    const service = createServiceClient();
    let scoring = null;

    if (existing) {
      const updates = {};
      if (readPercentage != null && readPercentage > (existing.read_percentage || 0)) {
        updates.read_percentage = readPercentage;
      }
      if (timeSpentSeconds && timeSpentSeconds > (existing.time_spent_seconds || 0)) {
        updates.time_spent_seconds = timeSpentSeconds;
      }
      if (completed && !existing.completed) {
        updates.completed = true;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('reading_log').update(updates).eq('id', existing.id);
      }

      let newAchievements = [];
      if (completed && !existing.completed) {
        await incrementField(service, 'articles', articleId, 'view_count', 1);
        scoring = await scoreReadingComplete(service, {
          userId: user.id,
          kidProfileId: kidProfileId || null,
          articleId,
          readingLogId: existing.id,
        });
        if (scoring?.error) {
          console.error('score_on_reading_complete failed', scoring.error);
          scoring = null;
        }
        newAchievements = await checkAchievements(service, { userId: user.id });
      }

      return NextResponse.json({ updated: true, id: existing.id, scoring, newAchievements });
    }

    const { data: entry, error: insertError } = await supabase
      .from('reading_log')
      .insert({
        user_id: user.id,
        article_id: articleId,
        kid_profile_id: kidProfileId || null,
        read_percentage: readPercentage || 0,
        time_spent_seconds: timeSpentSeconds || 0,
        completed: completed || false,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: 'Could not record read' }, { status: 500 });
    }

    let newAchievements = [];
    if (completed) {
      // Y2 / #67: incrementField expects positional args
      // (supabase, tableName, rowId, fieldName, amount) and the
      // underlying `increment_field` RPC has EXECUTE revoked from
      // `authenticated` (migration 056), so the call must run on the
      // service client. Prior (object-form + user client) silently
      // failed every increment for new reading_log rows.
      await incrementField(service, 'articles', articleId, 'view_count', 1);
      scoring = await scoreReadingComplete(service, {
        userId: user.id,
        kidProfileId: kidProfileId || null,
        articleId,
        readingLogId: entry.id,
      });
      if (scoring?.error) {
        console.error('score_on_reading_complete failed', scoring.error);
        scoring = null;
      }
      newAchievements = await checkAchievements(service, { userId: user.id });
    }

    return NextResponse.json({ created: true, id: entry.id, scoring, newAchievements });
  } catch (err) {
    if (err.status) {
      {
      console.error('[stories.read.permission]', err?.message || err);
      return NextResponse.json({ error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err?.status || 500 });
    }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
