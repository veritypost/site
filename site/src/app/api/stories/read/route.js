import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { scoreReadingComplete, checkAchievements } from '@/lib/scoring';
import { assertKidOwnership } from '@/lib/kids';
import { incrementField } from '@/lib/counters';
import { v2LiveGuard } from '@/lib/featureFlags';

export async function POST(request) {
  try {
    const blocked = await v2LiveGuard(); if (blocked) return blocked;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

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
        return NextResponse.json({ error: 'This article is not available for kid profiles' }, { status: 403 });
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
        if (scoring?.error) { console.error('score_on_reading_complete failed', scoring.error); scoring = null; }
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
      await incrementField(supabase, { table: 'articles', id: articleId, field: 'view_count', amount: 1 });
      scoring = await scoreReadingComplete(service, {
        userId: user.id,
        kidProfileId: kidProfileId || null,
        articleId,
        readingLogId: entry.id,
      });
      if (scoring?.error) { console.error('score_on_reading_complete failed', scoring.error); scoring = null; }
      newAchievements = await checkAchievements(service, { userId: user.id });
    }

    return NextResponse.json({ created: true, id: entry.id, scoring, newAchievements });
  } catch (err) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
