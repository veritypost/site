// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { assertReportReason, isUrgentReason } from '@/lib/reportReasons';
import { captureMessage } from '@/lib/observability';
import { reportToNCMEC, ncmecConfigured } from '@/lib/ncmec';

// POST /api/comments/[id]/report
// Body: { reason, description? }
// D39: any verified user can report content.
//
// T278 — Urgent reasons (csam / child_exploitation / grooming) get
// special handling required by 18 U.S.C. § 2258A. They:
//   - bypass the per-target rate limit (a victim must not be silenced
//     by an attacker who pre-flooded their reports against the
//     suspect's account),
//   - are inserted with `is_escalated=true` + metadata.severity='urgent'
//     so admin queues sort them to the top,
//   - emit an `error`-level observability message so on-call sees them
//     even if no admin is logged in,
//   - attempt an NCMEC CyberTipline submission via `reportToNCMEC`
//     (currently a stub — see web/src/lib/ncmec.ts for the operator
//     checklist that has to clear before this wire is live).
//
// NCMEC fields the stub will need on go-live:
//   - URL of the offending content (we have it: /story/{slug}#c-{id})
//   - content excerpt (comments.body)
//   - suspect IP (comments.ip_address — populated by the comment route)
//   - suspect user_id (comments.user_id)
//   - time of upload (comments.created_at)
//   - time of report (now)
//   - reason code (the URGENT_REPORT_REASONS value)
//   - reporter user_id (auth.uid())
// See https://report.cybertipline.org/registration for the ESP
// onboarding flow that has to complete before the wire is flipped.
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('comments.report');
  } catch (err) {
    if (err.status) {
      console.error('[comments.[id].report.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comment_report:user:${user.id}`,
    policyKey: 'comment_report',
    max: 10,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 3600) } }
    );
  }

  const { reason, description } = await request.json().catch(() => ({}));
  if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 });
  try {
    assertReportReason(reason);
  } catch (err) {
    return NextResponse.json({ error: 'invalid reason' }, { status: err.status || 400 });
  }
  if (description && description.length > 1000) {
    console.error('[comments.id.report] input_too_long', {
      field: 'description',
      length: description.length,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Input too long' }, { status: 400 });
  }

  const urgent = isUrgentReason(reason);

  // T281 — per-reporter rate limit (above) caps total volume; this
  // second limit caps per-target so a reporter can't brigade the same
  // author by reporting their comments scattered across the site.
  // Lookup the comment's author first so we can key on target user.
  // T278 — also pull body / created_at / ip_address so an urgent report
  // can be handed to NCMEC with the fields § 2258A requires.
  const { data: targetComment, error: lookupErr } = await service
    .from('comments')
    .select('user_id, body, created_at, ip_address, article_id')
    .eq('id', params.id)
    .maybeSingle();
  if (lookupErr || !targetComment) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // T278 — urgent reasons bypass the per-target limit. A victim
  // reporting their own abuser shouldn't get 429'd because someone else
  // (or the attacker themselves) already filed three reports against
  // that account today.
  if (!urgent) {
    const targetRate = await checkRateLimit(service, {
      key: `report:reporter:${user.id}:target:${targetComment.user_id}`,
      policyKey: 'comment_report.target',
      max: 3,
      windowSec: 86400,
    });
    if (targetRate.limited) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(targetRate.windowSec ?? 86400) } }
      );
    }
  }

  const insertRow = {
    reporter_id: user.id,
    target_type: 'comment',
    target_id: params.id,
    reason,
    description: description || null,
  };
  if (urgent) {
    insertRow.is_escalated = true;
    insertRow.metadata = {
      severity: 'urgent',
      legal_basis: '18_usc_2258a',
      reason_code: reason,
    };
  }

  const { data, error } = await service.from('reports').insert(insertRow).select('id').single();
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.report',
      fallbackStatus: 400,
    });

  if (urgent) {
    // Best-effort observability page. Do not fail the request if Sentry
    // is unconfigured — the in-DB escalation flag is the durable signal.
    try {
      await captureMessage('urgent report submitted', 'error', {
        report_id: data.id,
        target_type: 'comment',
        target_id: params.id,
        reason,
        reporter_user_id: user.id,
        suspect_user_id: targetComment.user_id,
      });
    } catch (obsErr) {
      console.error('[comments.id.report] observability_failed', obsErr);
    }

    // NCMEC submission. Currently throws (stub) until the operator has
    // registered Verity Post as an ESP and added credentials. Keep the
    // throw silent so in-app reporting still succeeds — admin triage
    // off the is_escalated flag is the live path until then.
    if (ncmecConfigured()) {
      try {
        const result = await reportToNCMEC({
          reportId: data.id,
          targetType: 'comment',
          targetId: params.id,
          contentUrl: `/story/${targetComment.article_id}#c-${params.id}`,
          suspectUserId: targetComment.user_id || null,
          suspectIp: targetComment.ip_address || null,
          contentExcerpt: targetComment.body || null,
          contentCreatedAt: targetComment.created_at,
          reportedAt: new Date().toISOString(),
          reporterUserId: user.id,
          reasonCode: reason,
        });
        await service
          .from('reports')
          .update({
            metadata: {
              severity: 'urgent',
              legal_basis: '18_usc_2258a',
              reason_code: reason,
              ncmec: {
                report_number: result.reportNumber,
                submitted_at: result.submittedAt,
              },
            },
          })
          .eq('id', data.id);
      } catch (ncmecErr) {
        console.error('[comments.id.report] ncmec_submission_failed', ncmecErr);
        await captureMessage('NCMEC submission failed', 'error', {
          report_id: data.id,
          error: String(ncmecErr),
        });
      }
    }
  }

  return NextResponse.json({ id: data.id });
}
