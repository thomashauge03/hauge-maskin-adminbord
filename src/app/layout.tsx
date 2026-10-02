import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Barlow_Condensed } from 'next/font/google'
import { Lukkar } from '@/components/lukkar'
import { Nokkelknapp } from '@/components/nokkelknapp'
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
  // Hjem-skjermen på iPhone. Svart statuslinje – samme svart som
  // innloggingssiden og themeColor.
  appleWebApp: { capable: true, title: 'Adminbord', statusBarStyle: 'black' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Uten cover er env(safe-area-inset-*) alltid 0, og bunnmenyen ville lagt
  // seg under streken nederst på iPhone i fullskjerm.
  viewportFit: 'cover',
  themeColor: '#0b0b0c',
}

export default function RotLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="nb"
      className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} h-full`}
      /* Lukkeren setter data-hm-lukkar på <html> før React tar over sida.
         Uten denne regnes attributtet som et avvik. Gjelder bare <html>
         selv, ikke det som ligger inni. */
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* Først i body, så platene er malt før noe annet rekker å vises, og
            nøkkelknappen lytter før Chrome sender porten fra appen. */}
        <Lukkar />
        <Nokkelknapp />
        {children}
      </body>
    </html>
  )
}
