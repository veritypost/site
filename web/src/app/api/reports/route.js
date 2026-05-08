// @migrated-to-permissions 2026-04-18
// @feature-verified reports 2026-04-18
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { checkRateLimit } from '@/lib/rateLimit';
import { assertReportReason, isUrgentReason } from '@/lib/reportReasons';
import { captureMessage } from '@/lib/observability';
import { sendEmail } from '@/lib/email';

export async function POST(request) {
  try {
    const supabase = await createClient();
    const user = await requirePermission(['article.report', 'profile.report']);

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

    // Null-check first so every required field has a clear error message.
    if (!targetType || !targetId || !reason) {
      return NextResponse.json(
        { error: 'targetType, targetId, and reason are required' },
        { status: 400 }
      );
    }

    // Allowlist after null-check so targetType is guaranteed non-empty here.
    if (!['article', 'comment', 'user'].includes(targetType)) {
      return NextResponse.json({ error: 'Invalid target type' }, { status: 400 });
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
    if (description != null && typeof description !== 'string') {
      return NextResponse.json({ error: 'description must be a string' }, { status: 400 });
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

    // BugList #1 — atomic insert + threshold + auto-hide via RPC.
    // Without this, a count-then-update read in JS races against
    // concurrent reporters: two reporters can both observe count=N-1
    // and either both fire or both miss the auto-hide. The RPC takes
    // a row lock on the comment + recounts inside the same tx, so
    // the threshold check serializes correctly. Idempotent on the
    // UNIQUE(reporter_id, target_type, target_id) constraint —
    // re-submission returns already_filed=true.
    const { data: rpcRows, error: rpcErr } = await supabase.rpc('report_and_maybe_autohide', {
      p_reporter_id: user.id,
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason,
      p_description: description || null,
      p_is_escalated: !!urgent,
      p_metadata: insertRow.metadata,
    });
    if (rpcErr) {
      console.error('[reports] rpc failed', rpcErr.message);
      return NextResponse.json({ error: 'Could not file report' }, { status: 500 });
    }
    const rpcRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (rpcRow?.already_filed) {
      return NextResponse.json({ ok: true, alreadyReported: true }, { status: 200 });
    }
    const report = { id: rpcRow?.report_id };

    if (urgent) {
      // Track whether at least one escalation channel succeeded.
      // If none do, we mark the report so a sweep cron can retry.
      let escalationSucceeded = false;

      // Channel 1: Sentry / observability (when configured)
      try {
        await captureMessage('urgent report submitted', 'error', {
          report_id: report.id,
          target_type: targetType,
          target_id: targetId,
          reason,
          reporter_user_id: user.id,
        });
        escalationSucceeded = true;
      } catch (obsErr) {
        console.error('[reports] observability_failed', obsErr);
      }

      // Channel 2: admin_alerts table (always attempted, independent of Sentry).
      // Table created in migration 20260503000006. Uses service client so
      // the insert is not gated by reporter's RLS context.
      try {
        const service = createServiceClient();
        await service.from('admin_alerts').insert({
          alert_type: 'escalated_report',
          report_id: report.id,
          severity: 'critical',
          metadata: {
            target_type: targetType,
            target_id: targetId,
            reason,
            reporter_user_id: user.id,
            legal_basis: '18_usc_2258a',
          },
        });
        escalationSucceeded = true;
      } catch (alertErr) {
        console.error('[reports] admin_alerts_insert_failed', alertErr);
      }

      // Channel 3: email to ESCALATION_EMAIL (always attempted when configured).
      const escalationEmail = process.env.ESCALATION_EMAIL;
      if (escalationEmail) {
        try {
          await sendEmail({
            to: escalationEmail,
            subject: `URGENT: Escalated report — ${reason} (${targetType})`,
            html: `<p><strong>An urgent content report requires immediate human review.</strong></p>
<ul>
  <li>Report ID: ${report.id}</li>
  <li>Reason: ${reason}</li>
  <li>Target type: ${targetType}</li>
  <li>Target ID: ${targetId}</li>
  <li>Reporter: ${user.id}</li>
  <li>Legal basis: 18 U.S.C. § 2258A</li>
</ul>
<p>Review in the admin moderation queue immediately.</p>`,
            text: `URGENT: Escalated report\nReport ID: ${report.id}\nReason: ${reason}\nTarget: ${targetType}/${targetId}\nReporter: ${user.id}\nLegal basis: 18 U.S.C. § 2258A\n\nReview in admin moderation queue immediately.`,
            fromName: 'Verity Post Alerts',
            fromEmail: process.env.EMAIL_FROM || 'no-reply@veritypost.com',
          });
          escalationSucceeded = true;
        } catch (emailErr) {
          console.error('[reports] escalation_email_failed', emailErr);
        }
      }

      // Fail-safe: if ALL channels failed, mark the report for sweep cron.
      // Returns 200 (report is saved) but leaves a durable marker.
      if (!escalationSucceeded) {
        console.error('[reports] ALL_ESCALATION_CHANNELS_FAILED report_id:', report.id, '— urgent report requires manual review');
        try {
          const service = createServiceClient();
          await service
            .from('reports')
            .update({ metadata: { ...insertRow.metadata, escalation_failed: true, escalation_failed_at: new Date().toISOString() } })
            .eq('id', report.id);
        } catch (markErr) {
          // Best-effort — the base report row is already saved.
          console.error('[reports] escalation_mark_failed', markErr);
        }
      }
    }

    // Auto-hide is now atomic inside report_and_maybe_autohide RPC
    // above. The RPC writes audit_log itself when it fires.

    return NextResponse.json({ report, autoHid: !!rpcRow?.auto_hid });
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
