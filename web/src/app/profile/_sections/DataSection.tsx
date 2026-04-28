// "Data & danger" — export your data + schedule deletion.

'use client';

import type { Tables } from '@/types/database-helpers';

import { DataCard } from '../settings/_cards/DataCard';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
}

export function DataSection({ user, preview }: Props) {
  return <DataCard user={user} preview={preview} />;
}
