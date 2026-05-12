// Admin: approve an access_requests row.
// Mints a 1-use, 7-day owner-tier referral link via mint_owner_referral_link,
// sends the user an approval email with the link, marks the request approved,
// and binds access_code_id for audit trail.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { renderTemplate, sendEmail } from '@/lib/email';
import { APPROVAL_TEMPLATE, buildApprovalVars } from '@/lib/betaApprovalEmail';
import { getSiteUrl } from '@/lib/siteUrl';
import type { TableUpdate } from '@/types/database-helpers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_EXPIRY_DAYS = 7;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.access_requests.approve');
  } catch (err) {
    return permissionError(err);
  }

  // Capture operator-attested reason + optional cohort tags for the audit trail.
  const body = await request.json().catch(
    () => ({} as { reason?: string; cohort_source?: string; cohort_medium?: string })
  );
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const cohortSource = typeof body.cohort_source === 'string' ? body.cohort_source.trim().slice(0, 64) : null;
  const cohortMedium = typeof body.cohort_medium === 'string' ? body.cohort_medium.trim().slice(0, 64) : null;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.access_request.approve:${actor.id}`,
    policyKey: 'admin.access_request.approve',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.windowSec ?? 60) },
      }
    );
  }

  const { data: req } = await service
    .from('access_requests')
    .select('id, email, name, status, access_code_id')
    .eq('id', id)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (req.status === 'approved' && req.access_code_id) {
    return NextResponse.json(
      { error: 'Already approved', access_code_id: req.access_code_id },
      { status: 409 }
    );
  }

  // Look up an existing user for this email. If the user is already
  // signed up (common after iOS launches open), we silently mark the
  // row consumed and skip the invite email — sending "you're in!" to
  // someone who's already in is confusing and erodes trust.
  const lcEmail = req.email.toLowerCase();
  const { data: existingUser } = await service
    .from('users')
    .select('id, created_at')
    .ilike('email', lcEmail)
    .maybeSingle();
  const existingUserSource: string | null = await (async () => {
    if (!existingUser) return null;
    try {
      const { data: authUser } = await service.auth.admin.getUserById(existingUser.id);
      const raw = (authUser?.user?.user_metadata as Record<string, unknown> | null)?.signup_source;
      if (typeof raw === 'string' && (raw === 'ios' || raw === 'kids' || raw === 'web')) {
        return raw;
      }
    } catch {}
    return 'web';
  })();

  // Mint owner-tier link (one-time, 7-day default expiry).
  const expiresAtIso = new Date(
    Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  // Pass the admin's id explicitly via p_actor_user_id so the function
  // doesn't need auth.uid().
  const { data: minted, error: mintErr } = await service.rpc('mint_owner_referral_link', {
    p_actor_user_id: actor.id,
    p_description: `Beta approval for ${req.email}`,
    p_max_uses: 1,
    p_expires_at: expiresAtIso,
  });
  if (mintErr || !Array.isArray(minted) || minted.length === 0) {
    console.error('[admin.access_request.approve] mint failed:', mintErr?.message);
    return NextResponse.json({ error: 'Could not mint invite link' }, { status: 500 });
  }
  const { id: codeId, code } = minted[0] as { id: string; code: string };
  const inviteUrl = `${getSiteUrl()}/r/${code}`;

  // Send approval email. Template renderer HTML-escapes substitutions.
  const tpl = renderTemplate(
    APPROVAL_TEMPLATE,
    buildApprovalVars({
      name: req.name || '',
      invite_url: inviteUrl,
      expires_at: new Date(expiresAtIso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    })
  );

  let emailId: string | null = null;
  if (!existingUser) {
    try {
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
      // Email failure is recoverable — admin can re-trigger from the queue.
      // Still mark approved + bind code so the request doesn't stay pending.
      console.error('[admin.access_request.approve] sendEmail failed:', e);
    }
  }

  // Stamp cohort tags on the minted code if provided.
  if (cohortSource || cohortMedium) {
    await service
      .from('access_codes')
      .update({
        ...(cohortSource ? { cohort_source: cohortSource } : {}),
        ...(cohortMedium ? { cohort_medium: cohortMedium } : {}),
      })
      .eq('id', codeId);
  }

  // Mark approved + bind code + stamp invite_sent_at if email succeeded.
  // BugList #4: also stamp metadata.email_status so the admin UI can
  // surface a "Resend invite" button on rows where the initial email
  // attempt failed (was previously only inferable via the absence of
  // invite_sent_at).
  const approvedAtIso = new Date().toISOString();
  const updatePayload: TableUpdate<'access_requests'> = {
    status: 'approved',
    approved_by: actor.id,
    approved_at: approvedAtIso,
    access_code_id: codeId,
    metadata: {
      approval_email_id: emailId,
      invite_url: inviteUrl,
      email_status: existingUser
        ? 'skipped_already_user'
        : (emailId ? 'sent' : 'failed'),
      email_last_attempt_at: new Date().toISOString(),
    },
    ...(cohortSource ? { referral_source: cohortSource } : {}),
    ...(cohortMedium ? { referral_medium: cohortMedium } : {}),
  };
  if (emailId) updatePayload.invite_sent_at = new Date().toISOString();
  // Same UPDATE stamps the row consumed when the user already exists, so
  // it moves straight to the Consumed bucket instead of sitting in
  // Outstanding for an action that's already done.
  if (existingUser) {
    updatePayload.consumed_at = existingUser.created_at || approvedAtIso;
    updatePayload.consumed_by_user_id = existingUser.id;
    updatePayload.consumption_source = (existingUserSource as 'web' | 'ios' | 'kids' | null) || 'web';
  }

  const { error: updErr } = await service
    .from('access_requests')
    .update(updatePayload)
    .eq('id', id);
  if (updErr) {
    console.error('[admin.access_request.approve] update failed:', updErr.message);
    return NextResponse.json({ error: 'Approve marked but DB update failed' }, { status: 500 });
  }

  // Race-window mitigation. The initial existingUser query ran before
  // the row hit status='approved'. If a signup landed between that
  // query and this UPDATE, the signup's own consume_access_request RPC
  // saw status='pending' and no-op'd, which would leave an approved
  // unconsumed orphan. Re-query for a user now that the row is
  // approved and stamp via the RPC — idempotent: if the inline UPDATE
  // already stamped consumed_*, the RPC returns NULL.
  if (!existingUser) {
    try {
      const { data: lateUser } = await service
        .from('users')
        .select('id')
        .ilike('email', lcEmail)
        .maybeSingle();
      if (lateUser?.id) {
        let lateSource: 'web' | 'ios' | 'kids' = 'web';
        try {
          const { data: authUser } = await service.auth.admin.getUserById(lateUser.id);
          const raw = (authUser?.user?.user_metadata as Record<string, unknown> | null)?.signup_source;
          if (typeof raw === 'string' && (raw === 'ios' || raw === 'kids' || raw === 'web')) {
            lateSource = raw;
          }
        } catch {}
        const { error: rpcErr } = await service.rpc('consume_access_request', {
          p_email: req.email,
          p_user_id: lateUser.id,
          p_source: lateSource,
        });
        if (rpcErr) {
          console.error('[admin.access_request.approve] late consume_access_request failed:', rpcErr);
        }
      }
    } catch (e) {
      console.error('[admin.access_request.approve] race-mitigation lookup threw:', e);
    }
  }

  try {
    await recordAdminAction({
      action: 'access_request.approve',
      targetTable: 'access_requests',
      targetId: id,
      reason: reason || null,
      newValue: {
        status: 'approved',
        access_code_id: codeId,
        email: req.email,
        email_sent: !!emailId,
        already_signed_up: !!existingUser,
        consumed_by_user_id: existingUser?.id || null,
      },
    });
  } catch {
    // S6-A5: recordAdminAction already logged + attempted fallback. Do
    // NOT roll back the approval over an audit-write failure — the
    // credential is already minted and the email may already be sent.
  }

  return NextResponse.json({
    ok: true,
    access_code_id: codeId,
    code,
    invite_url: inviteUrl,
    email_sent: !!emailId,
  });
}
