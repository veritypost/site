// Q39 — Public settings endpoint for client-side config values.
//
// Returns comment threading limits from the settings table so
// CommentRow can honour the DB-configured max depth and length
// without a hardcoded constant. No auth required — the values
// are non-sensitive display config that the comment UI needs
// before the user is known.
//
// Pattern mirrors /api/settings/password-policy: service client,
// getSettings helper, CDN-cacheable response, defaults on error.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSettings, getNumber } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULTS = {
  comment_max_depth: 2,
  comment_max_length: 4000,
};

export async function GET() {
  try {
    const service = createServiceClient();
    const settings = await getSettings(service);

    const commentMaxDepth = getNumber(settings, 'comment_max_depth', DEFAULTS.comment_max_depth);
    const commentMaxLength = getNumber(
      settings,
      'comment_max_length',
      DEFAULTS.comment_max_length
    );

    return NextResponse.json(
      {
        comment_max_depth: commentMaxDepth,
        comment_max_length: commentMaxLength,
      },
      {
        headers: {
          // 60s browser cache, 5-minute CDN cache — comment config
          // changes are rare; a stale read for one request cycle is fine.
          'Cache-Control': 'public, max-age=60, s-maxage=300',
        },
      }
    );
  } catch (err) {
    console.error('[settings.public] settings fetch failed; serving defaults:', err);
    return NextResponse.json(DEFAULTS);
  }
}
