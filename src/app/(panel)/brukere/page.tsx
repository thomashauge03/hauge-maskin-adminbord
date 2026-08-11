import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { krevAdmin } from '@/lib/auth'
import { hentSystemer } from '@/lib/data'
import { Kort, KortTittel, Seksjonstittel, TomTilstand } from '@/components/ui'
import { Brukerliste, BrukerlisteSkjelett } from './brukerliste'
import { NyBruker } from './ny-bruker'

export const metadata: Metadata = { title: 'Brukere' }

export default async function BrukereSide() {
  const meg = await krevAdmin()
  const systemer = await hentSystemer()
  const medDatabase = systemer.filter((s) => s.supabaseProsjektRef)

  return (
    <div className="space-y-7">
      <Seksjonstittel under="Alle kontoer i alle systemene, samlet på e-post. Listen leses gjennom Supabase sitt Management-API og krever ingen lagret nøkkel; å endre en konto gjør det.">
        Brukere
      </Seksjonstittel>

      {medDatabase.length === 0 ? (
        <TomTilstand
          tittel="Ingen systemer med database"
          handling={{ href: '/systemer', tekst: 'Til registeret' }}
        >
          Legg inn Supabase-prosjektreferansen på minst ett system for å se
          brukerne der.
        </TomTilstand>
      ) : (
        <>
          {meg.rolle === 'eier' && (
            <Kort>
              <KortTittel>Ny bruker i et system</KortTittel>
              <NyBruker systemer={medDatabase} />
            </Kort>
          )}

          <Suspense fallback={<BrukerlisteSkjelett />}>
            <Brukerliste systemer={systemer} erEier={meg.rolle === 'eier'} />
          </Suspense>

          <p className="text-sm text-[var(--blekk-svak)]">
            Målet er at alle systemene får samme innlogging. Veien dit står i{' '}
            <Link
              href="https://github.com/thomashauge03/hauge-maskin-adminbord/blob/main/docs/INNLOGGINGSPORTAL.md"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              docs/INNLOGGINGSPORTAL.md
            </Link>
            .
          </p>
        </>
      )}
    </div>
  )
}
