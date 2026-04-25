// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const supabase = await createClient();

    // Ext-X5 — capture user before signOut so we can invalidate this
    // session's push tokens. After signOut the session is gone and we
    // can't look the user up. Best-effort: a missing user (already
    // logged out) is a clean no-op.
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;

    await supabase.auth.signOut();

    // Mark all of this user's still-active push tokens as invalidated.
    // The column is checked by send-push when fanning out; setting
    // invalidated_at causes the next push to skip them. iOS re-registers
    // on next launch via the existing PushRegistration flow, so this
    // doesn't break legitimate re-login scenarios.
    if (userId) {
      try {
        const service = createServiceClient();
        await service
          .from('user_push_tokens')
          .update({ invalidated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .is('invalidated_at', null);
      } catch (e) {
        console.error('[logout] push-token invalidate failed (non-fatal):', e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[logout]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
