// @migrated-to-permissions 2026-04-18
// @feature-verified reports 2026-04-18
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { checkRateLimit } from '@/lib/rateLimit';
import { assertReportReason, isUrgentReason } from '@/lib/reportReasons';
import { captureMessage } from '@/lib/observability';

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
    // T278 — Server-side enum validation. The article-level reports
    // route used to accept any string; now we lock it to the same
    // closed enum the comment route uses, which also rejects free-text
    // bypasses of the urgent / NCMEC code path.
    try {
      assertReportReason(reason);
    } catch (err) {
      return NextResponse.json({ error: 'invalid reason' }, { status: err.status || 400 });
    }
    if (description && description.length > 1000) {
      console.error('[reports] input_too_long', {
        field: 'description',
        length: description.length,
        userId: user.id,
      });
      return NextResponse.json({ error: 'Input too long' }, { status: 400 });
    }

    const urgent = isUrgentReason(reason);

    const insertRow = {
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      description: description || null,
    };
    if (urgent) {
      // T278 — Same urgent treatment as comment reports. NCMEC
      // submission for non-comment targets (article body, profile
      // banner, message attachment) lives in the moderator UI for now;
      // the in-DB escalation + observability page are the durable
      // signals admins triage on. See web/src/lib/ncmec.ts for the
      // full operator checklist.
      insertRow.is_escalated = true;
      insertRow.metadata = {
        severity: 'urgent',
        legal_basis: '18_usc_2258a',
        reason_code: reason,
      };
    }

    const { data: report, error: insertError } = await supabase
      .from('reports')
      .insert(insertRow)
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: 'Could not file report' }, { status: 500 });
    }

    if (urgent) {
      try {
        await captureMessage('urgent report submitted', 'error', {
          report_id: report.id,
          target_type: targetType,
          target_id: targetId,
          reason,
          reporter_user_id: user.id,
        });
      } catch (obsErr) {
        console.error('[reports] observability_failed', obsErr);
      }
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

        // T277 — auto-hide is a system action, not an admin one. Use the
        // service client to write into `audit_log` directly with
        // `actor_id: null` so the trail records "system" rather than the
        // reporter who happened to cross the threshold. recordAdminAction
        // can't be used here: it's auth.uid()-scoped and writes to
        // admin_audit_log, which is the wrong table for system events.
        try {
          const service = createServiceClient();
          await service.from('audit_log').insert({
            actor_id: null,
            action: 'comment.auto_hide',
            target_type: 'comment',
            target_id: targetId,
            metadata: { threshold, report_count: count || 0 },
          });
        } catch (auditErr) {
          console.error('[reports] audit_log auto_hide insert failed:', auditErr);
        }
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
