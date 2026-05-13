import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Sections — Verity Post',
  description:
    'Browse Verity Post by section, subcategory, and Editor’s Edge picks.',
};

export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return children;
}
