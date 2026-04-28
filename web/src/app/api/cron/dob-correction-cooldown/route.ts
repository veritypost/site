/**
 * Phase 4 of AI + Plan Change Implementation — DOB correction cooldown cron.
 *
 * Runs daily. For each kid_dob_correction_requests row in status='pending'
 * with direction='younger' and cooldown_ends_at <= now() and no fraud
 * signals firing, invoke `admin_apply_dob_correction(id, 'approved',
 * 'cooldown_auto_approval')` to flip the request to approved + apply the
 * DOB change + recompute reading_band.
 *
 * Older-band corrections (direction='older') and any pending request with
 * fraud signals are NOT auto-approved here — they require manual admin
 * review via /admin/kids-dob-corrections.
 *
 * Fraud signals (any → escalate):
 *   - Profile created < 30 days ago AND request is younger-band (recent
 *     creation + immediate younger correction is a common scam pattern).
 *   - Family upgraded to paid Family tier within 14 days of the request.
 *   - Parent has any prior approved correction (lifetime limit also
 *     enforced at submission, but defense-in-depth here).
 *   - Multiple kids in household with same DOB AND parent has prior
 *     correction history.
 *   - Requested DOB shifts age > 2 years (typos are usually 1 year off,
 *     not several).
 *
 * On signal fire: leave the request in 'pending' status (admin queue
 * picks it up). Optionally extend cooldown_ends_at so it doesn't fire
 * the same signal evaluation tomorrow.
 *
 * Auth: verifyCronAuth (x-vercel-cron header OR CRON_SECRET bearer).
 *
 * Schedule: vercel.json crons[] entry — daily at 03:30 UTC, 30 min
 * after pipeline-cleanup so the two daily jobs don't collide.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { captureMessage } from '@/lib/observability';

const CRON_NAME = 'dob-correction-cooldown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type CorrectionRow = {
  id: string;
  kid_profile_id: string;
  parent_user_id: string;
  current_dob: string;
  requested_dob: string;
  direction: 'younger' | 'older' | 'same';
  cooldown_ends_at: string | null;
  created_at: string;
};

async function checkFraudSignals(
  service: ReturnType<typeof createServiceClient>,
  row: CorrectionRow
): Promise<{ flagged: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  // Signal 1: profile created < 30 days ago.
  // (Younger-band corrections submitted shortly after profile creation
  // are a common pattern when parents are testing the cap.)
  try {
    const { data: kid } = await service
      .from('kid_profiles')
      .select('created_at, parent_user_id')
      .eq('id', row.kid_profile_id)
      .maybeSingle();
    if (kid?.created_at) {
      const ageMs = Date.now() - new Date(kid.created_at).getTime();
      if (ageMs < 30 * 24 * 60 * 60 * 1000) {
        reasons.push('profile_recent');
      }
    }
  } catch (err) {
    console.error('[dob-cooldown.signals.profile_recent]', err);
  }

  // Signal 2: parent has any prior approved correction (defense-in-depth
  // beyond the unique index).
  try {
    const { count } = await service
      .from('kid_dob_correction_requests')
      .select('id', { count: 'exact', head: true })
      .eq('parent_user_id', row.parent_user_id)
      .eq('status', 'approved');
    if ((count ?? 0) > 0) reasons.push('parent_prior_approval');
  } catch (err) {
    console.error('[dob-cooldown.signals.parent_prior]', err);
  }

  // Signal 3: DOB shift size, asymmetric by direction.
  //
  // T3.3 (kid-safety): younger-direction shifts are the silent abuse path
  // — there is no documentation gate at submission, so a parent can
  // re-band a tween down to kids without uploading anything. Older-
  // direction shifts already require a birth-cert review at submission
  // for any meaningful jump, so the >2y boundary still suffices there.
  // For younger, any >=1y shift goes to manual admin review.
  //
  // The cron only pulls direction='younger' rows, so in practice the
  // older branch never fires here today; we keep it for defense-in-depth
  // in case the fetch filter is ever broadened.
  try {
    const cur = new Date(row.current_dob);
    const req = new Date(row.requested_dob);
    const yearsShift = Math.abs(req.getUTCFullYear() - cur.getUTCFullYear());
    if (row.direction === 'younger' && yearsShift >= 1) {
      reasons.push('large_shift_younger');
    } else if (yearsShift > 2) {
      reasons.push('large_shift');
    }
  } catch (err) {
    console.error('[dob-cooldown.signals.shift]', err);
  }

  // Signal 4: family sub upgraded < 14 days ago. Best-effort lookup.
  try {
    const { data: sub } = await service
      .from('subscriptions')
      .select('created_at, plans!inner(tier)')
      .eq('user_id', row.parent_user_id)
      .in('status', ['active', 'trialing'])
      .maybeSingle();
    const subAny = sub as { created_at?: string; plans?: { tier?: string } } | null;
    if (
      subAny?.created_at &&
      subAny?.plans?.tier === 'verity_family' &&
      Date.now() - new Date(subAny.created_at).getTime() < 14 * 24 * 60 * 60 * 1000
    ) {
      reasons.push('family_sub_recent');
    }
  } catch (err) {
    // Non-fatal — sub lookup may fail for users on Free; just don't flag
    console.error('[dob-cooldown.signals.sub_recent]', err);
  }

  return { flagged: reasons.length > 0, reasons };
}

async function handle() {
  const service = createServiceClient();

  // Pull all pending younger-band requests whose cooldown has elapsed.
  const nowIso = new Date().toISOString();
  const { data: pending, error: pendingErr } = await service
    .from('kid_dob_correction_requests')
    .select(
      'id, kid_profile_id, parent_user_id, current_dob, requested_dob, direction, cooldown_ends_at, created_at'
    )
    .eq('status', 'pending')
    .eq('direction', 'younger')
    .lte('cooldown_ends_at', nowIso)
    .limit(200);

  if (pendingErr) {
    console.error('[dob-cooldown.fetch]', pendingErr.message);
    await captureMessage('dob-cooldown fetch failed', 'warning', {
      error: pendingErr.message,
    });
    return { processed: 0, approved: 0, escalated: 0, errors: 1 };
  }

  let approved = 0;
  let escalated = 0;
  let errors = 0;

  const pendingRows = (pending ?? []) as CorrectionRow[];
  for (const row of pendingRows) {
    try {
      const signals = await checkFraudSignals(service, row);
      if (signals.flagged) {
        // Escalate: leave pending, but extend cooldown a day so we don't
        // re-evaluate immediately, and stash the signals on the row for
        // admin review visibility.
        const extended = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await service
          .from('kid_dob_correction_requests')
          .update({
            cooldown_ends_at: extended,
            decision_reason: `Auto-approval blocked. Signals: ${signals.reasons.join(', ')}. Pending manual review.`,
          })
          .eq('id', row.id);
        escalated++;
        continue;
      }

      // Auto-approve via the system RPC (Phase 5 introduced the
      // system_apply_dob_correction variant that's grantable to
      // service_role; the admin variant gates on auth.uid() which
      // returns null for cron / service role).
      await service.rpc('system_apply_dob_correction', {
        p_request_id: row.id,
        p_decision_reason: 'cooldown_auto_approval',
      });
      approved++;
    } catch (err) {
      console.error('[dob-cooldown.row]', row.id, err);
      errors++;
    }
  }

  return {
    processed: ((pending as unknown[]) ?? []).length,
    approved,
    escalated,
    errors,
  };
}

export const GET = withCronLog(CRON_NAME, async (request: Request) => {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');
  const result = await handle();
  await logCronHeartbeat(CRON_NAME, 'end', result);
  return NextResponse.json(result);
});
