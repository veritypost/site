// @migrated-to-permissions 2026-04-19
// @feature-verified kids_pair 2026-04-19
//
// POST /api/kids/generate-pair-code
//   Parent-auth-gated. Input: { kid_profile_id }.
//   Output: { code, expires_at }
//
// Delegates to the generate_kid_pair_code RPC (schema/095), which validates
// ownership and invalidates any other live codes for the same kid.

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  try {
    const supabase = await createClient();

    let user;
    try {
      user = await requireAuth();
    } catch (err) {
      {
      console.error('[kids.generate-pair-code.permission]', err?.message || err);
      return NextResponse.json({ error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err?.status || 401 });
    }
    }

    // Rate-limit: 10 codes per minute per authenticated parent (NOT per-IP,
    // so parents behind shared NAT don't compete with each other).
    const svc = createServiceClient();
    const rate = await checkRateLimit(svc, {
      key: `kids-generate:${user.id}`,
      policyKey: 'kids_generate_pair_code',
      max: 10,
      windowSec: 60,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many codes generated. Wait a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { kid_profile_id } = body || {};
    if (!kid_profile_id || typeof kid_profile_id !== 'string') {
      return NextResponse.json({ error: 'kid_profile_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('generate_kid_pair_code', {
      p_kid_profile_id: kid_profile_id,
    });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('not owned')) {
        return NextResponse.json({ error: 'Kid profile not owned by you' }, { status: 403 });
      }
      console.error('[kids-generate-pair-code]', error);
      return NextResponse.json(
        { error: 'Could not generate a pair code. Try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      code: data.code,
      expires_at: data.expires_at,
    });
  } catch (err) {
    // Never leak err.message to the client — it can include Postgres
    // detail strings, JWT internals, or third-party SDK error frames.
    console.error('[kids-generate-pair-code] outer', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
