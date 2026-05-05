// EXPERT_THREADS Wave 4a — GET /api/expert/threads-config
//
// Tiny read-only endpoint that exposes a single boolean to the client:
// `features.expert_threads_enabled`. Used by ExpertProfileSection to
// decide whether to render the "settings will take effect when launched"
// notice. Settings persist regardless of the flag — this is a UI hint
// only (the spec calls for "Mention threads are not yet active for users
// — these settings will take effect when launched.").
//
// Auth: bearer/cookie required (gated behind the same surface that gates
// the Expert profile section). No PII; the only field is the kill switch.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isExpertThreadsEnabled } from '@/lib/expertConfig';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET() {
  const supabase = createClient();
  try {
    await requireAuth(supabase);
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  const enabled = await isExpertThreadsEnabled();
  return NextResponse.json({ expert_threads_enabled: enabled }, { headers: NO_STORE });
}
