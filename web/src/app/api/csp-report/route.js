// H-05 — CSP violation sink. The middleware emits
// `Content-Security-Policy` (enforce mode, flipped 2026-04-21) with
// `report-uri /api/csp-report`; browsers POST violation payloads here.
//
// Rate limit: per-instance sliding window. Serverless instances are
// short-lived so this won't catch storms across all instances, but it
// prevents a single session from generating thousands of invocations
// from one instance (the exact failure mode seen on 2026-04-30).
// Accepts at most MAX_PER_WINDOW reports per WINDOW_MS; excess requests
// return 204 immediately (still accepted, not logged).

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

let windowStart = Date.now();
let windowCount = 0;

export async function POST(req) {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount++;
  if (windowCount > MAX_PER_WINDOW) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const body = await req.text();
    console.warn('[csp-report]', body);
  } catch (err) {
    console.warn('[csp-report] failed to read body:', err?.message || err);
  }
  return new NextResponse(null, { status: 204 });
}
