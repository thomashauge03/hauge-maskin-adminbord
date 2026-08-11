'use client'

import { KNAPP_PRIMÆR, KNAPP_SEKUNDÆR } from '@/components/ui'
import Link from 'next/link'

/**
 * Feilgrense. Må være en klientkomponent.
 *
 * Bruker `unstable_retry` framfor `reset`: reset nullstiller bare
 * feiltilstanden og rendrer på nytt med de samme dataene, mens
 * unstable_retry henter dem om igjen. Nesten alle feil her kommer av at
 * et eksternt API svarte dårlig, og da er det nettopp ny henting som
 * hjelper.
 */
export default function Feilside({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-lg">
        <span className="hm-skrastrek mb-4" aria-hidden="true" />
        <h1 className="hm-display text-3xl">Noe gikk galt</h1>

        {/* Feilmeldingen vises. Adminbordet har én bruker, og den
            brukeren er den som skal fikse feilen – å skjule teksten bak
            «en uventet feil oppstod» ville bare gjort jobben vanskeligere. */}
        <p className="mt-3 text-sm text-[var(--blekk-svak)]">
          {error.message || 'Ingen feilmelding fulgte med.'}
        </p>
        {error.digest && (
          <p className="hm-kode mt-1 text-xs text-[var(--blekk-svak)]">
            {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => unstable_retry()} className={KNAPP_PRIMÆR}>
            Prøv igjen
          </button>
          <Link href="/" className={KNAPP_SEKUNDÆR}>
            Til oversikten
          </Link>
        </div>
      </div>
    </main>
  )
}
