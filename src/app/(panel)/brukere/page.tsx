import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { krevAdmin } from '@/lib/auth'
import { hentSystemer } from '@/lib/data'
import { Kort, KortTittel, Seksjonstittel, TomTilstand } from '@/components/ui'
import { Brukerliste, BrukerlisteSkjelett } from './brukerliste'
import { NyBruker } from './ny-bruker'
import { Appkontoer, AppkontoerSkjelett } from './appkontoar'

export const metadata: Metadata = { title: 'Brukere' }

export default async function BrukereSide() {
  const meg = await krevAdmin()
  const systemer = await hentSystemer()
  const medDatabase = systemer.filter((s) => s.supabaseProsjektRef)

  return (
    <div className="space-y-7">
      <Seksjonstittel under="Hvem som slipper inn i mobilappen, og alle kontoer i alle systemene samlet på e-post.">
        Brukere
      </Seksjonstittel>

      {/*
        Appkøen står øverst fordi den er det eneste på siden noen venter på.
        Resten er oppslag; dette er noen som står uten tilgang til du svarer.
        Den henger ikke sammen med systemregisteret, og vises derfor også når
        ingen systemer har database.
      */}
      <Suspense fallback={<AppkontoerSkjelett />}>
        <Appkontoer erEier={meg.rolle === 'eier'} />
      </Suspense>

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
