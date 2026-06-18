import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'EPGs',
  description: 'Browse and manage Endpoint Groups across the fabric.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
