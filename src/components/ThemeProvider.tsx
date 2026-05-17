'use client'

import {
  ThemeProvider as NextThemesProvider,
  useTheme,
} from 'next-themes'

export { useTheme }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
