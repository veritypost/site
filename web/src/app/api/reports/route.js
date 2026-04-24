// @migrated-to-permissions 2026-04-18
// @feature-verified reports 2026-04-18
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  try {
    const supabase = await createClient();
    const user = await requirePermission('article.report');

    // Auth'd users can flood reports → auto-hide at threshold. 10/hr per
    // user is comfortably above legitimate use while closing that vector.
    const rate = await checkRateLimit(supabase, {
      key: `reports:user:${user.id}`,
      policyKey: 'reports',
      max: 10,
      windowSec: 3600,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many reports. Try again in an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    const { targetType, targetId, reason, description } = await request.json();

    if (!targetType || !targetId || !reason) {
      return NextResponse.json(
        { error: 'targetType, targetId, and reason are required' },
        { status: 400 }
      );
    }

    const { data: report, error: insertError } = await supabase
      .from('reports')
      .insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reason,
        description: description || null,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: 'Could not file report' }, { status: 500 });
    }

    // Auto-hide comment if report count meets threshold
    if (targetType === 'comment') {
      const settings = await getSettings(supabase);
      const threshold = Number(settings?.report_autohide_threshold ?? 3);

      const { count } = await supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('target_type', 'comment')
        .eq('target_id', targetId);

      if ((count || 0) >= threshold) {
        await supabase.from('comments').update({ status: 'hidden' }).eq('id', targetId);
      }
    }

    return NextResponse.json({ report });
  } catch (err) {
    if (err.status) {
      {
        console.error('[reports.permission]', err?.message || err);
        return NextResponse.json(
          { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
          { status: err?.status || 500 }
        );
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
