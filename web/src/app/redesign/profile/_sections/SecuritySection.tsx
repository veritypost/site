// "Security" — email + password + 2FA in one focused section. Stacked
// cards in the order most users will hit them.

'use client';

import type { Tables } from '@/types/database-helpers';

import { S } from '../../_lib/palette';
import { EmailsCard } from '../settings/_cards/EmailsCard';
import { MFACard } from '../settings/_cards/MFACard';
import { PasswordCard } from '../settings/_cards/PasswordCard';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
}

export function SecuritySection({ user, preview }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <EmailsCard user={user} preview={preview} />
      <PasswordCard preview={preview} />
      <MFACard preview={preview} />
    </div>
  );
}
