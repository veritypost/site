// "Plan" — current subscription, change-plan link, manage-payment portal,
// cancel/resume. Privacy moved out into its own section because it
// doesn't belong next to billing.

'use client';

import type { Tables } from '@/types/database-helpers';

import { BillingCard } from '../settings/_cards/BillingCard';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
}

export function PlanSection({ user, preview }: Props) {
  return <BillingCard user={user} preview={preview} />;
}
