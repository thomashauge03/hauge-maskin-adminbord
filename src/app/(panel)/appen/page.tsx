import { Suspense } from 'react'
import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentAppbrukere, hentForeldreløse, type Foreldreløs } from '@/lib/appbrukarar'
import { Brukerliste } from './brukerliste'
import { Foreldreløse } from './foreldrelose'

export const metadata: Metadata = { title: 'Appen' }

export default async function AppenSide() {
  const meg = await krevAdmin()

  // Registreringer som ikke kom fram er sjelden feilsøking, og skal ikke
  // kunne ta lista med seg i fallet.
  const [{ brukere, grupper }, foreldreløse] = await Promise.all([
    hentAppbrukere(),
    hentForeldreløse().then(
      (liste) => ({ liste, feil: null as string | null }),
      (e: unknown) => ({
        liste: [] as Foreldreløs[],
        feil: e instanceof Error ? e.message : 'Ukjent feil',
      }),
    ),
  ])

  return (
    <div className="space-y-7">
      <Suspense fallback={null}>
        <Brukerliste brukere={brukere} grupper={grupper} />
      </Suspense>
      <Foreldreløse
        liste={foreldreløse.liste}
        feil={foreldreløse.feil}
        erEier={meg.rolle === 'eier'}
      />
    </div>
  )
}
