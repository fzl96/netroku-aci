import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Bridge Domain Policy',
  description: 'Policy inventory of bridge domains across tenants and VRFs.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
