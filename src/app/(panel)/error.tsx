'use client'

import { useState } from 'react'
import { KNAPP_PRIMÆR, KNAPP_SEKUNDÆR, Snurr } from '@/components/ui'
import Link from 'next/link'

/**
 * Feilgrensen inne i panelet. Rotens error.tsx står fortsatt, men den
 * erstatter hele layouten – og da forsvant menyen akkurat når man trengte å
 * komme seg et annet sted. Her blir menyen stående, og bare siden som feilet
 * byttes ut.
 *
 * Bruker `unstable_retry` framfor `reset` av samme grunn som roten: nesten
 * alle feil her kommer av at et eksternt API svarte dårlig, og da er det ny
 * henting som hjelper.
 */
export default function Feil({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  // Knyttet til feilen framfor et flagg: feiler nytt forsøk, kommer en ny
  // feil inn, og knappen skal virke igjen – ikke stå fast på «Prøver …».
  const [prøvdFor, settPrøvdFor] = useState<Error | null>(null)
  const prøver = prøvdFor === error

  return (
    <div role="alert" className="border-2 border-hm-red bg-[var(--flate-opp)]">
      <div className="hm-varselstriper h-1.5" aria-hidden="true" />
      <div className="space-y-3 px-5 py-5">
        <h1 className="hm-display text-2xl">Siden kunne ikke vises</h1>

        {/* Hele meldingen. Adminbordet har én bruker, og det er den som skal
            rette feilen – «en uventet feil oppstod» hjelper ingen. */}
        <p className="text-sm">{error.message || 'Ingen feilmelding fulgte med.'}</p>
        {error.digest && (
          <p className="text-xs text-[var(--blekk-svak)]">
            Feilkode <span className="hm-kode">{error.digest}</span> – står også i
            serverloggen på Vercel.
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={() => {
              settPrøvdFor(error)
              unstable_retry()
            }}
            disabled={prøver}
            className={KNAPP_PRIMÆR}
          >
            {prøver ? (
              <>
                <Snurr /> Prøver igjen …
              </>
            ) : (
              'Prøv igjen'
            )}
          </button>
          <Link href="/" className={KNAPP_SEKUNDÆR}>
            Til oversikten
          </Link>
        </div>
      </div>
    </div>
  )
}
