// BugList #4 — Resend the approval email for a previously-approved
// access_request whose initial email send failed. Reuses the existing
// minted access_codes row (no double-mint), re-renders the approval
// template, and updates metadata.email_status so the admin UI can
// stop showing the resend button.
//
// Permission: admin.access_requests.approve — same key as the original
// approve route since this is a side action of the approve flow.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { renderTemplate, sendEmail } from '@/lib/email';
import { APPROVAL_TEMPLATE, buildApprovalVars } from '@/lib/betaApprovalEmail';
import { getSiteUrl } from '@/lib/siteUrl';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let actor: { id: string };
  try {
    actor = await requirePermission('admin.access_requests.approve');
  } catch (err) {
    return permissionError(err);
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.access_requests.resend:${actor.id}`,
    policyKey: 'admin.access_requests.resend',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // Fetch the approved request + its bound access_code.
  const { data: req, error: fetchErr } = await service
    .from('access_requests')
    .select('id, email, name, status, access_code_id, invite_sent_at, metadata')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr || !req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }
  if (req.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only approved requests can be resent', status: req.status },
      { status: 409 }
    );
  }
  if (req.invite_sent_at) {
    // Already sent successfully — refuse rather than risk a double-email.
    return NextResponse.json(
      { error: 'Invite already delivered', invite_sent_at: req.invite_sent_at },
      { status: 409 }
    );
  }
  if (!req.access_code_id) {
    return NextResponse.json(
      { error: 'No access_code bound — re-run the approve flow instead' },
      { status: 422 }
    );
  }

  // Look up the bound code to rebuild the invite URL + expiry.
  const { data: codeRow } = await service
    .from('access_codes')
    .select('code, expires_at')
    .eq('id', req.access_code_id)
    .maybeSingle();
  if (!codeRow) {
    return NextResponse.json(
      { error: 'Bound access_code is missing' },
      { status: 500 }
    );
  }

  const inviteUrl = `${getSiteUrl()}/r/${codeRow.code}`;
  const tpl = renderTemplate(
    APPROVAL_TEMPLATE,
    buildApprovalVars({
      name: req.name || '',
      invite_url: inviteUrl,
      expires_at: codeRow.expires_at
        ? new Date(codeRow.expires_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : '',
    })
  );

  let emailId: string | null = null;
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
    console.error('[admin.access_request.resend] sendEmail failed:', e);
    // Update metadata to mark resend attempt failed so the UI can
    // distinguish "we tried again and it still failed" from "never tried."
    const existingMeta = (req.metadata as Record<string, unknown> | null) || {};
    await service
      .from('access_requests')
      .update({
        metadata: {
          ...existingMeta,
          email_status: 'failed',
          email_last_attempt_at: new Date().toISOString(),
        },
      })
      .eq('id', id);
    return NextResponse.json({ error: 'Email send failed' }, { status: 502 });
  }

  // Email succeeded — stamp invite_sent_at + metadata.email_status='sent'.
  const existingMeta = (req.metadata as Record<string, unknown> | null) || {};
  const { error: updErr } = await service
    .from('access_requests')
    .update({
      invite_sent_at: new Date().toISOString(),
      metadata: {
        ...existingMeta,
        approval_email_id: emailId,
        email_status: 'sent',
        email_last_attempt_at: new Date().toISOString(),
      },
    })
    .eq('id', id);
  if (updErr) {
    console.error('[admin.access_request.resend] update failed:', updErr.message);
    return NextResponse.json(
      { error: 'Email sent but DB update failed' },
      { status: 500 }
    );
  }

  try {
    await recordAdminAction({
      action: 'access_request.resend_invite',
      targetTable: 'access_requests',
      targetId: id,
      newValue: { email: req.email, email_id: emailId },
    });
  } catch {
    // Audit failure is non-fatal — the email already went out.
  }

  return NextResponse.json({ ok: true, email_id: emailId });
}
