// Ext-M8 — public password policy endpoint.
//
// Returns the current password rules from the settings table so signup,
// reset-password, and profile/settings forms can render the same
// requirements list the server validates against. No auth required —
// the values are not sensitive and need to be available before the user
// is signed in (signup form mounts pre-auth).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSettings, getNumber, isEnabled } from '@/lib/settings';
import { PASSWORD_MIN_LENGTH } from '@/lib/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const service = createServiceClient();
    const settings = await getSettings(service);

    const minLength = getNumber(settings, 'password.min_length', PASSWORD_MIN_LENGTH);
    const requireUpper = isEnabled(settings, 'password.require_upper', true);
    const requireNumber = isEnabled(settings, 'password.require_number', true);
    const requireSpecial = isEnabled(settings, 'password.require_special', false);

    // Cache for 5 minutes at the edge — password policy changes are rare
    // enough that a stale read is acceptable, and this endpoint sees
    // every signup mount.
    return NextResponse.json(
      {
        min_length: minLength,
        require_upper: requireUpper,
        require_number: requireNumber,
        require_special: requireSpecial,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300',
        },
      }
    );
  } catch (err) {
    // Fall back to defaults on any DB hiccup so the form still renders.
    console.error('[password-policy] settings fetch failed; serving defaults:', err);
    return NextResponse.json({
      min_length: PASSWORD_MIN_LENGTH,
      require_upper: true,
      require_number: true,
      require_special: false,
    });
  }
}
