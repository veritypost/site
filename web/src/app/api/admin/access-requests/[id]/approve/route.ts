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

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.access_requests.approve');
  } catch (err) {
    return permissionError(err);
  }

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

  // Mint owner-tier link (one-time, 7-day default expiry).
  const expiresAtIso = new Date(
    Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: minted, error: mintErr } = await service.rpc('mint_owner_referral_link', {
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

  // Mark approved + bind code + stamp invite_sent_at if email succeeded.
  const updatePayload: TableUpdate<'access_requests'> = {
    status: 'approved',
    approved_by: actor.id,
    approved_at: new Date().toISOString(),
    access_code_id: codeId,
    metadata: { approval_email_id: emailId, invite_url: inviteUrl },
  };
  if (emailId) updatePayload.invite_sent_at = new Date().toISOString();

  const { error: updErr } = await service
    .from('access_requests')
    .update(updatePayload)
    .eq('id', id);
  if (updErr) {
    console.error('[admin.access_request.approve] update failed:', updErr.message);
    return NextResponse.json({ error: 'Approve marked but DB update failed' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'access_request.approve',
    targetTable: 'access_requests',
    targetId: id,
    newValue: {
      status: 'approved',
      access_code_id: codeId,
      email: req.email,
      email_sent: !!emailId,
    },
  });

  return NextResponse.json({
    ok: true,
    access_code_id: codeId,
    code,
    invite_url: inviteUrl,
    email_sent: !!emailId,
  });
}
