import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Most Informed — Verity Post',
  description: 'Readers who pass the most quizzes. Comprehension, not engagement, is the rank.',
  openGraph: {
    title: 'Most Informed — Verity Post',
    description: 'Readers who pass the most quizzes. Comprehension, not engagement, is the rank.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Most Informed — Verity Post',
    description: 'Readers who pass the most quizzes. Comprehension, not engagement, is the rank.',
  },
};

export default function LeaderboardLayout({ children }: { children: ReactNode }) {
  return children;
}
