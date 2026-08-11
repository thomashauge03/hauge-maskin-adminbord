import { Suspense } from 'react'
import Link from 'next/link'
import { krevAdmin } from '@/lib/auth'
import { hentSystemer } from '@/lib/data'
import { KNAPP_SEKUNDÆR, Seksjonstittel, TomTilstand } from '@/components/ui'
import { Statusdel, StatusSkjelett } from './status'

export default async function Oversikt() {
  await krevAdmin()
  const systemer = await hentSystemer()

  return (
    <div className="space-y-7">
      <Seksjonstittel
        under="Driftsstatus for alle Hauge Maskin-systemer. Hentes direkte fra Supabase og Vercel hver gang siden lastes."
        handling={
          <Link href="/systemer" className={KNAPP_SEKUNDÆR}>
            Systemregister
          </Link>
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
          <Statusdel systemer={systemer} />
        </Suspense>
      )}
    </div>
  )
}
