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
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

export async function POST(request) {
  try {
    const supabase = await createClient();

    let user;
    try { user = await requireAuth(); }
    catch (err) { return NextResponse.json({ error: err.message }, { status: err.status || 401 }); }

    let body;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const { kid_profile_id } = body || {};
    if (!kid_profile_id || typeof kid_profile_id !== 'string') {
      return NextResponse.json({ error: 'kid_profile_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .rpc('generate_kid_pair_code', { p_kid_profile_id: kid_profile_id });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('not owned')) {
        return NextResponse.json({ error: 'Kid profile not owned by you' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message || 'Could not generate code' }, { status: 500 });
    }

    return NextResponse.json({
      code: data.code,
      expires_at: data.expires_at,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
