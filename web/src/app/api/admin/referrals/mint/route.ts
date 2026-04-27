// Admin-only: mint an owner-tier referral link.
// Owner-tier links grant Pro immediately on signup (no email-verify wall).
// Use these for seed-user invitations sent personally.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { getSiteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  description?: string | null;
  max_uses?: number | null;
  expires_at?: string | null;
};

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.access.create');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.referrals.mint:${actor.id}`,
    policyKey: 'admin.referrals.mint',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  // Closed-beta defaults: owner-tier links are one-time-use and expire
  // after 7 days unless the admin explicitly overrides per mint. The
  // input contract treats `undefined` as "use default" and `null` as
  // "explicitly unset" (unlimited / never), so the admin form can pass
  // null when they want a multi-use or non-expiring link.
  const max_uses =
    body.max_uses === undefined ? 1 : body.max_uses === null ? null : Number(body.max_uses);
  if (max_uses !== null && (Number.isNaN(max_uses) || max_uses < 1)) {
    return NextResponse.json(
      { error: 'max_uses must be a positive integer or blank' },
      { status: 400 }
    );
  }

  const DEFAULT_EXPIRY_DAYS = 7;
  const expires_at =
    body.expires_at === undefined
      ? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : typeof body.expires_at === 'string' && body.expires_at
        ? new Date(body.expires_at).toISOString()
        : null;

  const { data, error } = await service.rpc('mint_owner_referral_link', {
    p_description: description || undefined,
    p_max_uses: max_uses ?? undefined,
    p_expires_at: expires_at ?? undefined,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    console.error('[admin.referrals.mint]', error?.message);
    return NextResponse.json({ error: 'Could not mint link' }, { status: 500 });
  }
  const minted = data[0] as { id: string; code: string };

  await recordAdminAction({
    action: 'referral.owner_mint',
    targetTable: 'access_codes',
    targetId: minted.id,
    newValue: { code: minted.code, max_uses, expires_at, description: description || null },
  });

  const siteUrl = getSiteUrl();
  return NextResponse.json({
    ok: true,
    id: minted.id,
    code: minted.code,
    url: `${siteUrl}/r/${minted.code}`,
  });
}
