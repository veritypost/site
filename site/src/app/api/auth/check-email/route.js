import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Pass 17 / UJ-708 — async "is this email taken?" check used by the
// signup form on email-field blur. Rate-limited per IP (30/hour) to
// prevent bulk enumeration. Calls the is_email_registered RPC added in
// migration 054.
export async function GET(request) {
  const url = new URL(request.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email || !email.includes('@') || email.length > 254) {
    return NextResponse.json({ available: true, checked: false });
  }

  try {
    const supabase = await createClient();
    const ip = await getClientIp();
    // F-031 — add a per-email cap alongside the per-IP cap. Proxy
    // rotation defeats IP-only limits, but global per-email caps are
    // host-independent. Ten probes per email per day is plenty for
    // signup-flow typos and well below a useful enumeration rate.
    const ipHit = await checkRateLimit(supabase, {
      key: `check_email:ip:${ip}`,
      max: 30,
      windowSec: 3600,
    });
    if (ipHit.limited) {
      return NextResponse.json({ available: true, checked: false }, { status: 429 });
    }
    const emailHit = await checkRateLimit(supabase, {
      key: `check_email:addr:${email}`,
      max: 10,
      windowSec: 86400,
    });
    if (emailHit.limited) {
      return NextResponse.json({ available: true, checked: false }, { status: 429 });
    }

    const service = createServiceClient();
    const { data: registered } = await service.rpc('is_email_registered', { p_email: email });
    return NextResponse.json({ available: !registered, checked: true });
  } catch {
    // Fail-open: signup server still validates on submit; a transient
    // RPC failure should not block typing.
    return NextResponse.json({ available: true, checked: false });
  }
}
