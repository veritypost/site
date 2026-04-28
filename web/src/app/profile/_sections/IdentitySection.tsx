// "Identity" — handle + display name. Bio moves to Public Profile because
// that's where it shows up. Email/password are in Security.

'use client';

import type { Tables } from '@/types/database-helpers';

import { IdentityCard } from '../settings/_cards/IdentityCard';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
  onUserUpdated?: (next: UserRow) => void;
}

export function IdentitySection({ user, preview, onUserUpdated }: Props) {
  return <IdentityCard user={user} preview={preview} onUserUpdated={onUserUpdated} />;
}
