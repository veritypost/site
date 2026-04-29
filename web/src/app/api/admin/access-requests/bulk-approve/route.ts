// Admin: bulk-approve access_requests.
//
// POST { ids: string[], cohort_source?: string, cohort_medium?: string }
// Reuses admin.access_requests.approve permission key (locked decision).
// Processes serially (not parallel) to avoid thundering-herd on Resend and
// rate-limit counters. Returns partial-success aggregate.
//
// MAX_BULK = 15 — keeps worst-case latency under Vercel's 60 s default.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { renderTemplate, sendEmail } from '@/lib/email';
import { APPROVAL_TEMPLATE, buildApprovalVars } from '@/lib/betaApprovalEmail';
import { getSiteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BULK = 15;
const DEFAULT_EXPIRY_DAYS = 7;

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.access_requests.approve');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.access_request.bulk_approve:${actor.id}`,
    policyKey: 'admin.access_request.approve',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = await request.json().catch(
    () => ({} as { ids?: unknown; cohort_source?: string; cohort_medium?: string })
  );
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids: string[] = rawIds
    .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, MAX_BULK);

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids required (max 15)' }, { status: 400 });
  }

  const cohortSource = typeof body.cohort_source === 'string'
    ? body.cohort_source.trim().slice(0, 64) : null;
  const cohortMedium = typeof body.cohort_medium === 'string'
    ? body.cohort_medium.trim().slice(0, 64) : null;

  const siteUrl = getSiteUrl();
  const expiresAtIso = new Date(
    Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const results = {
    approved_count: 0,
    failed_ids: [] as string[],
    email_failed_ids: [] as string[],
  };

  for (const id of ids) {
    try {
      // Fetch the request row.
      const { data: req } = await service
        .from('access_requests')
        .select('id, email, name, status, access_code_id')
        .eq('id', id)
        .maybeSingle();

      if (!req) { results.failed_ids.push(id); continue; }
      if (req.status === 'approved' && req.access_code_id) {
        // Already approved — count as success, skip.
        results.approved_count++;
        continue;
      }
      if (req.status !== 'pending') { results.failed_ids.push(id); continue; }

      // Mint owner-tier link.
      const { data: minted, error: mintErr } = await service.rpc('mint_owner_referral_link', {
        p_actor_user_id: actor.id,
        p_description: `Beta bulk-approval for ${req.email}`,
        p_max_uses: 1,
        p_expires_at: expiresAtIso,
      });
      if (mintErr || !Array.isArray(minted) || minted.length === 0) {
        console.error('[bulk-approve] mint failed for', id, mintErr?.message);
        results.failed_ids.push(id);
        continue;
      }
      const { id: codeId, code } = minted[0] as { id: string; code: string };
      const inviteUrl = `${siteUrl}/r/${code}`;

      // Stamp cohort tags on the minted code.
      if (cohortSource || cohortMedium) {
        await service.from('access_codes').update({
          ...(cohortSource ? { cohort_source: cohortSource } : {}),
          ...(cohortMedium ? { cohort_medium: cohortMedium } : {}),
        }).eq('id', codeId);
      }

      // Send approval email.
      let emailId: string | null = null;
      try {
        const tpl = renderTemplate(
          APPROVAL_TEMPLATE,
          buildApprovalVars({
            name: req.name || '',
            invite_url: inviteUrl,
            expires_at: new Date(expiresAtIso).toLocaleDateString(undefined, {
              year: 'numeric', month: 'long', day: 'numeric',
            }),
          })
        );
        const result = await sendEmail({
          to: req.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          fromName: tpl.fromName,
          fromEmail: tpl.fromEmail,
          replyTo: undefined,
          unsubscribeUrl: undefined,
        });
        emailId = (result as { id?: string })?.id || null;
      } catch (e) {
        console.error('[bulk-approve] sendEmail failed for', id, e);
        results.email_failed_ids.push(id);
        // Continue — still mark approved even if email failed.
      }

      // Mark approved.
      const { error: updErr } = await service.from('access_requests').update({
        status: 'approved',
        approved_by: actor.id,
        approved_at: new Date().toISOString(),
        access_code_id: codeId,
        metadata: { approval_email_id: emailId, invite_url: inviteUrl },
        ...(cohortSource ? { referral_source: cohortSource } : {}),
        ...(cohortMedium ? { referral_medium: cohortMedium } : {}),
        ...(emailId ? { invite_sent_at: new Date().toISOString() } : {}),
      }).eq('id', id);

      if (updErr) {
        console.error('[bulk-approve] update failed for', id, updErr.message);
        results.failed_ids.push(id);
        continue;
      }

      try {
        await recordAdminAction({
          action: 'access_request.bulk_approve',
          targetTable: 'access_requests',
          targetId: id,
          newValue: {
            status: 'approved',
            access_code_id: codeId,
            email: req.email,
            email_sent: !!emailId,
          },
        });
      } catch {
        // Audit failure is non-fatal — code is minted, email sent.
      }

      results.approved_count++;
    } catch (err) {
      console.error('[bulk-approve] unexpected error for', id, err);
      results.failed_ids.push(id);
    }
  }

  return NextResponse.json({
    ok: true,
    approved_count: results.approved_count,
    failed_ids: results.failed_ids,
    email_failed_ids: results.email_failed_ids,
  });
}
