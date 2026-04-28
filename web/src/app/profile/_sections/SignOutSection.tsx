// Sign out. Lives as a section so the rail has a single canonical place
// to log out from, instead of stranding the action in a header menu the
// user has to hunt for.

'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

import { Card } from '../_components/Card';
import { buttonDangerStyle, buttonSecondaryStyle } from '../_components/Field';
import { useToast } from '../_components/Toast';

interface Props {
  preview: boolean;
}

export function SignOutSection({ preview }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<'this' | 'all' | null>(null);

  const signOut = async (scope: 'local' | 'global') => {
    if (preview) {
      toast.info('Sign in on :3333 first — preview mode has no session.');
      return;
    }
    setBusy(scope === 'global' ? 'all' : 'this');
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.location.href = '/';
  };

  return (
    <Card
      title="Sign out"
      description="End this session, or sign out of every device on your account."
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => signOut('local')}
          disabled={busy !== null}
          style={buttonSecondaryStyle}
        >
          {busy === 'this' ? 'Signing out…' : 'Sign out of this device'}
        </button>
        <button
          type="button"
          onClick={() => signOut('global')}
          disabled={busy !== null}
          style={buttonDangerStyle}
        >
          {busy === 'all' ? 'Signing out…' : 'Sign out everywhere'}
        </button>
      </div>
    </Card>
  );
}
