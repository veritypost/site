// "Privacy" — DM, visibility, hide-activity. Visibility is duplicated
// with Public Profile on purpose: it lives there as a preview-tied
// control AND here as a global privacy toggle. Saving in either place
// updates the same column.

'use client';

import type { Tables } from '@/types/database-helpers';

import { PrivacyCard } from '../settings/_cards/PrivacyCard';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
}

export function PrivacySection({ user, preview }: Props) {
  return <PrivacyCard user={user} preview={preview} />;
}
