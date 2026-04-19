// H-05 — CSP violation sink. The middleware emits
// `Content-Security-Policy-Report-Only` (Report-Only phase) with
// `report-uri /api/csp-report`; browsers POST violation payloads here.
// TODO(flip-2026-04-21): once middleware flips to enforce mode, this
// route stays valid — browsers continue to POST reports under the same
// directive in enforce mode.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.text();
    console.warn('[csp-report]', body);
  } catch (err) {
    console.warn('[csp-report] failed to read body:', err?.message || err);
  }
  return new NextResponse(null, { status: 204 });
}
