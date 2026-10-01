import { Suspense } from 'react'
import type { Metadata } from 'next'
import { krevAdmin } from '@/lib/auth'
import { hentAppbrukere, hentForeldreløse, type Foreldreløs } from '@/lib/appbrukarar'
import { Brukerliste } from './brukerliste'
import { Foreldreløse } from './foreldrelose'

export const metadata: Metadata = { title: 'Appen' }

// Å godkjenne 200 er rundt 25 runder med 8 eksterne kall, og handlingen arver sidens grense.
export const maxDuration = 60

type Funn = { liste: Foreldreløs[]; feil: string | null }

export default async function AppenSide() {
  const meg = await krevAdmin()
  const erEier = meg.rolle === 'eier'

  // Startes før lista, så de to hentes samtidig – men ventes på hver for seg.
  const foreldreløse: Promise<Funn> = hentForeldreløse().then(
    (liste) => ({ liste, feil: null }),
    (e: unknown) => ({ liste: [], feil: e instanceof Error ? e.message : 'Ukjent feil' }),
  )
  const { brukere, grupper } = await hentAppbrukere()

  return (
    <div className="space-y-7">
      <Suspense fallback={null}>
        <Brukerliste brukere={brukere} grupper={grupper} erEier={erEier} />
      </Suspense>
      <Suspense fallback={null}>
        <ForeldreløseKort funn={foreldreløse} erEier={erEier} />
      </Suspense>
    </div>
  )
}

/**
 * Registreringer som ikke kom fram er sjelden feilsøking. De går gjennom
 * listUsers i Auth, som kan være treg, og skal verken holde lista tilbake
 * eller ta den med seg i fallet.
 */
async function ForeldreløseKort({ funn, erEier }: { funn: Promise<Funn>; erEier: boolean }) {
  const { liste, feil } = await funn
  return <Foreldreløse liste={liste} feil={feil} erEier={erEier} />
}
