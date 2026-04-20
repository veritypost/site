// H-05 — CSP violation sink. The middleware emits
// `Content-Security-Policy` (enforce mode, flipped 2026-04-21) with
// `report-uri /api/csp-report`; browsers POST violation payloads here.

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
