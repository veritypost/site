// Ext-AA1 — invite-gate stripped (owner decision 2026-04-25).
//
// This route used to intake waitlist applications when signup was
// gated. Launch posture is open signup, so the route is now a 410
// pointing callers at /signup. The `access_requests` table is left
// in place for back-compat with archived imports — DELETE it later if
// the table stays empty.
//
// Returning 410 (Gone) instead of 404 tells crawlers + cached forms
// the endpoint is permanently retired, not just temporarily missing.

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Access requests are no longer accepted.',
      action: 'sign_up',
      action_url: '/signup',
    },
    { status: 410 }
  );
}
