import type { Metadata } from 'next';

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
  },
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
