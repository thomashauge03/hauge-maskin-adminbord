import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Barlow_Condensed } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

// Prosjekt-ID-er og nøkler leses tegn for tegn. Monospace er ikke pynt her.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

// Kondensert og industriell – samme familie av former som logoen.
const barlow = Barlow_Condensed({
  variable: '--font-barlow',
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'HM Adminbord', template: '%s · HM Adminbord' },
  description: 'Driftsoversikt og brukerstyring for alle Hauge Maskin-systemer.',
  // Adminbordet skal ikke finnes i noen søkemotor. Hodet i
  // next.config.ts sier det samme – dette er beltet i tillegg til selen.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0c',
}

export default function RotLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="nb"
      className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
