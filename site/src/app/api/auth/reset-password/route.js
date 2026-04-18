import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const ip = await getClientIp();
    const ipHit = await checkRateLimit(supabase, { key: `reset:ip:${ip}`, max: 5, windowSec: 3600 });
    if (ipHit.limited) {
      return NextResponse.json({ ok: true });
    }

    const emailHit = await checkRateLimit(supabase, {
      key: `reset:email:${email.toLowerCase()}`,
      max: 3,
      windowSec: 3600,
    });
    if (emailHit.limited) {
      return NextResponse.json({ ok: true });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3333';
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return NextResponse.json({ ok: true });
  }
}
