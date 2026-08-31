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
export function HoldILive({
  handling,
  start: startHandling,
  pauset,
}: {
  handling: Handling
  /** Sett når prosjektet kan startes igjen. */
  start?: Handling
  pauset: boolean
}) {
  const [tilstand, send, venter] = useActionState(handling, start)
  const [startTilstand, sendStart, starter] = useActionState(
    startHandling ?? handling,
    start,
  )

  // Den sist utførte handlingen eier meldingsfeltet. To sett meldinger under
  // hverandre er uleselig, og de gjelder to ulike ting.
  const vist =
    startTilstand.ok || startTilstand.feil ? startTilstand : tilstand

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Et livstegn til en PAUSET base gjør ingenting. Knappen skjules
            ikke – da ser det ut som noe mangler – men den er ikke den man
            skal trykke, og rekkefølgen sier det. */}
        {pauset && startHandling && (
          <form action={sendStart}>
            <button type="submit" disabled={starter} className={KNAPP_SEKUNDÆR}>
              {starter ? 'Starter …' : 'Start prosjektet igjen'}
            </button>
          </form>
        )}
        <form action={send}>
          <button type="submit" disabled={venter} className={KNAPP_SEKUNDÆR}>
            {venter ? 'Sender livstegn …' : 'Hold databasen i live'}
          </button>
        </form>
      </div>

      <p className="text-xs text-[var(--blekk-svak)]">
        Kjører <span className="hm-kode">select 1</span> mot databasen og et
        anon-kall mot <span className="hm-kode">/rest/v1</span> med{' '}
        <span className="hm-kode">limit=0</span>. Leser ingen data, men treffer
        Postgres – og det er den trafikktypen prosjektene som holder seg oppe
        har. Et rent <span className="hm-kode">/auth/v1/health</span> sto her
        før, og det rører aldri databasen: utleie ble pauset med et loggført
        HTTP 200 fra samme uke.
      </p>

      {pauset && (
        <p className="border-l-4 border-hm-amber bg-hm-amber/10 p-3 text-sm">
          Prosjektet står som pauset. Et livstegn hjelper ikke da – det må
          startes igjen først. Merk at gratisplanen tillater to aktive prosjekt
          per Supabase-konto: er kontoen full, må et annet pauses.
        </p>
      )}

      {vist.ok && (
        <p
          role="status"
          className="border-l-4 border-hm-green bg-hm-green/10 p-3 text-sm"
        >
          {vist.ok}
        </p>
      )}
      {vist.feil && (
        <p
          role="alert"
          className="border-l-4 border-hm-red bg-hm-red/10 p-3 text-sm font-semibold text-hm-red-ink"
        >
          {vist.feil}
        </p>
      )}

      {vist.logg && vist.logg.length > 0 && (
        <details className="border-2 border-[var(--kant)] bg-[var(--flate-2)]">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold tracking-widest uppercase">
            Hva skjedde ({vist.logg.length} steg)
          </summary>
          <ol className="space-y-1 px-3 pb-3 text-xs">
            {vist.logg.map((l, i) => (
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
