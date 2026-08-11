'use client'

import { useActionState, useState } from 'react'
import type { CelleTilstand } from './tilgang-actions'
import type { SystemRolle } from '@/lib/tilgang'
import { FELT, KNAPP_FARLIG, KNAPP_LITEN, Merke } from '@/components/ui'

const start: CelleTilstand = {}

type Handling = (
  forrige: CelleTilstand,
  formData: FormData,
) => Promise<CelleTilstand>

/**
 * Én celle i matrisen: har personen tilgang til dette systemet, og med
 * hvilken rolle.
 *
 * Cellen er en knapp som utvider seg. Alternativet – en egen side per
 * person, eller et skjema over tabellen – ville betydd at man mister
 * oversikten i det øyeblikket man skal endre noe. Poenget med matrisen er
 * at man ser helheten mens man jobber i den.
 */
export function TilgangsCelle({
  epost,
  navn,
  systemNavn,
  harTilgang,
  sperret,
  roller,
  krevArPassord,
  gi,
  taBort,
}: {
  epost: string
  navn: string
  systemNavn: string
  harTilgang: boolean
  sperret: boolean
  roller: SystemRolle[]
  /**
   * Systemer nøklet på auth-id krever at brukeren finnes der først, og da
   * må vi kunne opprette den – altså trengs et midlertidig passord. De
   * e-postnøklede appene trenger det ikke.
   */
  krevArPassord: boolean
  gi: Handling
  taBort: () => Promise<void>
}) {
  const [åpen, settÅpen] = useState(false)
  const [tilstand, send, venter] = useActionState(gi, start)

  if (!åpen) {
    return (
      <button
        onClick={() => settÅpen(true)}
        title={`${harTilgang ? 'Endre eller fjerne' : 'Gi'} ${epost} tilgang til ${systemNavn}`}
        className="mx-auto block cursor-pointer rounded-none px-1 py-0.5 hover:bg-[var(--flate-2)]"
      >
        {!harTilgang ? (
          <span className="text-[var(--blekk-svak)]">–</span>
        ) : sperret ? (
          <Merke type="rød">sperret</Merke>
        ) : (
          <Merke type="grønn">ja</Merke>
        )}
      </button>
    )
  }

  const standard = roller.find((r) => r.erStandard)?.verdi ?? roller[0]?.verdi

  return (
    <div className="min-w-[13rem] space-y-2 border-2 border-hm-red bg-[var(--flate-opp)] p-2 text-left">
      <p className="text-xs font-bold">{systemNavn}</p>
      <p className="hm-kode text-[11px] text-[var(--blekk-svak)]">{epost}</p>

      <form action={send} className="space-y-1.5">
        <input type="hidden" name="epost" value={epost} />
        <input type="hidden" name="navn" value={navn} />

        {roller.length > 0 && (
          <select
            name="rolle"
            defaultValue={standard}
            className={`${FELT} py-1 text-sm`}
            aria-label={`Rolle i ${systemNavn}`}
          >
            {roller.map((r) => (
              <option key={r.verdi} value={r.verdi}>
                {r.etikett}
              </option>
            ))}
          </select>
        )}

        {krevArPassord && !harTilgang && (
          <input
            name="midlertidigPassord"
            type="text"
            autoComplete="off"
            placeholder="midlertidig passord"
            className={`${FELT} py-1 text-sm`}
            aria-label="Midlertidig passord"
          />
        )}

        <button type="submit" disabled={venter} className={`${KNAPP_LITEN} w-full`}>
          {venter ? 'Skriver …' : harTilgang ? 'Endre rolle' : 'Gi tilgang'}
        </button>
      </form>

      {harTilgang && (
        <form action={taBort}>
          <button type="submit" className={`${KNAPP_FARLIG} w-full`}>
            Ta bort tilgang
          </button>
        </form>
      )}

      {tilstand.feil && (
        <p role="alert" className="text-[11px] font-semibold text-hm-red-ink">
          {tilstand.feil}
        </p>
      )}
      {tilstand.ok && (
        <p role="status" className="text-[11px] font-semibold">
          {tilstand.ok}
        </p>
      )}

      <button onClick={() => settÅpen(false)} className={`${KNAPP_LITEN} w-full`}>
        Lukk
      </button>
    </div>
  )
}
