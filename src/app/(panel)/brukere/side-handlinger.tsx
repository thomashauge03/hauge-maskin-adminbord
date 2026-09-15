'use client'

import { useActionState, useState } from 'react'
import { FELT, KNAPP_FARLIG, KNAPP_LITEN, KNAPP_SEKUNDÆR } from '@/components/ui'
import type { BrukerTilstand } from './actions'
import { leggTilSide, endreSide, slettSide } from './side-actions'

const start: BrukerTilstand = {}

function Melding({ tilstand }: { tilstand: BrukerTilstand }) {
  if (tilstand.feil) return <p className="text-sm text-hm-red-ink">{tilstand.feil}</p>
  if (tilstand.ok) return <p className="text-sm text-[var(--blekk-svak)]">{tilstand.ok}</p>
  return null
}

function Felter({
  navn,
  url,
  gruppe,
  hjelp,
  grupper,
}: {
  navn?: string
  url?: string
  gruppe?: string
  hjelp?: string
  grupper: string[]
}) {
  return (
    <>
      <input name="navn" defaultValue={navn} required placeholder="Navn" className={FELT} />
      <input
        name="url"
        defaultValue={url}
        required
        type="url"
        placeholder="https://…"
        className={FELT}
      />
      {/* Fri tekst med forslag: gruppene som finnes er som regel riktige,
          men en ny gruppe skal ikke kreve at man først lager den et sted. */}
      <input
        name="gruppe"
        defaultValue={gruppe}
        required
        list="gruppeforslag"
        placeholder="Gruppe"
        className={FELT}
      />
      <datalist id="gruppeforslag">
        {grupper.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <input
        name="hjelp"
        defaultValue={hjelp}
        placeholder="Kort forklaring (valgfritt)"
        className={FELT}
      />
    </>
  )
}

/** Legg til en ny side. Skjult til man ber om den. */
export function NySide({ grupper }: { grupper: string[] }) {
  const [åpen, settÅpen] = useState(false)
  const [tilstand, send, lagrer] = useActionState(leggTilSide, start)

  if (!åpen) {
    return (
      <div className="px-4 py-3">
        <button onClick={() => settÅpen(true)} className={KNAPP_SEKUNDÆR}>
          Ny side
        </button>
        <Melding tilstand={tilstand} />
      </div>
    )
  }

  return (
    <form action={send} className="space-y-2 border-b-2 border-[var(--kant)] px-4 py-4">
      <Felter grupper={grupper} />
      <Melding tilstand={tilstand} />
      <div className="flex gap-2">
        <button type="submit" disabled={lagrer} className={KNAPP_SEKUNDÆR}>
          {lagrer ? 'Legger til …' : 'Legg til'}
        </button>
        <button type="button" onClick={() => settÅpen(false)} className={KNAPP_LITEN}>
          Avbryt
        </button>
      </div>
      <p className="text-xs text-[var(--blekk-svak)]">
        En ny side blir synlig for alle med én gang. Skal den bare gjelde noen,
        setter du den til «Bare utvalgte» etterpå.
      </p>
    </form>
  )
}

/**
 * Endre eller slette én side.
 *
 * Sletting bak en bekreftelse som sier hva som faktisk skjer. Den fjerner
 * siden for alle – også på PC – og rydder bort tilgangene til den. Det er
 * ikke reversibelt herfra.
 */
export function SideRedigering({
  sideId,
  navn,
  url,
  gruppe,
  hjelp,
  grupper,
}: {
  sideId: string
  navn: string
  url: string
  gruppe: string
  hjelp?: string
  grupper: string[]
}) {
  const [modus, settModus] = useState<'lukket' | 'endre' | 'slett'>('lukket')
  const [endreTilstand, sendEndre, endrer] = useActionState(
    endreSide.bind(null, { sideId }),
    start,
  )
  const [slettTilstand, sendSlett, sletter] = useActionState(
    slettSide.bind(null, { sideId, navn }),
    start,
  )

  if (modus === 'endre') {
    return (
      <form action={sendEndre} className="mt-3 w-full space-y-2">
        <Felter navn={navn} url={url} gruppe={gruppe} hjelp={hjelp} grupper={grupper} />
        <Melding tilstand={endreTilstand} />
        <div className="flex gap-2">
          <button type="submit" disabled={endrer} className={KNAPP_SEKUNDÆR}>
            {endrer ? 'Lagrer …' : 'Lagre'}
          </button>
          <button type="button" onClick={() => settModus('lukket')} className={KNAPP_LITEN}>
            Avbryt
          </button>
        </div>
      </form>
    )
  }

  if (modus === 'slett') {
    return (
      <div className="mt-3 w-full space-y-2">
        <p className="text-sm">
          Fjerne <strong>{navn}</strong> for godt? Den forsvinner for alle, også
          på PC, og tilgangene til den blir ryddet bort.
        </p>
        <Melding tilstand={slettTilstand} />
        <div className="flex gap-2">
          <form action={sendSlett}>
            <button type="submit" disabled={sletter} className={KNAPP_FARLIG}>
              {sletter ? 'Fjerner …' : 'Ja, fjern'}
            </button>
          </form>
          <button onClick={() => settModus('lukket')} className={KNAPP_LITEN}>
            Avbryt
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Melding tilstand={endreTilstand.ok ? endreTilstand : slettTilstand} />
      <button onClick={() => settModus('endre')} className={KNAPP_LITEN}>
        Endre
      </button>
      <button onClick={() => settModus('slett')} className={KNAPP_LITEN}>
        Slett
      </button>
    </div>
  )
}
