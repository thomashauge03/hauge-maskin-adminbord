'use client'

import { useActionState } from 'react'
import type { LiveTilstand } from './hold-i-live-action'
import { KNAPP_SEKUNDÆR } from '@/components/ui'

const start: LiveTilstand = {}

type Handling = (
  forrige: LiveTilstand,
  formData: FormData,
) => Promise<LiveTilstand>

/**
 * «Hold i live»-knappen.
 *
 * Loggen vises ALLTID, også når det gikk bra. Poenget med knappen er ikke
 * å bli ferdig, men å vite hva som skjedde – og en knapp som bare sier
 * «gjort» er den varianten man ikke kan feilsøke.
 */
export function HoldILive({ handling }: { handling: Handling }) {
  const [tilstand, send, venter] = useActionState(handling, start)

  return (
    <div className="space-y-2">
      <form action={send}>
        <button type="submit" disabled={venter} className={KNAPP_SEKUNDÆR}>
          {venter ? 'Sender livstegn …' : 'Hold databasen i live'}
        </button>
      </form>

      <p className="text-xs text-[var(--blekk-svak)]">
        Sender <span className="hm-kode">GET /auth/v1/health</span> til
        prosjektet. Leser ingen data og endrer ingenting, men gir databasen
        et livstegn slik at pause-klokka nullstilles.
      </p>

      {tilstand.ok && (
        <p
          role="status"
          className="border-l-4 border-hm-green bg-hm-green/10 p-3 text-sm"
        >
          {tilstand.ok}
        </p>
      )}
      {tilstand.feil && (
        <p
          role="alert"
          className="border-l-4 border-hm-red bg-hm-red/10 p-3 text-sm font-semibold text-hm-red-ink"
        >
          {tilstand.feil}
        </p>
      )}

      {tilstand.logg && tilstand.logg.length > 0 && (
        <details className="border-2 border-[var(--kant)] bg-[var(--flate-2)]">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold tracking-widest uppercase">
            Hva skjedde ({tilstand.logg.length} steg)
          </summary>
          <ol className="space-y-1 px-3 pb-3 text-xs">
            {tilstand.logg.map((l, i) => (
              <li key={i} className="hm-kode text-[var(--blekk-svak)]">
                {i + 1}. {l}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}
