import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Search · Verity Post',
  description: 'Search Verity Post articles by keyword.',
  robots: { index: false, follow: false },
  openGraph: { title: 'Search · Verity Post', type: 'website' },
};
export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
