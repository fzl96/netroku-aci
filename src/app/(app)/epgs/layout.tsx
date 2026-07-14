import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'EPG',
  description: 'Deployed EPGs and their static port bindings across the fabric.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
