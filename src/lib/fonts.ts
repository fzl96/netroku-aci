import localFont from 'next/font/local'

export const inter = localFont({
  src: '../assets/fonts/inter-latin-variable.woff2',
  variable: '--font-inter',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
})
export const lora = localFont({
  src: '../assets/fonts/lora-latin-variable.woff2',
  variable: '--font-lora',
  weight: '400 600',
  style: 'normal',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
})
