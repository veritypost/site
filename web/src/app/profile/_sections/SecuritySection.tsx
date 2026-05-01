// "Security" — email + 2FA (password is dormant — adults are OTP-only).
// Stacked cards in the order most users will hit them.

'use client';

import type { Tables } from '@/types/database-helpers';

import { S } from '../_lib/palette';
import { EmailsCard } from '../settings/_cards/EmailsCard';
import { MFACard } from '../settings/_cards/MFACard';
// PasswordCard intentionally not rendered (item 9) — adults are OTP-only per /login and /signup; the dormant card in _cards/PasswordCard.tsx stays on disk for future un-hide.

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
}

export function SecuritySection({ user, preview }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <EmailsCard user={user} preview={preview} />
      <MFACard preview={preview} />
    </div>
  );
}
