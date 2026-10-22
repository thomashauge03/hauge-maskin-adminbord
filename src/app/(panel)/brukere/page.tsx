import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { krevAdmin } from '@/lib/auth'
import { hentSystemer } from '@/lib/data'
import { Seksjonstittel, TomTilstand } from '@/components/ui'
import { Brukerliste, BrukerlisteSkjelett } from './brukerliste'
import { NyBruker } from './ny-bruker'

export const metadata: Metadata = { title: 'Brukere' }

export default async function BrukereSide() {
  const meg = await krevAdmin()
  const systemer = await hentSystemer()
  const medDatabase = systemer.filter((s) => s.supabaseProsjektRef)

  return (
    <div className="space-y-7">
      <Seksjonstittel
        under={
          <>
            Alle kontoer i alle systemene samlet på e-post. Hvem som slipper inn i
            mobilappen, styres under{' '}
            <Link href="/appen" className="underline">
              Appen
            </Link>
            .
          </>
        }
      >
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
          {/* Lukket til man ber om det: å legge inn en helt ny person er
              sjeldent, og skjemaet sto før over det man kom for. Personer som
              alt finnes et sted, får tilgang fra personpanelet. */}
          {meg.rolle === 'eier' && (
            <details className="border-2 border-[var(--kant)] bg-[var(--flate-opp)]">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 py-2.5 text-sm font-semibold">
                + Ny bruker i et system
              </summary>
              <div className="border-t-2 border-[var(--kant)]">
                <NyBruker systemer={medDatabase} />
              </div>
            </details>
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
