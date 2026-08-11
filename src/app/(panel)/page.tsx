import { Suspense } from 'react'
import Link from 'next/link'
import { krevAdmin } from '@/lib/auth'
import { hentSystemer } from '@/lib/data'
import { KNAPP_SEKUNDÆR, Seksjonstittel, TomTilstand } from '@/components/ui'
import { Statusdel, StatusSkjelett } from './status'
import { lesSortering, Sorteringsvelger } from './sortering'

export default async function Oversikt({
  searchParams,
}: {
  // searchParams er en Promise i Next 16. Synkron lesing er fjernet.
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  /*
   * Tilgangssjekken og systemlisten startes samtidig.
   *
   * krevAdmin er alt gjort i layouten og koster derfor ingenting her –
   * den er pakket i React `cache()`. Men hentSystemer er et ekte
   * databasekall, og det er ingen grunn til at det skal vente på en
   * sjekk som er ferdig. Hver runde man fjerner er merkbar på en side
   * som gjør flere på rad.
   */
  const [, systemer, params] = await Promise.all([
    krevAdmin(),
    hentSystemer(),
    searchParams,
  ])
  const sortering = lesSortering(params.sort)

  return (
    <div className="space-y-7">
      <Seksjonstittel
        under="Driftsstatus for alle Hauge Maskin-systemer. Hentes direkte fra Supabase og Vercel hver gang siden lastes."
        handling={
          <div className="flex flex-wrap items-center gap-3">
            {/* Bare vist når det er noe å sortere. Én valgmulighet på ett
                kort er støy. */}
            {systemer.length > 1 && <Sorteringsvelger aktiv={sortering} />}
            <Link href="/systemer" className={KNAPP_SEKUNDÆR}>
              Systemregister
            </Link>
          </div>
        }
      >
        Oversikt
      </Seksjonstittel>

      {systemer.length === 0 ? (
        <TomTilstand
          tittel="Ingen systemer registrert"
          handling={{ href: '/systemer', tekst: 'Legg til system' }}
        >
          Legg inn hvor databasene og Vercel-prosjektene ligger, så vises
          status her.
        </TomTilstand>
      ) : (
        /*
         * Suspense rundt statusdelen, ikke rundt hele siden.
         * Alternativet – loading.tsx – ville byttet ut tittelen og
         * knappene også, og da blinker menyen hver gang man går hit.
         */
        <Suspense fallback={<StatusSkjelett antall={systemer.length} />}>
          <Statusdel systemer={systemer} sortering={sortering} />
        </Suspense>
      )}
    </div>
  )
}
