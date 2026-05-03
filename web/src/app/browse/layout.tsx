import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Browse stories · Verity Post',
  description: 'Browse breaking, developing, and resolved news stories on Verity Post.',
  openGraph: {
    title: 'Browse stories · Verity Post',
    description: 'Browse breaking, developing, and resolved news stories on Verity Post.',
  },
}

export default function BrowseLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
