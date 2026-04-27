/**
 * Phase 5 of AI + Plan Change Implementation — birthday band check cron.
 *
 * Runs daily. For each active kid_profiles row, computes age from DOB
 * and checks if a band-boundary has been crossed without the parent
 * advancing the band:
 *   - kids → tweens at age 10
 *   - tweens → graduated at age 13
 *
 * On boundary cross: stamp `kid_profiles.birthday_prompt_at = now()`.
 * The web/iOS family screens read this to render the "Time to advance
 * [name]" banner with the appropriate CTA.
 *
 * The cron does NOT auto-advance — band changes always require parent
 * confirmation per the Phase 5 spec.
 *
 * Auth: verifyCronAuth.
 * Schedule: daily at 03:00 UTC (vercel.json registration).
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { captureMessage } from '@/lib/observability';

const CRON_NAME = 'birthday-band-check';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function ageFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

type KidRow = {
  id: string;
  date_of_birth: string | null;
  reading_band: string | null;
  birthday_prompt_at: string | null;
  is_active: boolean | null;
};

async function handle() {
  const service = createServiceClient();

  // Pull active kids with DOB. Page through if you ever exceed 1000;
  // current scale is well under that.
  const { data, error } = await service
    .from('kid_profiles')
    .select('id, date_of_birth, reading_band, birthday_prompt_at, is_active')
    .eq('is_active', true)
    .not('date_of_birth', 'is', null)
    .limit(1000);
  if (error) {
    console.error('[birthday-band-check.fetch]', error.message);
    await captureMessage('birthday-band-check fetch failed', 'warning', {
      error: error.message,
    });
    return { processed: 0, prompted: 0, errors: 1 };
  }

  const rows = (data as unknown as KidRow[]) ?? [];
  let prompted = 0;

  for (const row of rows) {
    if (!row.date_of_birth) continue;
    const age = ageFromDob(new Date(row.date_of_birth));
    let needsPrompt = false;
    if (age >= 13 && row.reading_band !== 'graduated') {
      needsPrompt = true;
    } else if (age >= 10 && row.reading_band === 'kids') {
      needsPrompt = true;
    }

    if (needsPrompt && !row.birthday_prompt_at) {
      const { error: updErr } = await service
        .from('kid_profiles')
        .update({ birthday_prompt_at: new Date().toISOString() })
        .eq('id', row.id);
      if (!updErr) prompted++;
    }
  }

  return { processed: rows.length, prompted, errors: 0 };
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return withCronLog(CRON_NAME, async () => {
    const result = await handle();
    await logCronHeartbeat(CRON_NAME, result);
    return NextResponse.json(result);
  });
}
