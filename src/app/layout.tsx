// src/app/layout.tsx
import type { Metadata } from 'next'
import { inter, lora } from '@/lib/fonts'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Netroku ACI',
    template: '%s · Netroku ACI',
  },
  description:
    'Cisco ACI fabric management — endpoints, EPGs, bridge domains, static ports, and interface selectors.',
  applicationName: 'Netroku ACI',
  authors: [{ name: 'Furina' }],
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${lora.variable} h-full`}
    >
      <body className="h-full font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
